import { useQueueStore } from '../store/queueStore';

import React from 'react';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
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
    startQueue,
  } = useQueueStore();

  if (!showPreflightModal || !preflightReport) return null;

  const { hasErrors, hasWarnings, jobReports } = preflightReport;
  const passed = !hasErrors && !hasWarnings;
  const filteredJobs = preflightTargetJobId
    ? jobReports.filter((j) => j.jobId === preflightTargetJobId)
    : jobReports;

  const handleStartAnyway = async () => {
    closePreflightModal();
    await startQueue();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm select-none">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-rn-border bg-rn-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rn-border px-5 py-3">
          <div className="flex items-center space-x-2">
            {hasErrors ? (
              <ShieldAlert className="h-5 w-5 text-red-400" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-green-400" />
            )}
            <h2 className="text-sm font-semibold text-rn-text">
              Pre-Flight Validation Report
              {preflightTargetJobId ? ' (Single Job)' : ' (Queue)'}
            </h2>
          </div>
          <button
            onClick={closePreflightModal}
            className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Close report"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Summary Banner */}
        <div className="px-5 pt-4">
          {hasErrors ? (
            <div className="flex items-start space-x-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-200">Execution Blocked</div>
                <div>
                  One or more critical errors will prevent rendering. Resolve the errors or apply
                  the quick fixes below to start the queue.
                </div>
              </div>
            </div>
          ) : hasWarnings ? (
            <div className="flex items-start space-x-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
              <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-200">Warnings Detected</div>
                <div>
                  No fatal errors were found, but potential issues may degrade performance or visual
                  output. You may apply quick fixes or continue anyway.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start space-x-2 rounded border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-300">
              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-green-200">All Checks Passed</div>
                <div>
                  No errors or warnings found. Output paths, versions, ranges, and camera bindings
                  are verified.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Job Issues List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {filteredJobs.map((job) => {
            const jobErrors = job.errors || [];
            const jobWarnings = job.warnings || [];
            const totalJobIssues = jobErrors.length + jobWarnings.length;

            return (
              <div
                key={job.jobId}
                className="rounded border border-rn-border bg-rn-subpanel/50 p-3 space-y-2.5 text-xs"
              >
                {/* Job Title & Badges */}
                <div className="flex items-center justify-between border-b border-rn-border/60 pb-1.5">
                  <div className="font-medium text-rn-text truncate" title={job.jobName}>
                    {job.jobName}
                  </div>
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {jobErrors.length > 0 && (
                      <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-400">
                        {jobErrors.length} Error{jobErrors.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {jobWarnings.length > 0 && (
                      <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] font-medium text-yellow-400">
                        {jobWarnings.length} Warning{jobWarnings.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {totalJobIssues === 0 && (
                      <span className="flex items-center space-x-1 text-green-400 text-[11px]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Ready</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Errors */}
                {jobErrors.length > 0 && (
                  <div className="space-y-1.5">
                    {jobErrors.map((err) => (
                      <div
                        key={err.id}
                        className="rounded border border-red-500/20 bg-red-950/20 p-2 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start space-x-1.5 text-rn-error">
                            <AlertCircle className="h-3.5 w-3.5 text-rn-error flex-shrink-0 mt-0.5" />
                            <span>{err.message}</span>
                          </div>
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
                          <div className="flex items-start space-x-1.5 text-rn-warning">
                            <AlertTriangle className="h-3.5 w-3.5 text-rn-warning flex-shrink-0 mt-0.5" />
                            <span>{warn.message}</span>
                          </div>
                          {warn.quickFix && (
                            <button
                              onClick={() => applyQuickFix(warn)}
                              className="flex items-center space-x-1 rounded-md bg-rn-accent px-2.5 py-0.5 text-[11px] font-semibold text-[#0f0f10] hover:brightness-110 flex-shrink-0"
                              title="Apply automatic fix"
                            >
                              <Wrench className="h-3 w-3" />
                              <span>{warn.quickFix.label}</span>
                            </button>
                          )}
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
            {hasWarnings && !hasErrors && (
              <button
                onClick={handleStartAnyway}
                className="flex items-center space-x-1.5 rounded-md bg-rn-accent px-3 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
                title="Ignore pre-flight warnings and start render queue"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Ignore Warnings & Start Render</span>
              </button>
            )}

            {passed && (
              <button
                onClick={handleStartAnyway}
                className="flex items-center space-x-1.5 rounded-md bg-rn-accent px-3 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
                title="Start render queue"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Start Render</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
