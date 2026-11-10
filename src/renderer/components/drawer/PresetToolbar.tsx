import type { Preset } from '../../../core/schemas/preset';
import { useQueueStore, type QueueJob } from '../../store/queueStore';

import React, { useEffect, useState } from 'react';

import { Check, Copy, Download, FolderInput, Plus, RotateCcw } from 'lucide-react';

export interface PresetToolbarProps {
  job: QueueJob;
}

export const PresetToolbar: React.FC<PresetToolbarProps> = ({ job }) => {
  const {
    copiedOverrides,
    copyOverrides,
    pasteOverrides,
    resetAllJobOverrides,
    applyPresetToJob,
    addLog,
  } = useQueueStore();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

  const overrideKeys = Object.keys(job.overrides || {});
  const overrideCount = overrideKeys.length;

  useEffect(() => {
    const fetchPresets = async () => {
      if (typeof window !== 'undefined' && window.rnApi?.loadPresets) {
        try {
          const list = await window.rnApi.loadPresets();
          setPresets(list);
        } catch (err) {
          addLog(`Error loading presets: ${(err as Error).message}`);
        }
      }
    };
    fetchPresets();
  }, [addLog]);

  const handleCopy = () => {
    copyOverrides(job.id);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 1500);
  };

  const handlePaste = () => {
    pasteOverrides([job.id]);
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const target = presets.find((p) => p.id === presetId);
    if (target) {
      applyPresetToJob(job.id, target);
    }
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    if (typeof window !== 'undefined' && window.rnApi?.savePreset) {
      try {
        const saved = await window.rnApi.savePreset({
          name: newPresetName.trim(),
          overrides: { ...(job.overrides || {}) },
          engine: job.deviceReport?.engine,
        });
        setPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
        setSelectedPresetId(saved.id);
        setShowSaveModal(false);
        setNewPresetName('');
        addLog(`Saved preset "${saved.name}".`);
      } catch (err) {
        addLog(`Failed to save preset: ${(err as Error).message}`);
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-rn-subpanel/90 border-b border-rn-border text-xs">
      {/* Left: Preset Selector */}
      <div className="flex items-center space-x-2">
        <label className="text-[11px] font-medium text-rn-muted">Preset:</label>
        <select
          value={selectedPresetId}
          onChange={(e) => handleApplyPreset(e.target.value)}
          className="h-6 rounded border border-rn-border bg-rn-input px-2 text-xs text-rn-text outline-none focus:border-rn-accent"
        >
          <option value="">-- Apply Preset --</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({Object.keys(p.overrides || {}).length} keys)
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowSaveModal(true)}
          disabled={overrideCount === 0}
          className="flex items-center space-x-1 h-6 px-2 rounded bg-rn-input border border-rn-border text-rn-muted hover:text-rn-text hover:border-rn-muted transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save current overrides as a new named preset"
        >
          <Plus className="w-3 h-3 text-rn-accent" />
          <span>Save Preset...</span>
        </button>
      </div>

      {/* Right: Copy, Paste, Reset All Actions */}
      <div className="flex items-center space-x-1.5">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 h-6 px-2 rounded bg-rn-input border border-rn-border text-rn-muted hover:text-rn-text hover:border-rn-muted transition"
          title="Copy this job's override diff to clipboard"
        >
          {copiedNotification ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handlePaste}
          disabled={!copiedOverrides || Object.keys(copiedOverrides).length === 0}
          className="flex items-center space-x-1 h-6 px-2 rounded bg-rn-input border border-rn-border text-rn-muted hover:text-rn-text hover:border-rn-muted transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            copiedOverrides
              ? `Paste ${Object.keys(copiedOverrides).length} overrides`
              : 'Clipboard is empty'
          }
        >
          <Download className="w-3 h-3" />
          <span>Paste</span>
        </button>

        {overrideCount > 0 && (
          <button
            type="button"
            onClick={() => resetAllJobOverrides(job.id)}
            className="flex items-center space-x-1 h-6 px-2 rounded bg-rn-input border border-rn-border text-rn-accent hover:text-white hover:bg-rn-accent/30 transition"
            title="Reset all overrides for this job to file defaults"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset All ({overrideCount})</span>
          </button>
        )}
      </div>

      {/* Inline Save Preset Modal Dialog */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded border border-rn-border bg-rn-panel p-4 shadow-xl">
            <h3 className="font-semibold text-sm text-rn-text mb-2 flex items-center space-x-2">
              <FolderInput className="w-4 h-4 text-rn-accent" />
              <span>Save Overrides as Preset</span>
            </h3>
            <p className="text-xs text-rn-muted mb-3">
              Will save {overrideCount} modified property diff(s) under a preset name.
            </p>

            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder='e.g. "1080p / 256 samples / PNG 16-bit"'
              className="w-full h-8 rounded border border-rn-border bg-rn-input px-2.5 text-xs text-rn-text outline-none focus:border-rn-accent mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
                else if (e.key === 'Escape') setShowSaveModal(false);
              }}
            />

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1 rounded bg-rn-subpanel text-xs text-rn-muted hover:text-rn-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1 rounded bg-rn-accent text-xs text-white font-medium hover:bg-rn-accent/90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
