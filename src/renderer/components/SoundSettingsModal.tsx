import { useQueueStore } from '../store/queueStore';
import { playTodungSound } from '../utils/soundPlayer';

import React from 'react';

import { Bell, Volume2, VolumeX, X } from 'lucide-react';

export const SoundSettingsModal: React.FC = () => {
  const { showSoundModal, setShowSoundModal, soundSettings, setSoundSettings } = useQueueStore();

  if (!showSoundModal) return null;

  const handleTestSound = () => {
    playTodungSound(soundSettings.volume / 100, soundSettings.isMuted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-sm rounded-lg border border-rn-border bg-rn-panel p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-rn-border pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <Bell className="h-4 w-4 text-rn-accent" />
            <h2 className="text-sm font-semibold text-rn-text">Completion Sound ("To-Dung")</h2>
          </div>
          <button
            onClick={() => setShowSoundModal(false)}
            className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Mute toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-rn-text">Enable completion sound</span>
            <button
              onClick={() => setSoundSettings({ isMuted: !soundSettings.isMuted })}
              className={`flex items-center space-x-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                !soundSettings.isMuted
                  ? 'bg-rn-accent/20 text-rn-accent border border-rn-accent/40'
                  : 'bg-rn-subpanel text-rn-muted border border-rn-border'
              }`}
            >
              {!soundSettings.isMuted ? (
                <>
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Unmuted</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5" />
                  <span>Muted</span>
                </>
              )}
            </button>
          </div>

          {/* Volume slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-rn-muted">Volume:</span>
              <span className="font-mono text-rn-text font-semibold">{soundSettings.volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={soundSettings.volume}
              disabled={soundSettings.isMuted}
              onChange={(e) => setSoundSettings({ volume: Number.parseInt(e.target.value, 10) })}
              className="w-full h-1.5 bg-rn-subpanel rounded-lg appearance-none cursor-pointer accent-rn-accent disabled:opacity-40"
            />
          </div>

          {/* Play on failure toggle */}
          <div className="flex items-center justify-between border-t border-rn-border/50 pt-3">
            <div>
              <div className="text-xs text-rn-text">Also play on failure</div>
              <div className="text-[10px] text-rn-muted">Triggers finish sound if render fails</div>
            </div>
            <input
              type="checkbox"
              checked={soundSettings.playOnFailure}
              onChange={(e) => setSoundSettings({ playOnFailure: e.target.checked })}
              className="h-4 w-4 rounded border-rn-border bg-rn-input accent-rn-accent cursor-pointer"
            />
          </div>

          {/* Test button */}
          <div className="border-t border-rn-border pt-4 flex justify-end space-x-2">
            <button
              onClick={handleTestSound}
              disabled={soundSettings.isMuted}
              className="flex items-center space-x-1.5 rounded-md border border-rn-border bg-rn-subpanel px-3 py-1.5 text-xs font-medium text-rn-text hover:border-rn-accent hover:text-rn-accent transition disabled:opacity-40"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Test Sound</span>
            </button>
            <button
              onClick={() => setShowSoundModal(false)}
              className="rounded-md bg-rn-accent px-3 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
