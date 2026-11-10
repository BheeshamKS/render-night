import React from 'react';

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-rn-bg text-rn-text">
      {/* Toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-rn-border bg-rn-panel px-4">
        <div className="flex items-center space-x-2">
          <span className="font-bold tracking-wide">Render Night</span>
          <span className="rounded bg-rn-subpanel px-2 py-0.5 text-xs text-rn-muted">
            v0.1.0-alpha.1
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button className="rounded bg-rn-accent px-3 py-1 text-sm font-medium hover:opacity-90">
            Add Job
          </button>
        </div>
      </div>

      {/* Queue Area */}
      <div className="flex flex-1 items-center justify-center bg-rn-bg p-6">
        <div className="flex flex-col items-center space-y-3 text-rn-muted">
          <svg
            className="h-12 w-12 stroke-current opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <p className="text-sm">No render jobs in queue. Drop a .blend file or click Add Job.</p>
        </div>
      </div>

      {/* Bottom Monitor Dock */}
      <div className="flex h-40 flex-col border-t border-rn-border bg-rn-panel">
        <div className="flex h-8 items-center border-b border-rn-border px-4 text-xs font-semibold uppercase tracking-wider text-rn-muted">
          Render Monitor
        </div>
        <div className="flex-1 p-3 font-mono text-xs text-rn-muted overflow-y-auto">
          <div>[System] Render Night ready. Waiting for jobs...</div>
        </div>
      </div>
    </div>
  );
}
