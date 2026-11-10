import { CopyPasteOverridesModal } from './components/CopyPasteOverridesModal';
import { CrashRestoreBanner } from './components/CrashRestoreBanner';
import { DropZone } from './components/DropZone';
import { HistoryModal } from './components/HistoryModal';
import { MonitorDock } from './components/MonitorDock';
import { PostActionCountdownModal } from './components/PostActionCountdownModal';
import { PreflightModal } from './components/PreflightModal';
import { ScheduleModal } from './components/ScheduleModal';
import { SoundSettingsModal } from './components/SoundSettingsModal';
import { Toolbar } from './components/Toolbar';
import { useQueueStore } from './store/queueStore';

import React, { useEffect } from 'react';

export default function App() {
  const { loadBlenders, initIpcListeners } = useQueueStore();

  useEffect(() => {
    loadBlenders();
    const unsub = initIpcListeners();
    return () => unsub();
  }, [loadBlenders, initIpcListeners]);

  return (
    <div className="flex h-screen flex-col bg-rn-bg text-rn-text antialiased font-sans overflow-hidden">
      {/* Top Application Toolbar */}
      <Toolbar />

      {/* Crash Restore Alert Banner */}
      <CrashRestoreBanner />

      {/* Main Queue & Drop Area */}
      <DropZone />

      {/* Bottom Monitor Dock */}
      <MonitorDock />

      {/* Modals & Overlays */}
      <PostActionCountdownModal />
      <SoundSettingsModal />
      <HistoryModal />
      <ScheduleModal />
      <CopyPasteOverridesModal />
      <PreflightModal />
    </div>
  );
}
