import React, { useEffect } from 'react';

import { Keyboard, X } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { key: `${modKey}+O`, desc: 'Add .blend files to queue' },
    { key: `${modKey}+Enter`, desc: 'Start or Pause queue render' },
    { key: `${modKey}+A`, desc: 'Select all jobs in queue' },
    { key: `${modKey}+D`, desc: 'Duplicate selected job(s)' },
    { key: 'Delete / Backspace', desc: 'Remove selected job(s) from queue' },
    { key: `${modKey}+C`, desc: 'Copy RNA overrides from active job' },
    { key: `${modKey}+V`, desc: 'Paste RNA overrides onto selected job(s)' },
    { key: `${modKey}+1`, desc: 'Switch to Queue view' },
    { key: `${modKey}+2`, desc: 'Switch to History view' },
    { key: `${modKey}+3`, desc: 'Switch to Sequences view' },
    { key: `${modKey}+,`, desc: 'Open Settings' },
    { key: '?', desc: 'Show this keyboard shortcuts cheat sheet' },
    { key: 'Esc', desc: 'Deselect all / close modal / cancel editing' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm select-none animate-in fade-in duration-100">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-rn-border bg-rn-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-rn-border px-5 bg-rn-subpanel">
          <div className="flex items-center space-x-2">
            <Keyboard className="h-4 w-4 text-rn-accent" />
            <span className="font-semibold text-rn-text text-sm">Keyboard Shortcuts</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-rn-muted hover:text-rn-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((sc, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-rn-subpanel/50 text-xs transition"
            >
              <span className="text-rn-muted">{sc.desc}</span>
              <kbd className="rounded border border-rn-border bg-rn-input px-2 py-0.5 font-mono text-[11px] font-semibold text-rn-accent shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
