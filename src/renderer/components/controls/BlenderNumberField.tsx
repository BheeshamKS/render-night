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
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState(value.toString());
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ startX: number; startVal: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (e.button !== 0) return; // Primary button only

    dragStartRef.current = {
      startX: e.clientX,
      startVal: value,
    };

    let moved = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.startX;
      if (!moved && Math.abs(deltaX) > 3) {
        moved = true;
        setIsDragging(true);
      }

      if (moved) {
        // Shift gives 0.1x fine tuning
        const sensitivity = moveEvent.shiftKey ? 0.1 : 1.0;
        const deltaVal = (deltaX / 8) * step * sensitivity;
        const nextVal = clamp(dragStartRef.current.startVal + deltaVal);
        onChange(nextVal);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (!moved) {
        // Was a simple click, enter edit mode
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

  // Slider progress bar calculation
  const hasRange = min !== -Infinity && max !== Infinity && max > min;
  const progressPct = hasRange
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  return (
    <div
      className={`relative group flex items-center w-full select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      title={description}
    >
      <div
        onMouseDown={handleMouseDown}
        className={`relative flex items-center w-full h-6 rounded border bg-rn-input transition overflow-hidden ${
          isOverridden ? 'border-rn-accent/80' : 'border-rn-border'
        } ${isDragging ? 'cursor-ew-resize border-rn-accent' : 'hover:border-rn-muted/70 cursor-ew-resize'}`}
      >
        {/* Accent bar for overrides */}
        {isOverridden && (
          <div
            className="absolute left-0 top-0 bottom-0 w-0.5 bg-rn-accent z-10"
            title="Overridden value"
          />
        )}

        {/* Progress fill */}
        {hasRange && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-rn-accent/20 pointer-events-none transition-all duration-75"
            style={{ width: `${progressPct}%` }}
          />
        )}

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={() => handleCommit(textValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit(textValue);
              else if (e.key === 'Escape') {
                setIsEditing(false);
                setTextValue(precision > 0 ? value.toFixed(precision) : value.toString());
              }
            }}
            className="w-full h-full bg-transparent px-2 text-xs font-mono text-rn-text outline-none z-10"
            autoFocus
          />
        ) : (
          <div className="flex items-center justify-between w-full h-full px-2 text-xs font-mono text-rn-text z-0">
            <span className="truncate">{label ? `${label}: ` : ''}</span>
            <span className="font-medium truncate">
              {precision > 0 ? value.toFixed(precision) : value}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        )}

        {/* Micro step buttons on hover */}
        {!isEditing && !disabled && (
          <div className="absolute right-1 flex flex-col opacity-0 group-hover:opacity-80 transition z-10">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => handleStep(1, e)}
              className="text-rn-muted hover:text-white p-0.5"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => handleStep(-1, e)}
              className="text-rn-muted hover:text-white p-0.5"
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
          className="ml-1.5 p-1 rounded text-rn-accent hover:bg-rn-subpanel hover:text-white transition flex-shrink-0"
          title="Reset to file default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
