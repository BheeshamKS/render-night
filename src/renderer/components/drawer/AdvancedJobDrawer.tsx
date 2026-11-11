import { type QueueJob } from '../../store/queueStore';
import { AllPropertiesTree } from './AllPropertiesTree';
import { OutputPropertiesTab } from './OutputPropertiesTab';
import { PresetToolbar } from './PresetToolbar';
import { RenderPropertiesTab } from './RenderPropertiesTab';

import React, { useState } from 'react';

import { Sliders, Video } from 'lucide-react';

export interface AdvancedJobDrawerProps {
  job: QueueJob;
}

export const AdvancedJobDrawer: React.FC<AdvancedJobDrawerProps> = ({ job }) => {
  const [activeTab, setActiveTab] = useState<'render' | 'output'>('render');

  const overrideKeys = Object.keys(job.overrides || {});
  const modifiedCount = overrideKeys.length;

  return (
    <div className="mt-3 rounded border border-rn-border bg-rn-panel shadow-md overflow-hidden text-xs">
      {/* Top Preset & Actions Toolbar */}
      <PresetToolbar job={job} />

      {/* Tabs Switcher Bar */}
      <div className="flex items-center justify-between border-b border-rn-border bg-rn-subpanel px-3">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('render')}
            className={`flex items-center space-x-1.5 py-2 px-3 font-medium transition border-b-2 ${
              activeTab === 'render'
                ? 'border-rn-accent text-rn-text bg-rn-panel/50'
                : 'border-transparent text-rn-muted hover:text-rn-text'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Render Properties</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`flex items-center space-x-1.5 py-2 px-3 font-medium transition border-b-2 ${
              activeTab === 'output'
                ? 'border-rn-accent text-rn-text bg-rn-panel/50'
                : 'border-transparent text-rn-muted hover:text-rn-text'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Output Properties</span>
          </button>
        </div>

        {/* Override Badge Summary */}
        <div className="flex items-center space-x-2">
          {modifiedCount > 0 ? (
            <span className="rounded bg-rn-accent/20 border border-rn-accent/40 px-2 py-0.5 text-[11px] font-mono text-rn-accent">
              {modifiedCount} override{modifiedCount === 1 ? '' : 's'} active
            </span>
          ) : (
            <span className="text-[11px] text-rn-muted">File defaults active</span>
          )}
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="p-1">
        {activeTab === 'render' ? (
          <RenderPropertiesTab job={job} />
        ) : (
          <OutputPropertiesTab job={job} />
        )}

        {/* All Properties Tree (RNA introspected schema) */}
        <div className="px-3 pb-3">
          <AllPropertiesTree job={job} />
        </div>
      </div>
    </div>
  );
};
