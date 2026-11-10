import type { ImageSequenceInfo } from '../../../core/schemas/sequence';

import React from 'react';

export interface SequenceConverterProps {
  sequence: ImageSequenceInfo | null;
}

export const SequenceConverter: React.FC<SequenceConverterProps> = ({ sequence: _sequence }) => {
  return (
    <div className="bg-rn-panel border border-rn-border rounded-lg p-4">
      <div className="flex items-center justify-between pb-3 border-b border-rn-border mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rn-text">
          Convert / Stitch Sequence to Video
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <label className="text-rn-muted block mb-1">Format</label>
          <select className="w-full bg-rn-input border border-rn-border rounded p-1.5 text-rn-text">
            <option>MP4 (H.264)</option>
            <option>MP4 (H.265)</option>
            <option>WebM</option>
            <option>Apple ProRes</option>
          </select>
        </div>
        <div>
          <label className="text-rn-muted block mb-1">Resolution</label>
          <input
            type="text"
            placeholder="Original (e.g. 1920x1080)"
            className="w-full bg-rn-input border border-rn-border rounded p-1.5 text-rn-text"
          />
        </div>
        <div>
          <label className="text-rn-muted block mb-1">Quality</label>
          <select className="w-full bg-rn-input border border-rn-border rounded p-1.5 text-rn-text">
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button className="px-4 py-1.5 bg-rn-accent text-white text-xs font-medium rounded hover:brightness-110">
          Stitch to Video
        </button>
      </div>
    </div>
  );
};
