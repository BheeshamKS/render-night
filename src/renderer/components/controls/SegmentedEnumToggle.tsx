import React from 'react';

import { RotateCcw } from 'lucide-react';

export interface EnumItem {
  identifier: string;
  name: string;
  description?: string;
}

export interface SegmentedEnumToggleProps {
  label?: string;
  value: string;
  defaultValue?: string;
  items: EnumItem[];
  isOverridden?: boolean;
  onReset?: () => void;
  onChange: (val: string) => void;
  description?: string;
  disabled?: boolean;
}

export const SegmentedEnumToggle: React.FC<SegmentedEnumToggleProps> = ({
  value,
  items,
  isOverridden = false,
  onReset,
  onChange,
  description,
  disabled = false,
}) => {
  const isSegmented = items.length <= 4 && items.length > 0;

  return (
    <div
      className={`relative flex items-center w-full select-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      title={description}
    >
      {/* Accent bar for override */}
      {isOverridden && (
        <div
          className="absolute -left-1.5 top-0.5 bottom-0.5 w-0.5 bg-rn-accent rounded-full z-10"
          title="Overridden value"
        />
      )}

      {isSegmented ? (
        <div className="flex w-full rounded border border-rn-border bg-rn-input overflow-hidden text-xs">
          {items.map((item, idx) => {
            const isSelected = item.identifier === value;
            return (
              <button
                key={item.identifier}
                type="button"
                onClick={() => onChange(item.identifier)}
                title={item.description || item.name}
                className={`flex-1 py-1 px-1.5 text-center font-medium truncate transition ${
                  isSelected
                    ? 'bg-rn-accent text-white shadow-sm'
                    : 'text-rn-muted hover:text-rn-text hover:bg-rn-subpanel/80'
                } ${idx > 0 ? 'border-l border-rn-border/80' : ''}`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-6 rounded border bg-rn-input px-2 text-xs font-medium text-rn-text outline-none transition focus:border-rn-accent ${
            isOverridden ? 'border-rn-accent/80' : 'border-rn-border'
          }`}
        >
          {items.map((item) => (
            <option key={item.identifier} value={item.identifier} title={item.description}>
              {item.name}
            </option>
          ))}
        </select>
      )}

      {/* Reset button when overridden */}
      {isOverridden && onReset && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="ml-1.5 p-1 rounded text-rn-accent hover:bg-rn-subpanel hover:text-white transition flex-shrink-0"
          title="Reset to file default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
