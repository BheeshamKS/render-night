import type { ImageSequenceInfo } from '../../../core/schemas/sequence';
import { useQueueStore } from '../../store/queueStore';
import { SequenceConverter } from './SequenceConverter';
import { SequenceViewer } from './SequenceViewer';

import React, { useState } from 'react';

import { Film } from 'lucide-react';

export const ImageSequenceTab: React.FC = () => {
  const { jobs } = useQueueStore();
  const [currentSequence, setCurrentSequence] = useState<ImageSequenceInfo | null>(null);

  const completedImageJobs = jobs.filter(
    (j) => j.status === 'Completed' && !j.isVideo && (j.outputPreview || j.outputPathPattern),
  );

  const handleSelectJobOutput = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const jobId = e.target.value;
    if (!jobId) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    if (typeof window !== 'undefined' && window.rnApi) {
      const detected = await window.rnApi.detectSequence(
        job.outputPreview || job.outputPathPattern,
      );
      if (detected) {
        setCurrentSequence(detected);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 bg-rn-bg overflow-y-auto space-y-4">
      {/* Top Banner with Quick Load from Queue */}
      {completedImageJobs.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-rn-panel border border-rn-border rounded-lg text-xs">
          <div className="flex items-center space-x-2 text-rn-text">
            <Film className="w-4 h-4 text-rn-accent" />
            <span className="font-medium">Finished Render Jobs:</span>
          </div>
          <select
            onChange={handleSelectJobOutput}
            defaultValue=""
            className="rounded border border-rn-border bg-rn-input px-2.5 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none"
          >
            <option value="" disabled>
              Load output from completed job...
            </option>
            {completedImageJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.fileName} ({j.selectedScene})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Grid Layout: Top Viewer, Bottom Converter */}
      <div className="flex-1 flex flex-col space-y-4 min-h-0">
        <div className="h-[420px] flex-shrink-0">
          <SequenceViewer sequence={currentSequence} onSelectSequence={setCurrentSequence} />
        </div>
        <div className="flex-1 min-h-[300px]">
          <SequenceConverter sequence={currentSequence} />
        </div>
      </div>
    </div>
  );
};
