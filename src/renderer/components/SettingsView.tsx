import { useQueueStore } from '../store/queueStore';
import { playTodungSound } from '../utils/soundPlayer';
import { BlenderNumberField } from './controls/BlenderNumberField';
import { SegmentedEnumToggle } from './controls/SegmentedEnumToggle';

import React, { useState } from 'react';

import { Cpu, HardDrive, Layers, Moon, RefreshCw, Shield, Volume2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    blenders,
    selectedBlenderId,
    setSelectedBlenderId,
    loadBlenders,
    isolatedMode,
    setIsolatedMode,
    autoExec,
    setAutoExec,
    soundSettings,
    setSoundSettings,
    globalSettings,
    setGlobalSettings,
  } = useQueueStore();

  const [activeSection, setActiveSection] = useState<
    'blender' | 'rendering' | 'performance' | 'sound' | 'power' | 'safety' | 'retries'
  >('blender');
  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescanBlenders = async () => {
    setIsRescanning(true);
    try {
      await loadBlenders();
    } finally {
      setIsRescanning(false);
    }
  };

  const handleTestSound = () => {
    playTodungSound(soundSettings.volume / 100, soundSettings.isMuted);
  };

  const sections = [
    { id: 'blender' as const, label: 'Blender Versions', icon: Layers },
    { id: 'rendering' as const, label: 'Rendering Defaults', icon: Cpu },
    { id: 'performance' as const, label: 'Performance & Threads', icon: Cpu },
    { id: 'sound' as const, label: 'Sound & Notifications', icon: Volume2 },
    { id: 'power' as const, label: 'Power & Sleep', icon: Moon },
    { id: 'safety' as const, label: 'Safety & Disk Space', icon: HardDrive },
    { id: 'retries' as const, label: 'Crash Recovery Policy', icon: Shield },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-rn-bg p-6 text-rn-text select-none">
      <div className="flex h-full rounded-xl border border-rn-border bg-rn-panel shadow-xl overflow-hidden">
        {/* Left Section Nav */}
        <div className="w-56 flex-shrink-0 border-r border-rn-border bg-rn-subpanel/40 p-3 space-y-1">
          <div className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wider">
            Settings
          </div>

          {sections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`flex w-full items-center space-x-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? 'bg-rn-accent text-white font-semibold shadow-sm'
                    : 'text-rn-muted hover:bg-rn-subpanel hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Section Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 1. Blender Versions */}
          {activeSection === 'blender' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Blender Installations</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Render Night automatically discovers system, Steam, Flatpak and Snap Blender
                  installations.
                </p>
              </div>

              <div className="space-y-2">
                {blenders.map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded-lg border p-3 text-xs transition ${
                      selectedBlenderId === b.id
                        ? 'border-rn-accent bg-rn-accent/10'
                        : 'border-rn-border bg-[#222222]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">Blender {b.version}</span>
                        <span className="rounded bg-rn-input px-1.5 py-0.5 text-[10px] font-mono text-rn-muted">
                          {b.isPortable ? 'Portable' : b.source}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-rn-muted mt-0.5 truncate max-w-md">
                        {b.displayPath}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedBlenderId(b.id)}
                      className={`rounded px-3 py-1 text-xs font-medium transition ${
                        selectedBlenderId === b.id
                          ? 'bg-rn-accent text-white'
                          : 'border border-rn-border bg-rn-input text-rn-text hover:border-rn-muted'
                      }`}
                    >
                      {selectedBlenderId === b.id ? 'Default' : 'Set Default'}
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRescanBlenders}
                disabled={isRescanning}
                className="flex items-center space-x-1.5 rounded border border-rn-border bg-rn-input px-3 py-1.5 text-xs text-rn-text hover:border-rn-muted transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                <span>{isRescanning ? 'Scanning...' : 'Rescan Installations'}</span>
              </button>
            </div>
          )}

          {/* 2. Rendering Defaults */}
          {activeSection === 'rendering' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Rendering Defaults</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Launch parameters passed to every Blender subprocess during batch execution.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isolatedMode}
                    onChange={(e) => setIsolatedMode(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">
                      Isolated Factory Startup (--factory-startup)
                    </span>
                    <p className="text-[11px] text-rn-muted mt-0.5">
                      Prevents third-party user addons and startup scripts from interfering with
                      render stability.
                    </p>
                  </div>
                </label>

                <div className="h-px bg-rn-border/50" />

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoExec}
                    onChange={(e) => setAutoExec(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">
                      Enable Python Script Auto-execution (-y)
                    </span>
                    <p className="text-[11px] text-rn-muted mt-0.5">
                      Allows execution of procedural drivers and rig scripts embedded inside project
                      .blend files.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* 3. Performance & Threads */}
          {activeSection === 'performance' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Performance & Process Priority</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Tune CPU allocation and background OS scheduling.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-4">
                <div>
                  <span className="text-xs font-bold text-white block mb-1">Process Priority</span>
                  <SegmentedEnumToggle
                    value={globalSettings.defaultPriority || 'normal'}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'below-normal', label: 'Below Normal' },
                      { value: 'low', label: 'Low (Idle)' },
                    ]}
                    onChange={(val) =>
                      setGlobalSettings({
                        defaultPriority: val as 'normal' | 'below-normal' | 'low',
                      })
                    }
                  />
                </div>

                <div>
                  <span className="text-xs font-bold text-white block mb-1">CPU Thread Limit</span>
                  <div className="w-48">
                    <BlenderNumberField
                      value={globalSettings.defaultThreads || 0}
                      min={0}
                      max={128}
                      step={1}
                      onChange={(val) => setGlobalSettings({ defaultThreads: val })}
                      unit="threads (0 = auto)"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Sound & Notifications */}
          {activeSection === 'sound' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Finish Sound Notification</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Plays the satisfying "to-DUNG" chime when the overnight queue finishes.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!soundSettings.isMuted}
                    onChange={(e) => setSoundSettings({ isMuted: !e.target.checked })}
                    className="h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <span className="text-xs font-bold text-white">
                    Play finish sound on queue completion
                  </span>
                </label>

                <div>
                  <span className="text-xs font-bold text-white block mb-1">
                    Notification Volume: {soundSettings.volume}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={soundSettings.volume}
                    onChange={(e) => setSoundSettings({ volume: parseInt(e.target.value, 10) })}
                    className="w-full h-2 bg-rn-input rounded-lg appearance-none cursor-pointer accent-rn-accent"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestSound}
                  className="flex items-center space-x-1.5 rounded border border-rn-border bg-rn-input px-3 py-1.5 text-xs text-white hover:border-rn-muted transition"
                >
                  <Volume2 className="h-3.5 w-3.5 text-green-400" />
                  <span>Preview Finish Chime</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. Power & Sleep */}
          {activeSection === 'power' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Power & Sleep Management</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Controls OS-level power assertions to prevent machines from sleeping unattended.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={globalSettings.blockSleepDuringRender}
                    onChange={(e) =>
                      setGlobalSettings({ blockSleepDuringRender: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">
                      Prevent sleep while rendering
                    </span>
                    <p className="text-[11px] text-rn-muted mt-0.5">
                      Holds an OS powerSaveBlocker assertion while Blender is rendering frames.
                    </p>
                  </div>
                </label>

                <div className="h-px bg-rn-border/50" />

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={globalSettings.blockSleepWhileScheduled}
                    onChange={(e) =>
                      setGlobalSettings({ blockSleepWhileScheduled: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">
                      Prevent sleep while waiting for schedule
                    </span>
                    <p className="text-[11px] text-rn-muted mt-0.5">
                      Keeps the system awake if a queue is scheduled to start at a future hour.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* 6. Safety & Disk */}
          {activeSection === 'safety' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Safety & Disk Space Threshold</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Preflight guardrails to protect against disk exhaustion during large image
                  sequence renders.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-3">
                <div>
                  <span className="text-xs font-bold text-white block mb-1">
                    Minimum Free Disk Space Threshold
                  </span>
                  <div className="w-48">
                    <BlenderNumberField
                      value={globalSettings.minFreeDiskSpaceMb || 1024}
                      min={100}
                      max={100000}
                      step={512}
                      onChange={(val) => setGlobalSettings({ minFreeDiskSpaceMb: val })}
                      unit="MB"
                    />
                  </div>
                  <p className="text-[11px] text-rn-muted mt-1.5">
                    Jobs rendering to drives with less free space than this threshold will trigger
                    pre-flight warnings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 7. Crash Recovery Policy */}
          {activeSection === 'retries' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-white">Global Crash Recovery Policy</h3>
                <p className="text-xs text-rn-muted mt-0.5">
                  Default retry behavior when a Blender worker process crashes or exits
                  unexpectedly.
                </p>
              </div>

              <div className="rounded-lg border border-rn-border bg-[#222222] p-4 space-y-3">
                <div>
                  <span className="text-xs font-bold text-white block mb-1">
                    Default Frame Retries
                  </span>
                  <div className="w-48">
                    <BlenderNumberField
                      value={globalSettings.defaultCrashPolicy?.maxRetries ?? 3}
                      min={0}
                      max={10}
                      step={1}
                      onChange={(val) =>
                        setGlobalSettings({
                          defaultCrashPolicy: {
                            ...globalSettings.defaultCrashPolicy,
                            maxRetries: val,
                          },
                        })
                      }
                      unit="attempts"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-white block mb-1">
                    Consecutive Crash Limit
                  </span>
                  <div className="w-48">
                    <BlenderNumberField
                      value={globalSettings.defaultCrashPolicy?.maxConsecutiveCrashes ?? 2}
                      min={1}
                      max={10}
                      step={1}
                      onChange={(val) =>
                        setGlobalSettings({
                          defaultCrashPolicy: {
                            ...globalSettings.defaultCrashPolicy,
                            maxConsecutiveCrashes: val,
                          },
                        })
                      }
                      unit="crashes"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-3 cursor-pointer pt-2 border-t border-rn-border/50">
                  <input
                    type="checkbox"
                    checked={globalSettings.defaultCrashPolicy?.fallbackToCpu ?? true}
                    onChange={(e) =>
                      setGlobalSettings({
                        defaultCrashPolicy: {
                          ...globalSettings.defaultCrashPolicy,
                          fallbackToCpu: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                  />
                  <span className="text-xs font-bold text-white">
                    Automatically fallback to CPU rendering after GPU crashes
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
