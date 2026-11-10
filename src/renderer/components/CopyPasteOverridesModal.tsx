import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export const CopyPasteOverridesModal: React.FC = () => {
  const { pasteReportModal, closePasteReportModal } = useQueueStore();

  if (!pasteReportModal || !pasteReportModal.isOpen) {
    return null;
  }

  const reports = pasteReportModal.reports || [];
  const totalApplied = reports.reduce((acc, r) => acc + r.applied.length, 0);
  const totalSkipped = reports.reduce((acc, r) => acc + r.skipped.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 select-none">
      <div className="w-full max-w-lg rounded border border-rn-border bg-rn-panel shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rn-border bg-rn-subpanel px-4 py-2.5">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm text-rn-text">
              Overrides Applied to {reports.length} Job{reports.length === 1 ? '' : 's'}
            </span>
            {totalSkipped > 0 && (
              <span className="flex items-center space-x-1 rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                <span>{totalSkipped} skipped</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closePasteReportModal}
            className="p-1 rounded text-rn-muted hover:bg-rn-panel hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          <div className="text-rn-muted">
            Total {totalApplied} override{totalApplied === 1 ? '' : 's'} applied across{' '}
            {reports.length} job(s).
          </div>

          {reports.map((report) => (
            <div
              key={report.jobId}
              className="rounded border border-rn-border bg-rn-subpanel/50 p-3 space-y-2"
            >
              <div className="font-medium text-rn-text flex items-center justify-between">
                <span>{report.jobName}</span>
                <span className="text-[11px] text-rn-muted font-mono">
                  {report.applied.length} applied
                  {report.skipped.length > 0 ? `, ${report.skipped.length} skipped` : ''}
                </span>
              </div>

              {/* Applied list */}
              {report.applied.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-rn-muted flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span>Applied Properties:</span>
                  </div>
                  <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                    {report.applied.map((key) => (
                      <span
                        key={key}
                        className="rounded bg-rn-input border border-rn-border px-1.5 py-0.5 text-rn-text"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped list */}
              {report.skipped.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-rn-border/50">
                  <div className="text-[10px] text-yellow-400 flex items-center space-x-1 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Skipped (Incompatible engine or unsupported schema):</span>
                  </div>
                  <div className="space-y-1">
                    {report.skipped.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 text-[11px] text-yellow-300 font-mono"
                      >
                        <span className="font-semibold text-yellow-400">{item.rnaPath}</span>
                        <div className="text-[10px] text-yellow-300/80 font-sans">
                          {item.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-rn-border bg-rn-subpanel px-4 py-2">
          <button
            type="button"
            onClick={closePasteReportModal}
            className="px-4 py-1.5 rounded bg-rn-accent text-xs font-medium text-white hover:bg-rn-accent/90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
