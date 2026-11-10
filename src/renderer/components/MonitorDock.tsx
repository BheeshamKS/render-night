import { useQueueStore } from '../store/queueStore';

import React, { useEffect, useRef } from 'react';

import { Terminal, Trash } from 'lucide-react';

export const MonitorDock: React.FC = () => {
  const { logs, clearLogs } = useQueueStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex h-36 flex-shrink-0 flex-col border-t border-rn-border bg-rn-panel select-none">
      {/* Header */}
      <div className="flex h-7 items-center justify-between border-b border-rn-border px-3 text-xs text-rn-muted">
        <div className="flex items-center space-x-1.5 font-semibold uppercase tracking-wider text-[10px]">
          <Terminal className="h-3.5 w-3.5 text-rn-accent" />
          <span>Render Monitor</span>
        </div>
        <button
          onClick={clearLogs}
          className="flex items-center space-x-1 rounded px-1.5 py-0.5 text-[10px] text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
          title="Clear monitor logs"
        >
          <Trash className="h-3 w-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Log View */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-rn-muted space-y-0.5 select-text">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className={`leading-relaxed ${
              log.includes('Failed') || log.includes('Error')
                ? 'text-red-400'
                : log.includes('Warning')
                  ? 'text-yellow-400'
                  : log.includes('complete')
                    ? 'text-green-400'
                    : 'text-rn-text/80'
            }`}
          >
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
