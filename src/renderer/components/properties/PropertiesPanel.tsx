import { useQueueStore } from '../../store/queueStore';
import { AllPropertiesTree } from '../drawer/AllPropertiesTree';
import { OutputPropertiesTab } from '../drawer/OutputPropertiesTab';
import { PresetToolbar } from '../drawer/PresetToolbar';
import { RenderPropertiesTab } from '../drawer/RenderPropertiesTab';
import { JobSettingsTab } from './JobSettingsTab';

import React, { useCallback, useRef } from 'react';

import { Camera, FolderOutput, Layers, ListTree, Sliders, SlidersHorizontal } from 'lucide-react';

export const PropertiesPanel: React.FC = () => {
  const {
    jobs,
    selectedJobId,
    propertiesTab,
    setPropertiesTab,
    propertiesPanelWidth,
    setPropertiesPanelWidth,
  } = useQueueStore();

  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(propertiesPanelWidth);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const overrideCount = selectedJob ? Object.keys(selectedJob.overrides || {}).length : 0;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isResizingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = propertiesPanelWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        const deltaX = startXRef.current - moveEvent.clientX;
        const newWidth = Math.max(280, Math.min(600, startWidthRef.current + deltaX));
        setPropertiesPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [propertiesPanelWidth, setPropertiesPanelWidth],
  );

  const tabs = [
    { id: 'render' as const, label: 'Render', icon: Camera, tooltip: 'Render Engine & Sampling' },
    {
      id: 'output' as const,
      label: 'Output',
      icon: FolderOutput,
      tooltip: 'Resolution, Format & Color',
    },
    {
      id: 'job' as const,
      label: 'Job',
      icon: SlidersHorizontal,
      tooltip: 'Scene, Camera & Crash Policy',
    },
    { id: 'all' as const, label: 'All RNA', icon: ListTree, tooltip: 'Inspect all RNA properties' },
  ];

  return (
    <aside
      style={{ width: `${propertiesPanelWidth}px` }}
      className="relative flex h-full flex-shrink-0 flex-col border-l border-rn-border bg-rn-panel select-none z-10"
    >
      {/* Draggable Left Resize Splitter Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-rn-accent/40 active:bg-rn-accent transition-colors z-20"
        title="Drag to resize Properties editor"
      />

      {/* Header: Selected Job Overview */}
      <div className="flex items-center justify-between border-b border-rn-border bg-[#222222] px-3 py-2">
        <div className="flex items-center space-x-2 truncate">
          <Sliders className="h-4 w-4 text-rn-accent flex-shrink-0" />
          <span className="text-xs font-semibold text-rn-text truncate">
            {selectedJob ? selectedJob.fileName : 'Properties'}
          </span>
        </div>

        {selectedJob && (
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {overrideCount > 0 ? (
              <span className="rounded bg-rn-accent/20 border border-rn-accent/40 px-1.5 py-0.5 text-[10px] font-mono text-rn-accent font-medium">
                {overrideCount} override{overrideCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-[10px] text-rn-muted italic">Defaults</span>
            )}
          </div>
        )}
      </div>

      {selectedJob ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Vertical Icon Tab Strip (Blender Style) */}
          <div className="flex w-9 flex-shrink-0 flex-col items-center border-r border-rn-border bg-[#1c1c1c] py-2 space-y-1">
            {tabs.map((tab) => {
              const isActive = propertiesTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPropertiesTab(tab.id as 'render' | 'output' | 'job')}
                  className={`group relative flex h-7 w-7 items-center justify-center rounded transition ${
                    isActive
                      ? 'bg-rn-accent text-white shadow-sm'
                      : 'text-rn-muted hover:bg-rn-subpanel hover:text-rn-text'
                  }`}
                  title={tab.tooltip}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {/* Tab Content Body */}
          <div className="flex flex-1 flex-col overflow-hidden bg-rn-panel">
            {/* Presets Toolbar */}
            <PresetToolbar job={selectedJob} />

            {/* Scrollable Tab Panel */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {propertiesTab === 'render' && <RenderPropertiesTab job={selectedJob} />}
              {propertiesTab === 'output' && <OutputPropertiesTab job={selectedJob} />}
              {propertiesTab === 'job' && <JobSettingsTab job={selectedJob} />}
              {propertiesTab === 'all' && <AllPropertiesTree job={selectedJob} />}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-rn-muted">
          <Layers className="h-8 w-8 text-rn-muted/40 mb-2" />
          <p className="text-xs font-medium text-rn-text">No Job Selected</p>
          <p className="text-[11px] mt-1 text-rn-muted max-w-[200px]">
            Select a job from the queue to edit render properties, output paths, and crash policies.
          </p>
        </div>
      )}
    </aside>
  );
};
