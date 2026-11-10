import { useQueueStore } from '../store/queueStore';

import React, { useEffect, useRef } from 'react';

import { Clock, Cpu, FileImage, Layers, Terminal, Trash } from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const MonitorDock: React.FC = () => {
  const { logs, clearLogs, monitorStats, queueState } = useQueueStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const {
    currentFrame,
    totalFrames,
    sampleCurrent,
    sampleTotal,
    elapsedSeconds,
    etaSeconds,
    peakMemory,
    lastThumbnailPath,
    isExr,
    overallProgress,
  } = monitorStats;

  return (
    <div className="flex h-44 flex-shrink-0 border-t border-rn-border bg-rn-panel select-none">
      {/* Left Column: Progress, Stats & Live Log Stream */}
      <div className="flex flex-1 flex-col border-r border-rn-border min-w-0">
        {/* Top: Progress Bar & Metrics */}
        <div className="flex flex-col border-b border-rn-border px-3 py-2 bg-rn-subpanel/50">
          <div className="flex items-center justify-between text-xs text-rn-text mb-1">
            <div className="flex items-center space-x-2 font-medium">
              <span className="text-[11px] font-mono">
                {currentFrame !== null && totalFrames !== null
                  ? `Frame ${currentFrame} of ${totalFrames}`
                  : queueState === 'running'
                    ? 'Preparing...'
                    : 'Queue Idle'}
              </span>
              {sampleCurrent !== null && sampleTotal !== null && (
                <span className="text-rn-muted font-mono text-[11px]">
                  · Sample {sampleCurrent}/{sampleTotal}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3 text-rn-muted text-[11px] font-mono">
              <span className="flex items-center space-x-1" title="Elapsed Time">
                <Clock className="h-3 w-3" />
                <span>{formatTime(elapsedSeconds)}</span>
              </span>
              {etaSeconds !== null && (
                <span title="Estimated Time Remaining">ETA: {formatTime(etaSeconds)}</span>
              )}
              {peakMemory && (
                <span
                  className="flex items-center space-x-1 text-rn-accent"
                  title="Blender Peak Memory"
                >
                  <Cpu className="h-3 w-3" />
                  <span>Peak: {peakMemory}</span>
                </span>
              )}
              <span className="font-bold text-rn-text">{overallProgress}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-rn-input rounded-full overflow-hidden">
            <div
              className="h-full bg-rn-rendering transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
            />
          </div>
        </div>

        {/* Bottom: Terminal Log Stream Header & Lines */}
        <div className="flex h-5 items-center justify-between px-3 text-[10px] text-rn-muted border-b border-rn-border/50">
          <div className="flex items-center space-x-1 font-semibold uppercase tracking-wider">
            <Terminal className="h-3 w-3 text-rn-accent" />
            <span>Output Log</span>
          </div>
          <button
            onClick={clearLogs}
            className="flex items-center space-x-0.5 text-rn-muted hover:text-rn-text transition"
            title="Clear logs"
          >
            <Trash className="h-2.5 w-2.5" />
            <span>Clear</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px] space-y-0.5 select-text">
          {logs.map((log, idx) => (
            <div
              key={idx}
              className={`leading-tight break-all ${
                log.includes('Failed') || log.includes('Error')
                  ? 'text-red-400 font-semibold'
                  : log.includes('Warning')
                    ? 'text-yellow-400'
                    : log.includes('complete')
                      ? 'text-green-400'
                      : 'text-rn-text/70'
              }`}
            >
              {log}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Right Column: Last Finished Frame Thumbnail */}
      <div className="flex w-52 flex-col items-center justify-center p-2 bg-black/40 text-center">
        <div className="text-[10px] text-rn-muted uppercase tracking-wider font-semibold mb-1 flex items-center space-x-1">
          <Layers className="h-3 w-3 text-rn-accent" />
          <span>Last Finished Frame</span>
        </div>

        <div className="flex-1 w-full flex items-center justify-center border border-rn-border/50 rounded bg-rn-panel/50 overflow-hidden relative">
          {lastThumbnailPath ? (
            isExr ? (
              <div className="flex flex-col items-center justify-center p-2 text-rn-muted space-y-1">
                <FileImage className="h-6 w-6 text-rn-accent" />
                <span className="text-[10px] font-mono">EXR 32-bit Float</span>
                <span className="text-[9px] text-rn-muted/70">(Preview Unavailable)</span>
              </div>
            ) : (
              <img
                src={`file://${lastThumbnailPath}`}
                alt="Render Preview"
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-rn-muted/50 space-y-1">
              <FileImage className="h-6 w-6" />
              <span className="text-[10px]">No frame yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
