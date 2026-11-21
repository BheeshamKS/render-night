import React, { useEffect, useRef, useState } from 'react';

import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

export interface BlenderNumberFieldProps {
  label?: string;
  value: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  isOverridden?: boolean;
  onReset?: () => void;
  onChange: (val: number) => void;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const BlenderNumberField: React.FC<BlenderNumberFieldProps> = ({
  label,
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 0,
  unit = '',
  isOverridden = false,
  onReset,
  onChange,
  description,
  disabled = false,
  className = '',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState(value.toString());
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ startX: number; startVal: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (!isEditing) {
      setTextValue(precision > 0 ? value.toFixed(precision) : value.toString());
    }
  }, [value, precision, isEditing]);

  const clamp = (val: number): number => {
    let clamped = val;
    if (min !== undefined && min !== -Infinity) clamped = Math.max(min, clamped);
    if (max !== undefined && max !== Infinity) clamped = Math.min(max, clamped);
    if (precision === 0) clamped = Math.round(clamped);
    else clamped = parseFloat(clamped.toFixed(precision));
    return clamped;
  };

  const handleCommit = (newText: string) => {
    setIsEditing(false);
    const parsed = parseFloat(newText);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    } else {
      setTextValue(precision > 0 ? value.toFixed(precision) : value.toString());
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || isEditing) return;
    if (e.button !== 0) return;

    previousValueRef.current = value;
    dragStartRef.current = {
      startX: e.clientX,
      startVal: value,
    };

    let moved = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.startX;

      if (!moved && Math.abs(deltaX) > 2) {
        moved = true;
        setIsDragging(true);
      }

      if (moved) {
        // Shift gives fine tuning (0.1x)
        const sensitivity = moveEvent.shiftKey ? 0.1 : 1.0;
        const deltaVal = (deltaX / 8) * step * sensitivity;
        let nextVal = dragStartRef.current.startVal + deltaVal;

        // Ctrl snaps to step increments
        if (moveEvent.ctrlKey) {
          nextVal = Math.round(nextVal / step) * step;
        }

        onChange(clamp(nextVal));
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (!moved) {
        setIsEditing(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
      }
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStep = (direction: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    const factor = e.shiftKey ? 0.1 : 1.0;
    onChange(clamp(value + direction * step * factor));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommit(textValue);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditing(false);
        setTextValue(
          precision > 0
            ? previousValueRef.current.toFixed(precision)
            : previousValueRef.current.toString(),
        );
        onChange(previousValueRef.current);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const factor = e.shiftKey ? 0.1 : 1.0;
        const next = clamp(parseFloat(textValue || '0') + step * factor);
        setTextValue(next.toString());
        onChange(next);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const factor = e.shiftKey ? 0.1 : 1.0;
        const next = clamp(parseFloat(textValue || '0') - step * factor);
        setTextValue(next.toString());
        onChange(next);
      }
    }
  };

  const hasRange = min !== -Infinity && max !== Infinity && max > min;
  const progressPct = hasRange
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  return (
    <div
      className={`relative group flex items-center w-full select-none ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      title={description}
    >
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          if (!disabled) {
            setIsEditing(true);
            setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 10);
          }
        }}
        className={`relative flex items-center w-full h-6 rounded border bg-rn-input transition overflow-hidden ${
          isOverridden ? 'border-rn-accent/80' : 'border-rn-border'
        } ${isDragging ? 'cursor-ew-resize border-rn-accent' : 'hover:border-rn-muted/70 cursor-ew-resize'}`}
      >
        {/* Accent bar for modified properties */}
        {isOverridden && (
          <div
            className="absolute left-0 top-0 bottom-0 w-0.5 bg-rn-accent z-10"
            title="Modified from file default"
          />
        )}

        {/* Range Fill Indicator */}
        {hasRange && (
          <div
            className="absolute inset-0 bg-rn-accent/20 pointer-events-none origin-left transition-transform duration-75"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressPct / 100))})` }}
          />
        )}

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={() => handleCommit(textValue)}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent px-2 text-xs font-mono tabular-nums text-rn-text outline-none z-10"
            autoFocus
          />
        ) : (
          <div className="flex items-center justify-between w-full h-full px-2 text-xs font-mono tabular-nums text-rn-text z-0">
            <span className="truncate text-rn-muted">{label ? `${label}: ` : ''}</span>
            <span className="font-medium truncate">
              {precision > 0 ? value.toFixed(precision) : value}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        )}

        {/* Micro step up/down chevrons */}
        {!isEditing && !disabled && (
          <div className="absolute right-1 flex flex-col opacity-0 group-hover:opacity-80 transition z-10">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => handleStep(1, e)}
              className="text-rn-muted hover:text-rn-text p-0.5"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => handleStep(-1, e)}
              className="text-rn-muted hover:text-rn-text p-0.5"
            >
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Reset button when overridden */}
      {isOverridden && onReset && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="ml-1.5 p-1 rounded text-rn-accent hover:bg-rn-subpanel hover:text-rn-text transition flex-shrink-0"
          title="Reset to file default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
