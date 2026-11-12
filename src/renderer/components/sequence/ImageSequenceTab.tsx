import { useQueueStore } from '../../store/queueStore';
import { SequenceConverter } from './SequenceConverter';
import { SequenceViewer } from './SequenceViewer';

import React, { useEffect, useState } from 'react';

import { ChevronDown, Film, FolderOpen, Video } from 'lucide-react';

export const ImageSequenceTab: React.FC = () => {
  const {
    jobs,
    activeSequence,
    sequenceError,
    setActiveSequence,
    loadSequenceFromPath,
    monitorStats,
  } = useQueueStore();

  const [showConverter, setShowConverter] = useState<boolean>(false);

  const completedImageJobs = jobs.filter(
    (j) =>
      (j.status === 'Completed' || (j.completedFrames && j.completedFrames > 0)) &&
      !j.isVideo &&
      (j.outputPreview || j.outputPathPattern),
  );

  // Auto-load most recent render output on mount if none loaded yet
  useEffect(() => {
    if (!activeSequence && !sequenceError) {
      if (monitorStats.lastThumbnailPath) {
        const refJob = completedImageJobs[0] ?? jobs[0];
        void loadSequenceFromPath(monitorStats.lastThumbnailPath, refJob?.filePath);
      } else if (completedImageJobs.length > 0) {
        const first = completedImageJobs[0];
        const target = first.outputPreview || first.outputPathPattern;
        void loadSequenceFromPath(target, first.filePath);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenFolder = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectDirectory();
      if (selected) {
        await loadSequenceFromPath(selected);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col p-3 bg-rn-bg overflow-y-auto space-y-3 min-h-0">
      {/* Top Banner with Quick Select Chips */}
      {completedImageJobs.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-rn-panel border border-rn-border rounded-xl text-xs flex-shrink-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1 overflow-x-auto py-0.5">
            <span className="font-medium text-rn-text text-xs flex-shrink-0 flex items-center space-x-1.5">
              <Film className="w-3.5 h-3.5 text-rn-accent" />
              <span>Finished Renders</span>
            </span>

            <div className="flex items-center space-x-1.5 min-w-0">
              {completedImageJobs.map((j) => {
                const target = j.outputPreview || j.outputPathPattern;
                const isActive =
                  activeSequence &&
                  ((j.outputPreview &&
                    activeSequence.directory.includes(
                      j.outputPreview.replace(/[/\\][^/\\]+$/, ''),
                    )) ||
                    (j.fileName &&
                      activeSequence.baseName.includes(j.fileName.replace(/\.blend$/, ''))));

                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => void loadSequenceFromPath(target, j.filePath)}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs transition border flex-shrink-0 ${
                      isActive
                        ? 'bg-rn-accent/15 border-rn-accent/50 text-rn-accent font-semibold'
                        : 'bg-rn-subpanel border-rn-border text-rn-text hover:border-rn-muted'
                    }`}
                    title={`Load output from ${j.fileName} (${j.selectedScene})`}
                  >
                    <span>{j.fileName}</span>
                    <span className="text-[10px] text-rn-muted font-mono">({j.selectedScene})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rn-subpanel hover:border-rn-muted border border-rn-border text-rn-text text-xs transition flex-shrink-0 ml-2"
            title="Browse any folder on disk"
          >
            <FolderOpen className="w-3.5 h-3.5 text-rn-muted" />
            <span>Browse Folder...</span>
          </button>
        </div>
      )}

      {/* Main Player Viewport: Full Height & Focus */}
      <div className="flex-1 flex flex-col min-h-[380px]">
        <SequenceViewer
          sequence={activeSequence}
          errorMessage={sequenceError}
          onSelectSequence={(seq) => setActiveSequence(seq)}
        />
      </div>

      {/* Collapsible Export to Video Tool */}
      <div className="flex-shrink-0 bg-rn-panel border border-rn-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowConverter((s) => !s)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-rn-panel hover:bg-rn-subpanel/70 transition text-xs font-medium text-rn-text select-none"
        >
          <div className="flex items-center space-x-2">
            <Video className="w-4 h-4 text-rn-accent" />
            <span>Export Sequence to Video (MP4 / ProRes)</span>
          </div>
          <div className="flex items-center space-x-1 text-rn-muted text-[11px]">
            <span>{showConverter ? 'Hide Options' : 'Export Options'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showConverter ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {showConverter && (
          <div className="p-3 border-t border-rn-border">
            <SequenceConverter sequence={activeSequence} />
          </div>
        )}
      </div>
    </div>
  );
};
