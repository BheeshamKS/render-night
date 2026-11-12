import { useQueueStore } from '../store/queueStore';

import React, { useMemo, useState } from 'react';

import { Calendar, Clock, Moon, Play, Power, Square, Timer, X } from 'lucide-react';

export const ScheduleModal: React.FC = () => {
  const {
    showScheduleModal,
    setShowScheduleModal,
    scheduleConfig,
    setSchedule,
    cancelSchedule,
    startQueue,
    queueState,
  } = useQueueStore();

  const [startMode, setStartMode] = useState<'scheduled' | 'now'>(
    scheduleConfig.startImmediately ? 'now' : 'scheduled',
  );
  const [startTimeStr, setStartTimeStr] = useState(scheduleConfig.time || '23:00');
  const [stopEnabled, setStopEnabled] = useState(scheduleConfig.stopEnabled ?? true);
  const [stopTimeStr, setStopTimeStr] = useState(scheduleConfig.stopTime || '06:00');
  const [stopAction, setStopAction] = useState<'shutdown' | 'sleep' | 'close_app' | 'stop_only'>(
    scheduleConfig.stopAction || 'shutdown',
  );
  const [blockSleep, setBlockSleep] = useState(scheduleConfig.blockSleep ?? true);

  // Compute calculated duration between start and stop time
  const calculatedDuration = useMemo(() => {
    if (!stopEnabled || !stopTimeStr) return null;
    const [startH, startM] = (startMode === 'now' ? '00:00' : startTimeStr).split(':').map(Number);
    const [stopH, stopM] = stopTimeStr.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(stopH) || isNaN(stopM)) return null;

    let diffMinutes = stopH * 60 + stopM - (startH * 60 + startM);
    if (diffMinutes <= 0) {
      diffMinutes += 24 * 60; // Next day
    }
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
  }, [startMode, startTimeStr, stopEnabled, stopTimeStr]);

  if (!showScheduleModal) return null;

  const handleApplySchedule = async () => {
    if (startMode === 'scheduled' && !startTimeStr) return;
    if (stopEnabled && !stopTimeStr) return;

    await setSchedule({
      enabled: true,
      time: startTimeStr,
      startImmediately: startMode === 'now',
      stopEnabled,
      stopTime: stopTimeStr,
      stopAction,
      blockSleep,
    });
    setShowScheduleModal(false);
  };

  const handleStartNow = async () => {
    if (stopEnabled) {
      // Keep stop schedule active, but start immediately
      await setSchedule({
        enabled: true,
        time: startTimeStr,
        startImmediately: true,
        stopEnabled: true,
        stopTime: stopTimeStr,
        stopAction,
        blockSleep,
      });
      setShowScheduleModal(false);
      await startQueue();
    } else {
      await cancelSchedule();
      setShowScheduleModal(false);
      await startQueue();
    }
  };

  const actionLabels: Record<string, string> = {
    shutdown: 'Shut Down Computer',
    sleep: 'Put Computer to Sleep',
    close_app: 'Close Render Night',
    stop_only: 'Stop Queue Only',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-md rounded-xl border border-rn-border bg-rn-panel p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rn-border pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-rn-accent" />
            <h2 className="text-sm font-semibold text-rn-text">Queue Scheduling</h2>
          </div>
          <button
            onClick={() => setShowScheduleModal(false)}
            className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {scheduleConfig.enabled ? (
          /* Active Schedule State */
          <div className="space-y-4">
            <div className="rounded-lg bg-rn-subpanel p-4 border border-rn-accent/40 text-center space-y-2">
              <Timer className="h-6 w-6 text-rn-accent mx-auto" />
              <div className="text-xs font-semibold text-rn-text">Active Schedule Configured</div>

              <div className="grid grid-cols-2 gap-2 text-left bg-rn-input/60 rounded p-3 border border-rn-border/50 text-xs">
                <div>
                  <span className="text-rn-muted block text-[10px]">Start Time:</span>
                  <span className="font-semibold text-rn-text font-mono">
                    {scheduleConfig.startImmediately
                      ? queueState === 'running'
                        ? 'Running'
                        : 'Immediate'
                      : `At ${scheduleConfig.time}`}
                  </span>
                </div>
                <div>
                  <span className="text-rn-muted block text-[10px]">Stop Time:</span>
                  <span className="font-semibold text-rn-accent font-mono">
                    {scheduleConfig.stopEnabled
                      ? `At ${scheduleConfig.stopTime}`
                      : 'Until queue ends'}
                  </span>
                </div>
              </div>

              {scheduleConfig.stopEnabled && (
                <div className="text-xs text-rn-muted pt-1">
                  Action at{' '}
                  <strong className="font-mono text-rn-text">{scheduleConfig.stopTime}</strong>:{' '}
                  <span className="font-semibold text-rn-accent">
                    {actionLabels[scheduleConfig.stopAction || 'shutdown']}
                  </span>
                </div>
              )}

              {scheduleConfig.blockSleep && (
                <div className="flex items-center justify-center space-x-1 text-[11px] text-rn-success pt-1">
                  <Moon className="h-3 w-3" />
                  <span>Sleep blocker active</span>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-1">
              {queueState === 'idle' && (
                <button
                  type="button"
                  onClick={handleStartNow}
                  className="flex-1 flex items-center justify-center space-x-1.5 rounded-md bg-rn-accent px-3 py-2 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition shadow-sm"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Start Queue Now</span>
                </button>
              )}
              <button
                type="button"
                onClick={cancelSchedule}
                className="flex-1 flex items-center justify-center space-x-1 rounded-md border border-rn-border bg-rn-subpanel px-3 py-2 text-xs font-medium text-rn-text hover:bg-rn-error/15 hover:text-rn-error hover:border-rn-error/40 transition"
              >
                <span>Cancel Schedule</span>
              </button>
            </div>
          </div>
        ) : (
          /* Configuration State */
          <div className="space-y-4">
            {/* 1. Start Time Section */}
            <div className="rounded-lg border border-rn-border bg-rn-subpanel/50 p-3 space-y-2">
              <span className="text-xs font-semibold text-rn-text flex items-center space-x-1.5">
                <Clock className="h-3.5 w-3.5 text-rn-accent" />
                <span>1. Queue Start Time</span>
              </span>

              <div className="flex items-center space-x-4 text-xs pt-1">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="start-mode"
                    checked={startMode === 'scheduled'}
                    onChange={() => setStartMode('scheduled')}
                    className="accent-rn-accent"
                  />
                  <span>Start at scheduled time</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="start-mode"
                    checked={startMode === 'now'}
                    onChange={() => setStartMode('now')}
                    className="accent-rn-accent"
                  />
                  <span>Start immediately</span>
                </label>
              </div>

              {startMode === 'scheduled' && (
                <div className="pt-1">
                  <input
                    type="time"
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full rounded border border-rn-border bg-rn-input px-3 py-1.5 text-xs text-rn-text font-mono focus:border-rn-accent focus:outline-none"
                  />
                  <p className="text-[10px] text-rn-muted mt-1">
                    If this time has passed today, it will schedule for tomorrow.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Stop Time & Shutdown Section */}
            <div className="rounded-lg border border-rn-border bg-rn-subpanel/50 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rn-text flex items-center space-x-1.5">
                  <Power className="h-3.5 w-3.5 text-rn-rendering" />
                  <span>2. Stop Time & Automatic Action</span>
                </span>
                <input
                  type="checkbox"
                  checked={stopEnabled}
                  onChange={(e) => setStopEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-rn-border bg-rn-input accent-rn-accent cursor-pointer"
                />
              </div>

              {stopEnabled && (
                <div className="space-y-2 pt-1 border-t border-rn-border/50">
                  <div>
                    <label className="text-[11px] text-rn-muted block mb-1">
                      Stop rendering at (HH:MM):
                    </label>
                    <input
                      type="time"
                      value={stopTimeStr}
                      onChange={(e) => setStopTimeStr(e.target.value)}
                      className="w-full rounded border border-rn-border bg-rn-input px-3 py-1.5 text-xs text-rn-text font-mono focus:border-rn-accent focus:outline-none"
                    />
                    {calculatedDuration && (
                      <p className="text-[10px] text-rn-accent mt-1 font-medium">
                        Rendering window: ~{calculatedDuration}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] text-rn-muted block mb-1">
                      When stop time is reached:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'shutdown' as const, label: 'Shut Down Computer', icon: Power },
                        { id: 'sleep' as const, label: 'Put Computer to Sleep', icon: Moon },
                        { id: 'close_app' as const, label: 'Close Render Night', icon: X },
                        { id: 'stop_only' as const, label: 'Stop Queue Only', icon: Square },
                      ].map((act) => {
                        const Icon = act.icon;
                        const isSelected = stopAction === act.id;
                        return (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => setStopAction(act.id)}
                            className={`flex items-center space-x-1.5 rounded border px-2 py-1.5 text-xs font-medium transition ${
                              isSelected
                                ? 'border-rn-accent bg-rn-accent/15 text-rn-accent font-semibold'
                                : 'border-rn-border bg-rn-input text-rn-muted hover:text-rn-text'
                            }`}
                          >
                            <Icon className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{act.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sleep Blocker */}
            <div className="flex items-center justify-between px-1">
              <div>
                <div className="text-xs text-rn-text">
                  Prevent computer sleep while waiting or rendering
                </div>
                <div className="text-[10px] text-rn-muted">
                  Keeps system awake until scheduled stop or completion
                </div>
              </div>
              <input
                type="checkbox"
                checked={blockSleep}
                onChange={(e) => setBlockSleep(e.target.checked)}
                className="h-4 w-4 rounded border-rn-border bg-rn-input accent-rn-accent cursor-pointer"
              />
            </div>

            {/* Actions */}
            <div className="border-t border-rn-border pt-3 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="rounded border border-rn-border bg-rn-subpanel px-3 py-1.5 text-xs text-rn-muted hover:text-rn-text transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySchedule}
                className="rounded-md bg-rn-accent px-4 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition shadow-sm"
              >
                Activate Schedule
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
