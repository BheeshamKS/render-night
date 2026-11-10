import { useQueueStore } from '../store/queueStore';
import { JobCard } from './JobCard';

import React from 'react';

import { UploadCloud } from 'lucide-react';

export const DropZone: React.FC = () => {
  const { jobs, isDraggingOver, setIsDraggingOver, addFiles } = useQueueStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files: string[] = [];
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        // Electron webUtils or file.path gives absolute path
        const path = (file as unknown as { path?: string }).path || file.name;
        if (path) files.push(path);
      }
    }

    if (files.length > 0) {
      await addFiles(files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex-1 overflow-y-auto bg-rn-bg p-4 transition-colors ${
        isDraggingOver ? 'bg-rn-subpanel/40 ring-2 ring-inset ring-rn-accent' : ''
      }`}
    >
      {/* Full-window drop overlay when dragging */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rn-bg/85 backdrop-blur-sm pointer-events-none border-2 border-dashed border-rn-accent m-2 rounded-lg">
          <UploadCloud className="h-16 w-16 text-rn-accent animate-bounce" />
          <p className="mt-2 text-base font-semibold text-rn-text">
            Drop .blend files to add to queue
          </p>
        </div>
      )}

      {/* Empty State */}
      {jobs.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center text-rn-muted select-none">
          <UploadCloud className="h-16 w-16 stroke-[1.2] opacity-30 mb-3" />
          <h3 className="text-sm font-medium text-rn-text">Render Queue is Empty</h3>
          <p className="mt-1 text-xs text-rn-muted max-w-sm">
            Drag and drop <span className="font-mono text-rn-accent">.blend</span> files anywhere or
            click <span className="font-semibold text-rn-text">Add .blend</span> in the toolbar.
          </p>
        </div>
      ) : (
        /* Job Cards List */
        <div className="space-y-3 pb-6">
          <div className="flex items-center justify-between text-xs text-rn-muted px-1">
            <span>
              {jobs.length} job{jobs.length === 1 ? '' : 's'} in queue
            </span>
            <span className="text-[11px]">{jobs.filter((j) => j.enabled).length} enabled</span>
          </div>

          {jobs.map((job, idx) => (
            <JobCard key={job.id} job={job} index={idx} total={jobs.length} />
          ))}
        </div>
      )}
    </div>
  );
};
