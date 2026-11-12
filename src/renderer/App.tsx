import { ComponentsShowcase } from './components/ComponentsShowcase';
import { CopyPasteOverridesModal } from './components/CopyPasteOverridesModal';
import { CrashRestoreBanner } from './components/CrashRestoreBanner';
import { HistoryModal } from './components/HistoryModal';
import { HistoryView } from './components/HistoryView';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { LeftNavRail } from './components/LeftNavRail';
import { MonitorDock } from './components/MonitorDock';
import { PostActionCountdownModal } from './components/PostActionCountdownModal';
import { PreflightModal } from './components/PreflightModal';
import { QueueWorkspace } from './components/QueueWorkspace';
import { ScheduleModal } from './components/ScheduleModal';
import { SettingsModal } from './components/SettingsModal';
import { SettingsView } from './components/SettingsView';
import { SoundSettingsModal } from './components/SoundSettingsModal';
import { Toolbar } from './components/Toolbar';
import { ImageSequenceTab } from './components/sequence/ImageSequenceTab';
import { useQueueStore } from './store/queueStore';

import React, { useEffect } from 'react';

export default function App() {
  const {
    loadBlenders,
    initIpcListeners,
    activeTab,
    setActiveTab,
    selectedJobId,
    selectedJobIds,
    removeJob,
    removeSelectedJobs,
    duplicateJob,
    copyOverrides,
    pasteOverrides,
    copiedOverrides,
    selectAllJobs,
    clearJobSelection,
    startQueueWithPreflight,
    pauseQueue,
    resumeQueue,
    queueState,
    addFiles,
    showShortcutsModal,
    setShowShortcutsModal,
    setShowScheduleModal,
  } = useQueueStore();

  useEffect(() => {
    loadBlenders();
    const unsub = initIpcListeners();
    return () => unsub();
  }, [loadBlenders, initIpcListeners]);

  // Global Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).closest('input, textarea, select');
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // '?' opens shortcuts sheet when not typing
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      if (e.key === 'Escape') {
        clearJobSelection();
        return;
      }

      if (isCmdOrCtrl) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('queue');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('history');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('sequences');
        } else if (e.key === ',') {
          e.preventDefault();
          setActiveTab('settings');
        } else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          if (window.rnApi) {
            const files = await window.rnApi.selectBlendFiles();
            if (files && files.length > 0) {
              await addFiles(files);
            }
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (queueState === 'running') {
            pauseQueue();
          } else if (queueState === 'paused') {
            resumeQueue();
          } else {
            startQueueWithPreflight();
          }
        } else if (e.key === 'a' || e.key === 'A') {
          if (!isInput) {
            e.preventDefault();
            selectAllJobs();
          }
        } else if (e.key === 'd' || e.key === 'D') {
          if (!isInput && selectedJobId) {
            e.preventDefault();
            duplicateJob(selectedJobId);
          }
        } else if (e.key === 'c' || e.key === 'C') {
          if (!isInput && selectedJobId) {
            e.preventDefault();
            copyOverrides(selectedJobId);
          }
        } else if (e.key === 'v' || e.key === 'V') {
          if (!isInput && copiedOverrides) {
            e.preventDefault();
            pasteOverrides(selectedJobIds.length > 0 ? selectedJobIds : undefined);
          }
        } else if (e.key === 's' || e.key === 'S') {
          if (!isInput) {
            e.preventDefault();
            setShowScheduleModal(true);
          }
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedJobIds.length > 1) {
          e.preventDefault();
          removeSelectedJobs();
        } else if (selectedJobId) {
          e.preventDefault();
          removeJob(selectedJobId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    selectedJobId,
    selectedJobIds,
    copiedOverrides,
    queueState,
    addFiles,
    clearJobSelection,
    selectAllJobs,
    removeJob,
    removeSelectedJobs,
    duplicateJob,
    copyOverrides,
    pasteOverrides,
    startQueueWithPreflight,
    pauseQueue,
    resumeQueue,
    setActiveTab,
    setShowShortcutsModal,
    setShowScheduleModal,
  ]);

  return (
    <div className="flex h-screen w-screen flex-col bg-rn-bg text-rn-text antialiased font-sans text-xs select-none overflow-hidden">
      {/* Top Application Toolbar (48px) */}
      <Toolbar />

      {/* Crash Restore Alert Banner */}
      <CrashRestoreBanner />

      {/* Main Workspace Body with Left Nav Rail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Rail (56px) */}
        <LeftNavRail />

        {/* View Routing */}
        {activeTab === 'queue' && <QueueWorkspace />}
        {activeTab === 'history' && <HistoryView />}
        {(activeTab === 'sequences' || (activeTab as string) === 'sequence') && (
          <ImageSequenceTab />
        )}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'components' && <ComponentsShowcase />}
      </div>

      {/* Bottom Collapsible Monitor Dock */}
      <MonitorDock />

      {/* Modals & Overlays */}
      <PostActionCountdownModal />
      <SoundSettingsModal />
      <HistoryModal />
      <ScheduleModal />
      <CopyPasteOverridesModal />
      <PreflightModal />
      <SettingsModal />
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
}
