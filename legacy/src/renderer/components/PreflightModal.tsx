import { useQueueStore } from '../store/queueStore';

import React from 'react';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  FolderOpen,
  Info,
  Play,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';

export const PreflightModal: React.FC = () => {
  const {
    showPreflightModal,
    preflightReport,
    preflightTargetJobId,
    closePreflightModal,
    applyQuickFix,
    browseAndAddBlender,
    runPreflightCheck,
    startQueue,
    jobs,
    toggleJobIgnoreAllWarnings,
    ignoreWarning,
    ignoreWarningCode,
  } = useQueueStore();

  if (!showPreflightModal || !preflightReport) return null;

  const { isBlocked, hasErrors, hasWarnings, jobReports, blockReasons } = preflightReport;
  const isBlockedState = Boolean(isBlocked ?? hasErrors);
  const filteredJobs = preflightTargetJobId
    ? jobReports.filter((j) => j.jobId === preflightTargetJobId)
    : jobReports;

  const handleStartAnyway = async () => {
    closePreflightModal();
    await startQueue();
  };

  return (
    <div className="fixed inset-0 z-50 flex pointer-events-none items-stretch justify-end p-4 select-none">
      {/* Slide-in non-blocking drawer */}
      <div className="pointer-events-auto flex h-full max-h-[92vh] w-full max-w-xl flex-col rounded-xl border border-rn-border bg-rn-panel shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rn-border px-5 py-3 bg-rn-subpanel">
          <div className="flex items-center space-x-2">
            {isBlockedState ? (
              <ShieldAlert className="h-5 w-5 text-rn-error" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-rn-warning" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-rn-success" />
            )}
            <h2 className="text-sm font-semibold text-rn-text">
              Pre-Flight Validation Report
              {preflightTargetJobId ? ' (Single Job)' : ' (Queue)'}
            </h2>
          </div>
          <button
            onClick={closePreflightModal}
            className="rounded p-1 text-rn-muted hover:bg-rn-panel hover:text-rn-text transition"
            title="Close report"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Summary Banner */}
        <div className="px-5 pt-4">
          {isBlockedState ? (
            <div className="flex items-start space-x-2 rounded-lg border border-rn-error/35 bg-rn-error/10 p-3 text-xs text-rn-text">
              <AlertCircle className="h-4 w-4 text-rn-error flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rn-error">Execution Blocked</div>
                <div className="mt-0.5 leading-relaxed text-rn-muted">
                  {blockReasons && blockReasons.length > 0
                    ? blockReasons.join('; ')
                    : 'A critical system configuration error must be resolved before starting.'}
                </div>
              </div>
            </div>
          ) : hasWarnings ? (
            <div className="flex items-start space-x-2 rounded-lg border border-rn-warning/35 bg-rn-warning/10 p-3 text-xs text-rn-text">
              <AlertTriangle className="h-4 w-4 text-rn-warning flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rn-warning">
                  Warnings Detected (Non-Blocking)
                </div>
                <div className="mt-0.5 leading-relaxed text-rn-muted">
                  These potential issues will not block queue rendering. You may ignore individual
                  warnings, ignore all like them, apply quick fixes, or render immediately.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start space-x-2 rounded-lg border border-rn-success/35 bg-rn-success/10 p-3 text-xs text-rn-text">
              <CheckCircle2 className="h-4 w-4 text-rn-success flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rn-success">All Checks Passed</div>
                <div className="mt-0.5 leading-relaxed text-rn-muted">
                  Executable, blend file, ranges, and camera bindings are verified.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Job Issues List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {filteredJobs.map((job) => {
            const currentJob = jobs.find((j) => j.id === job.jobId);
            const jobErrors = job.errors || [];
            const jobWarnings = job.warnings || [];
            const unusedMissingCount = job.unusedMissingCount || 0;
            const totalJobIssues = jobErrors.length + jobWarnings.length;

            return (
              <div
                key={job.jobId}
                className="rounded border border-rn-border bg-rn-subpanel/50 p-3 space-y-2.5 text-xs"
              >
                {/* Job Title & Badges & Ignore All Toggle */}
                <div className="flex items-center justify-between border-b border-rn-border/60 pb-1.5">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="font-medium text-rn-text truncate" title={job.jobName}>
                      {job.jobName}
                    </span>
                    {currentJob?.isBasicMode && (
                      <span className="rounded bg-rn-warning/15 border border-rn-warning/30 px-1.5 py-0.2 text-[10px] font-medium text-rn-warning">
                        Basic mode
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {/* Per-job Ignore All Warnings Switch */}
                    <label className="flex items-center space-x-1 text-[11px] text-rn-muted cursor-pointer hover:text-rn-text">
                      <input
                        type="checkbox"
                        checked={Boolean(currentJob?.ignoreAllWarnings)}
                        onChange={() => toggleJobIgnoreAllWarnings(job.jobId)}
                        className="h-3 w-3 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                      />
                      <span>Ignore all</span>
                    </label>

                    {jobErrors.length > 0 && (
                      <span className="rounded bg-rn-error/15 border border-rn-error/30 px-2 py-0.5 text-[11px] font-medium text-rn-error">
                        {jobErrors.length} Blocker{jobErrors.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {jobWarnings.length > 0 && (
                      <span className="rounded bg-rn-warning/15 border border-rn-warning/30 px-2 py-0.5 text-[11px] font-medium text-rn-warning">
                        {jobWarnings.length} Warning{jobWarnings.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {totalJobIssues === 0 && (
                      <span className="flex items-center space-x-1 text-rn-success text-[11px]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Ready</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Errors (Blockers) */}
                {jobErrors.length > 0 && (
                  <div className="space-y-1.5">
                    {jobErrors.map((err) => (
                      <div
                        key={err.id}
                        className="rounded border border-rn-error/25 bg-rn-error/10 p-2 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start space-x-1.5 text-rn-error">
                            <AlertCircle className="h-3.5 w-3.5 text-rn-error flex-shrink-0 mt-0.5" />
                            <span>{err.message}</span>
                          </div>
                          {err.code === 'BLENDER_NOT_FOUND' && (
                            <button
                              onClick={async () => {
                                const res = await browseAndAddBlender();
                                if (res.success) {
                                  await runPreflightCheck(preflightTargetJobId || undefined);
                                }
                              }}
                              className="flex items-center space-x-1 rounded-md bg-rn-accent px-2.5 py-0.5 text-[11px] font-semibold text-[#0f0f10] hover:brightness-110 active:brightness-95 flex-shrink-0"
                              title="Locate Blender executable on disk"
                            >
                              <FolderOpen className="h-3 w-3" />
                              <span>Locate Blender...</span>
                            </button>
                          )}
                          {err.quickFix && (
                            <button
                              onClick={() => applyQuickFix(err)}
                              className="flex items-center space-x-1 rounded-md bg-rn-accent px-2.5 py-0.5 text-[11px] font-semibold text-[#0f0f10] hover:brightness-110 active:brightness-95 flex-shrink-0"
                              title="Apply automatic fix"
                            >
                              <Wrench className="h-3 w-3" />
                              <span>{err.quickFix.label}</span>
                            </button>
                          )}
                        </div>
                        {err.details && (
                          <pre className="rounded bg-rn-input p-1.5 text-[10px] text-rn-muted font-mono overflow-x-auto whitespace-pre-wrap">
                            {err.details}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {jobWarnings.length > 0 && (
                  <div className="space-y-1.5">
                    {jobWarnings.map((warn) => (
                      <div
                        key={warn.id}
                        className="rounded-lg border border-rn-warning/30 bg-rn-warning/10 p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start space-x-1.5 text-rn-warning flex-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-rn-warning flex-shrink-0 mt-0.5" />
                            <span>{warn.message}</span>
                          </div>

                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            {warn.quickFix && (
                              <button
                                onClick={() => applyQuickFix(warn)}
                                className="flex items-center space-x-1 rounded-md bg-rn-accent px-2 py-0.5 text-[10px] font-semibold text-[#0f0f10] hover:brightness-110 flex-shrink-0"
                                title="Apply automatic fix"
                              >
                                <Wrench className="h-3 w-3" />
                                <span>{warn.quickFix.label}</span>
                              </button>
                            )}
                            <button
                              onClick={() => ignoreWarning(job.jobId, warn.id)}
                              className="flex items-center space-x-1 rounded border border-rn-border bg-rn-subpanel px-2 py-0.5 text-[10px] text-rn-muted hover:text-rn-text"
                              title="Ignore this specific warning for this job"
                            >
                              <EyeOff className="h-3 w-3" />
                              <span>Ignore</span>
                            </button>
                            <button
                              onClick={() => ignoreWarningCode(job.jobId, warn.code)}
                              className="rounded border border-rn-border bg-rn-subpanel px-1.5 py-0.5 text-[10px] text-rn-muted hover:text-rn-text"
                              title={`Ignore all warnings with code ${warn.code}`}
                            >
                              Ignore all like this
                            </button>
                          </div>
                        </div>

                        {warn.details && (
                          <pre className="rounded bg-rn-input p-1.5 text-[10px] text-rn-muted font-mono overflow-x-auto whitespace-pre-wrap">
                            {warn.details}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Collapsed Info count for unused missing assets */}
                {unusedMissingCount > 0 && (
                  <div className="flex items-center space-x-1.5 text-[11px] text-rn-muted pt-1">
                    <Info className="h-3.5 w-3.5 text-rn-muted shrink-0" />
                    <span>
                      {unusedMissingCount} unused missing file{unusedMissingCount === 1 ? '' : 's'}{' '}
                      (unreferenced by renderable objects, will not affect output).
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-rn-border bg-rn-subpanel/40 px-5 py-3">
          <button
            onClick={closePreflightModal}
            className="rounded-md border border-rn-border bg-rn-subpanel px-3 py-1.5 text-xs text-rn-text hover:border-rn-muted transition"
          >
            Close
          </button>

          <div className="flex items-center space-x-2">
            {!isBlocked && (
              <button
                onClick={handleStartAnyway}
                className="flex items-center space-x-1.5 rounded-md bg-rn-accent px-3 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
                title="Start render queue immediately"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>{hasWarnings ? 'Ignore Warnings & Start Render' : 'Start Render'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
