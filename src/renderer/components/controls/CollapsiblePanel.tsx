import React, { useState } from 'react';

import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

export interface CollapsiblePanelProps {
  title: string;
  defaultExpanded?: boolean;
  defaultOpen?: boolean;
  badge?: string | number;
  overrideCount?: number;
  onResetAll?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  defaultExpanded = true,
  defaultOpen,
  badge,
  overrideCount = 0,
  onResetAll,
  children,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(
    defaultOpen !== undefined ? defaultOpen : defaultExpanded,
  );

  return (
    <div
      className={`rounded border border-rn-border bg-rn-panel/50 overflow-hidden text-xs ${className}`}
    >
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-1.5 bg-rn-subpanel/80 hover:bg-rn-subpanel cursor-pointer select-none border-b border-rn-border/60 transition"
      >
        <div className="flex items-center space-x-2">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-rn-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-rn-muted" />
          )}
          <span className="font-semibold text-rn-text">{title}</span>

          {overrideCount > 0 && (
            <span className="rounded bg-rn-accent/20 border border-rn-accent/40 px-1.5 py-0.2 text-[10px] font-mono text-rn-accent">
              {overrideCount} modified
            </span>
          )}

          {badge !== undefined && overrideCount === 0 && (
            <span className="rounded bg-rn-input px-1.5 py-0.2 text-[10px] font-mono text-rn-muted">
              {badge}
            </span>
          )}
        </div>

        {overrideCount > 0 && onResetAll && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetAll();
            }}
            className="flex items-center space-x-1 text-[11px] text-rn-accent hover:text-white px-1.5 py-0.5 rounded hover:bg-rn-panel transition"
            title="Reset this section to file defaults"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset Section</span>
          </button>
        )}
      </div>

      {/* Panel Content with 40/60 Layout */}
      {isExpanded && <div className="p-3 space-y-2.5 bg-rn-panel/30">{children}</div>}
    </div>
  );
};

export interface PanelRowProps {
  label: string;
  description?: string;
  isOverridden?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}

/**
 * Standard Blender 40/60 layout row:
 * Left 40% label right-aligned, Right 60% control.
 */
export const PanelRow: React.FC<PanelRowProps> = ({
  label,
  description,
  isOverridden = false,
  onReset,
  children,
}) => {
  return (
    <div className="flex items-center w-full" title={description}>
      {/* 40% Right-Aligned Label Column */}
      <div className="w-[40%] text-right pr-3 select-none flex items-center justify-end">
        {isOverridden && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-rn-accent mr-1.5 flex-shrink-0"
            title="Modified from file default"
          />
        )}
        <label className="text-[11px] font-medium text-rn-muted truncate hover:text-rn-text">
          {label}
        </label>
      </div>

      {/* 60% Control Column */}
      <div className="w-[60%] flex items-center space-x-1">
        <div className="flex-1 min-w-0">{children}</div>
        {isOverridden && onReset && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="p-1 rounded text-rn-accent hover:bg-rn-subpanel hover:text-white transition flex-shrink-0"
            title="Reset to file default"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
