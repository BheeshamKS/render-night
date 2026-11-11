import { useQueueStore } from '../store/queueStore';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';

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
  const {
    jobs,
    activeJobId,
    logs,
    clearLogs,
    monitorStats,
    isMonitorCollapsed,
    toggleMonitorCollapsed,
    monitorTab,
    setMonitorTab,
    recentFrameTimes,
    setActiveTab,
  } = useQueueStore();

  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId);

  // Auto-scroll console when new logs arrive
  useEffect(() => {
    if (autoScroll && monitorTab === 'console') {
      consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, monitorTab]);

  // Handle Copy Console
  const handleCopyLogs = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open output folder
  const handleOpenOutputFolder = async () => {
    if (activeJob && window.rnApi) {
      const dir = activeJob.outputPathPattern.split('/')[0] || '';
      await window.rnApi.openPath(dir);
    }
  };

  // Filter console logs
  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const q = filterText.toLowerCase();
    return logs.filter((l) => l.toLowerCase().includes(q));
  }, [logs, filterText]);

  // Derived metrics
  const currentFrame = monitorStats.currentFrame;
  const totalFrames = monitorStats.totalFrames;
  const sampleCurrent = monitorStats.sampleCurrent;
  const sampleTotal = monitorStats.sampleTotal;
  const elapsed = monitorStats.elapsedSeconds;
  const eta = monitorStats.etaSeconds;
  const peakMem = monitorStats.peakMemory;
  const overallPct = monitorStats.overallProgress;

  const deviceBadge = useMemo(() => {
    if (activeJob?.deviceReport) {
      const firstDev = activeJob.deviceReport.devices[0];
      const devName =
        (typeof firstDev === 'object' && firstDev ? firstDev.name : String(firstDev || '')) || '';
      const dev = devName.replace('NVIDIA GeForce ', '').replace('NVIDIA ', '');
      return `${activeJob.deviceReport.mode} · ${dev} · ${activeJob.deviceReport.computeDeviceType}`;
    }
    return 'GPU / CPU';
  }, [activeJob]);

  // Sparkline SVG calculation
  const sparklineData = useMemo(() => {
    const times =
      recentFrameTimes.length > 0 ? recentFrameTimes : [4.2, 4.5, 4.1, 4.8, 5.0, 4.9, 4.6];
    const max = Math.max(...times, 6.0);
    const min = Math.min(...times, 2.0);
    const range = max - min || 1;
    const width = 120;
    const height = 36;
    const stepX = width / Math.max(1, times.length - 1);

    const points = times.map((val, idx) => {
      const x = idx * stepX;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const lastVal = times[times.length - 1];
    return {
      points: points.join(' '),
      lastVal: lastVal ? `${lastVal.toFixed(1)}s` : '--',
      min: `${min.toFixed(1)}s`,
      max: `${max.toFixed(1)}s`,
    };
  }, [recentFrameTimes]);

  // When Collapsed: Sleek 28px Status Bar
  if (isMonitorCollapsed) {
    return (
      <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-rn-border bg-[#181818] px-3 text-xs select-none z-20">
        <div className="flex items-center space-x-3 text-rn-muted">
          <span className="font-mono text-rn-text font-semibold">
            {activeJob ? activeJob.fileName : 'Queue Idle'}
          </span>
          {currentFrame !== null && totalFrames !== null && (
            <span className="font-mono text-[11px]">
              Frame {currentFrame}/{totalFrames}
            </span>
          )}
          {eta !== null && <span className="font-mono text-[11px]">ETA: {formatTime(eta)}</span>}
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="h-1.5 w-24 rounded-full bg-rn-input overflow-hidden">
              <div
                className="h-full bg-rn-rendering transition-all duration-200"
                style={{ width: `${Math.max(0, Math.min(100, overallPct))}%` }}
              />
            </div>
            <span className="font-mono font-bold text-[11px] text-rn-text">{overallPct}%</span>
          </div>

          <button
            type="button"
            onClick={toggleMonitorCollapsed}
            className="flex items-center space-x-1 rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Expand Monitor Dock"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="flex h-48 flex-shrink-0 flex-col border-t border-rn-border bg-[#181818] select-none z-20">
      {/* Dock Tabs Header */}
      <div className="flex h-7 items-center justify-between border-b border-rn-border bg-[#222222] px-2">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setMonitorTab('monitor')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
              monitorTab === 'monitor'
                ? 'bg-rn-panel text-white shadow-sm'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <Gauge className="h-3.5 w-3.5 text-rn-accent" />
            <span>Monitor</span>
          </button>

          <button
            type="button"
            onClick={() => setMonitorTab('console')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
              monitorTab === 'console'
                ? 'bg-rn-panel text-white shadow-sm'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <Terminal className="h-3.5 w-3.5 text-amber-400" />
            <span>Console</span>
            {logs.some((l) => l.toLowerCase().includes('error')) && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMonitorTab('log')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
              monitorTab === 'log'
                ? 'bg-rn-panel text-white shadow-sm'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-blue-400" />
            <span>Overrides & Events</span>
          </button>
        </div>

        {/* Right dock actions */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={toggleMonitorCollapsed}
            className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Collapse dock"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* Tab 1: Monitor Tab                                             */}
      {/* ============================================================== */}
      {monitorTab === 'monitor' && (
        <div className="flex flex-1 overflow-hidden p-3 space-x-4 bg-rn-bg">
          {/* Left: Overall Queue Progress & Metrics */}
          <div className="flex flex-1 flex-col justify-between min-w-0 pr-2">
            <div>
              <div className="flex items-center justify-between text-xs text-rn-text mb-1.5">
                <div className="flex items-center space-x-2 truncate">
                  <span className="font-bold text-white truncate">
                    {activeJob ? activeJob.fileName : 'Queue Idle'}
                  </span>
                  <span className="rounded bg-rn-subpanel px-2 py-0.5 text-[10px] font-mono text-rn-muted">
                    {deviceBadge}
                  </span>
                </div>

                <span className="font-mono font-bold text-sm text-rn-rendering">{overallPct}%</span>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full rounded-full bg-rn-input overflow-hidden shadow-inner">
                <div
                  className="h-full bg-rn-rendering transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, overallPct))}%` }}
                />
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 border-t border-rn-border/50 pt-2 text-[11px] font-mono">
              <div className="flex flex-col">
                <span className="text-[10px] text-rn-muted uppercase">Frame</span>
                <span className="text-white font-semibold">
                  {currentFrame !== null && totalFrames !== null
                    ? `${currentFrame} / ${totalFrames}`
                    : '--'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-rn-muted uppercase">Sample</span>
                <span className="text-white font-semibold">
                  {sampleCurrent !== null && sampleTotal !== null
                    ? `${sampleCurrent} / ${sampleTotal}`
                    : '--'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-rn-muted uppercase">Elapsed / ETA</span>
                <span className="text-white font-semibold">
                  {formatTime(elapsed)} / {eta !== null ? formatTime(eta) : '--'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-rn-muted uppercase">Peak Memory</span>
                <span className="text-rn-accent font-semibold">{peakMem || '--'}</span>
              </div>
            </div>
          </div>

          {/* Centre: Larger Preview of Last Finished Frame */}
          <div
            onClick={() => setActiveTab('sequences')}
            className="group relative flex h-full w-48 flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-rn-border bg-rn-panel overflow-hidden shadow-md hover:border-rn-accent transition-all"
            title="Click to open Sequence Viewer"
          >
            {monitorStats.lastThumbnailPath ? (
              <img
                src={`file://${monitorStats.lastThumbnailPath}`}
                alt="Last Rendered Frame"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex flex-col items-center text-rn-muted/60 p-2 text-center">
                <Film className="h-8 w-8 stroke-[1.2] mb-1 text-rn-accent" />
                <span className="text-[10px] font-medium">Last Rendered Frame</span>
                <span className="text-[9px] text-rn-muted/60">Click to view sequence</span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-0.5 text-center text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity">
              Open Sequence Viewer
            </div>
          </div>

          {/* Right: Sparkline of Recent Frame Times */}
          <div className="flex h-full w-40 flex-shrink-0 flex-col justify-between rounded-lg border border-rn-border bg-rn-panel p-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-rn-muted">
              <span>Frame Times</span>
              <span className="font-bold text-rn-accent">{sparklineData.lastVal}</span>
            </div>

            {/* SVG Sparkline */}
            <div className="flex h-10 w-full items-center justify-center overflow-hidden">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 120 36">
                <polyline
                  fill="none"
                  stroke="#4772b3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklineData.points}
                />
              </svg>
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono text-rn-muted/70 border-t border-rn-border/40 pt-1">
              <span>Min: {sparklineData.min}</span>
              <span>Max: {sparklineData.max}</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Tab 2: Console Tab                                             */}
      {/* ============================================================== */}
      {monitorTab === 'console' && (
        <div className="flex flex-1 flex-col overflow-hidden bg-[#141414]">
          {/* Console Toolbar */}
          <div className="flex h-7 items-center justify-between border-b border-rn-border bg-[#1d1d1d] px-3 text-xs">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 rounded bg-rn-bg px-2 py-0.5 border border-rn-border">
                <Search className="h-3 w-3 text-rn-muted" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter console..."
                  className="bg-transparent text-xs text-rn-text placeholder-rn-muted focus:outline-none w-36"
                />
              </div>

              <label className="flex items-center space-x-1.5 text-[11px] text-rn-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="h-3 w-3 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                />
                <span>Auto-scroll</span>
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleCopyLogs}
                className="flex items-center space-x-1 rounded px-2 py-0.5 text-xs text-rn-muted hover:bg-rn-subpanel hover:text-white transition"
                title="Copy all logs to clipboard"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenOutputFolder}
                className="flex items-center space-x-1 rounded px-2 py-0.5 text-xs text-rn-muted hover:bg-rn-subpanel hover:text-white transition"
                title="Open render output folder"
              >
                <FolderOpen className="h-3 w-3" />
                <span>Open Folder</span>
              </button>

              <button
                type="button"
                onClick={clearLogs}
                className="flex items-center space-x-1 rounded px-2 py-0.5 text-xs text-rn-muted hover:bg-rn-subpanel hover:text-rose-400 transition"
                title="Clear console output"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Virtualized / Scrollable Monospace Output */}
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed select-text space-y-0.5">
            {filteredLogs.map((logLine, idx) => {
              const isError = /error|failed|traceback|sigsegv|cuda_error|aborted/i.test(logLine);
              const isWarning = /warn|warning/i.test(logLine);
              const isFrame = /fra:|saved:/i.test(logLine);

              return (
                <div
                  key={idx}
                  className={`break-all ${
                    isError
                      ? 'text-rose-400 font-semibold bg-rose-950/20 px-1 rounded'
                      : isWarning
                        ? 'text-yellow-400'
                        : isFrame
                          ? 'text-green-400'
                          : 'text-rn-text/75'
                  }`}
                >
                  {logLine}
                </div>
              );
            })}
            <div ref={consoleBottomRef} />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Tab 3: Log Tab (Overrides & Events)                           */}
      {/* ============================================================== */}
      {monitorTab === 'log' && (
        <div className="flex flex-1 flex-col overflow-y-auto p-3 font-mono text-xs select-text bg-[#141414]">
          <h4 className="text-[11px] font-semibold text-rn-muted uppercase tracking-wider mb-2">
            Applied & Skipped Overrides Report
          </h4>

          {activeJob?.overridesReport ? (
            <div className="space-y-3">
              <div>
                <span className="text-green-400 font-bold block mb-1">
                  Applied ({activeJob.overridesReport.applied.length})
                </span>
                <div className="space-y-1 pl-2">
                  {activeJob.overridesReport.applied.map((app, i) => (
                    <div key={i} className="text-rn-text text-[11px]">
                      <span className="text-rn-accent">{app.rnaPath}</span> = {String(app.value)}
                    </div>
                  ))}
                </div>
              </div>

              {activeJob.overridesReport.skipped.length > 0 && (
                <div>
                  <span className="text-yellow-400 font-bold block mb-1">
                    Skipped ({activeJob.overridesReport.skipped.length})
                  </span>
                  <div className="space-y-1 pl-2">
                    {activeJob.overridesReport.skipped.map((skp, i) => (
                      <div key={i} className="text-yellow-200/80 text-[11px]">
                        <span className="text-yellow-400">{skp.rnaPath}</span>: {skp.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-rn-muted italic text-[11px]">
              No override report generated yet. Reports appear when the render runner executes job
              setup in Blender.
            </div>
          )}
        </div>
      )}
    </footer>
  );
};
