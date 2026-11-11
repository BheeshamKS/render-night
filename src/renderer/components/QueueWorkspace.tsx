import { useQueueStore } from '../store/queueStore';
import { BulkActionBar } from './BulkActionBar';
import { JobRow } from './JobRow';
import { JobEditorDrawer } from './drawer/JobEditorDrawer';

import React from 'react';

import { CheckCircle2, FolderDown, Plus, UploadCloud } from 'lucide-react';

export const QueueWorkspace: React.FC = () => {
  const {
    jobs,
    blenders,
    selectedBlenderId,
    setSelectedBlenderId,
    isDraggingOver,
    setIsDraggingOver,
    addFiles,
    selectAllJobs,
    selectedJobId,
    isDrawerOpen,
    closeJobDrawer,
  } = useQueueStore();

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
        const path = (file as unknown as { path?: string }).path || file.name;
        if (path) files.push(path);
      }
    }

    if (files.length > 0) {
      await addFiles(files);
    }
  };

  const handleBrowseFiles = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const files = await window.rnApi.selectBlendFiles();
      if (files && files.length > 0) {
        await addFiles(files);
      }
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex flex-1 overflow-hidden bg-rn-bg ${
        isDraggingOver ? 'ring-2 ring-inset ring-rn-accent bg-rn-accent/5' : ''
      }`}
    >
      {/* Full-Window Drag Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-rn-bg/90 backdrop-blur-sm pointer-events-none border-2 border-dashed border-rn-accent m-3 rounded-xl animate-in fade-in">
          <UploadCloud className="h-16 w-16 text-rn-accent scale-105 transition-transform duration-150 ease-out" />
          <p className="mt-3 text-base font-semibold text-rn-text">
            Drop .blend files to add to render queue
          </p>
        </div>
      )}

      {/* When Queue is Empty */}
      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 select-none text-center">
          <div className="flex max-w-md w-full flex-col items-center rounded-xl border border-rn-border bg-rn-panel p-8 shadow-xl">
            {/* Drop Target Icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rn-subpanel border border-rn-border text-rn-muted mb-4">
              <FolderDown className="h-6 w-6 stroke-[1.5]" />
            </div>

            <h2 className="text-base font-semibold text-rn-text">Drop .blend files here</h2>
            <p className="mt-1.5 text-xs text-rn-muted max-w-sm leading-relaxed">
              Drag and drop Blender files directly into the window, or browse to add shots to your
              render queue.
            </p>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleBrowseFiles}
              className="mt-5 flex h-8 items-center space-x-2 rounded-lg bg-[#ededed] px-4 text-xs font-semibold text-[#141415] shadow-sm transition hover:bg-white active:opacity-90"
            >
              <Plus className="h-4 w-4 stroke-[2]" />
              <span>Browse .blend Files</span>
            </button>

            {/* Detected Blender Versions List */}
            <div className="mt-6 w-full border-t border-rn-border/70 pt-4">
              <span className="text-[11px] font-medium text-rn-muted block mb-2.5">
                Detected Blender Installations
              </span>

              {blenders.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {blenders.map((b) => {
                    const isSelected = selectedBlenderId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBlenderId(b.id)}
                        className={`flex items-center space-x-1.5 rounded-md border px-2.5 py-1 text-xs transition ${
                          isSelected
                            ? 'border-rn-accent/60 bg-rn-accent/15 text-rn-accent font-medium'
                            : 'border-rn-border bg-rn-input text-rn-muted hover:border-rn-muted/70 hover:text-rn-text'
                        }`}
                        title={b.displayPath}
                      >
                        <CheckCircle2
                          className={`h-3 w-3 ${isSelected ? 'text-rn-accent' : 'opacity-0'}`}
                        />
                        <span>Blender {b.version}</span>
                        <span className="text-[10px] font-mono text-rn-muted">
                          ({b.isPortable ? 'Portable' : b.source})
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-rn-error">
                  No local Blender installation found in system PATH or standard folders.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Full-Width Queue Workspace with Slide-Over Drawer on demand */
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Queue Sub-Header Status Strip */}
          <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-rn-border bg-rn-panel px-3 text-[11px] text-rn-muted select-none">
            <div className="flex items-center space-x-2 tabular-nums">
              <span className="font-semibold text-rn-text">
                {jobs.length} job{jobs.length === 1 ? '' : 's'}
              </span>
              <span>·</span>
              <span>{jobs.filter((j) => j.enabled).length} enabled</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectAllJobs}
                className="hover:text-rn-text transition text-[10px]"
                title="Select all jobs (Ctrl+A)"
              >
                Select All
              </button>
            </div>
          </div>

          {/* Scrollable Full-Width Job Rows */}
          <div className="flex-1 overflow-y-auto">
            {jobs.map((job, idx) => (
              <JobRow key={job.id} job={job} index={idx} />
            ))}
          </div>

          {/* Contextual Bulk Action Bar */}
          <BulkActionBar />

          {/* Slide-Over Job Editor Drawer */}
          {isDrawerOpen && selectedJob && (
            <>
              {/* Dimmed Backdrop */}
              <div
                onClick={closeJobDrawer}
                className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] animate-in fade-in"
              />

              {/* Drawer Container */}
              <JobEditorDrawer job={selectedJob} onClose={closeJobDrawer} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
