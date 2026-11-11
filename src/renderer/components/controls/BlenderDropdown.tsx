import React, { useEffect, useRef, useState } from 'react';

import { Check, ChevronDown, Search } from 'lucide-react';

export interface BlenderDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface BlenderDropdownProps {
  value: string;
  options: BlenderDropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  isOverridden?: boolean;
  title?: string;
}

export const BlenderDropdown: React.FC<BlenderDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  searchable = true,
  className = '',
  isOverridden = false,
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions =
    searchable && search.trim() !== ''
      ? options.filter(
          (opt) =>
            opt.label.toLowerCase().includes(search.toLowerCase()) ||
            (opt.sublabel && opt.sublabel.toLowerCase().includes(search.toLowerCase())),
        )
      : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
    }
  }, [isOpen, searchable]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        const target = filteredOptions[highlightedIndex];
        if (!target.disabled) {
          onChange(target.value);
          setIsOpen(false);
          setSearch('');
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-block text-left text-xs select-none ${className} ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      title={title}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex h-6 w-full items-center justify-between rounded border px-2 py-0.5 text-xs text-rn-text transition focus:outline-none ${
          isOverridden ? 'border-rn-accent/80 bg-rn-accent/10' : 'border-rn-border bg-rn-input'
        } hover:border-rn-muted/70 active:bg-rn-subpanel`}
      >
        <span className="truncate pr-1">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-rn-muted transition-transform duration-100" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 min-w-[160px] w-full overflow-hidden rounded border border-rn-border bg-rn-panel shadow-2xl animate-in fade-in zoom-in-95 duration-75">
          {searchable && options.length > 5 && (
            <div className="border-b border-rn-border p-1 bg-rn-input/60">
              <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rn-bg border border-rn-border">
                <Search className="h-3 w-3 text-rn-muted flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Filter..."
                  className="w-full bg-transparent text-xs text-rn-text placeholder-rn-muted focus:outline-none"
                />
              </div>
            </div>
          )}

          <div ref={listRef} className="max-h-48 overflow-y-auto py-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-rn-muted italic">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (!opt.disabled) {
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch('');
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex w-full items-center justify-between px-2.5 py-1 text-left text-xs transition ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : isSelected
                          ? 'bg-rn-accent text-white font-medium'
                          : isHighlighted
                            ? 'bg-rn-subpanel text-rn-text'
                            : 'text-rn-text hover:bg-rn-subpanel'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <span>{opt.label}</span>
                      {opt.sublabel && (
                        <span
                          className={`ml-1.5 text-[10px] font-mono ${
                            isSelected ? 'text-white/80' : 'text-rn-muted'
                          }`}
                        >
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-3 w-3 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
