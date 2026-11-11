import { useQueueStore } from '../store/queueStore';

import React, { useState } from 'react';

import { Calendar, Moon, Play, Timer, X } from 'lucide-react';

export const ScheduleModal: React.FC = () => {
  const {
    showScheduleModal,
    setShowScheduleModal,
    scheduleConfig,
    setSchedule,
    cancelSchedule,
    startQueue,
  } = useQueueStore();

  const [timeStr, setTimeStr] = useState(scheduleConfig.time || '23:00');
  const [blockSleep, setBlockSleep] = useState(scheduleConfig.blockSleep ?? true);

  if (!showScheduleModal) return null;

  const handleApplySchedule = async () => {
    if (!timeStr) return;
    await setSchedule({
      enabled: true,
      time: timeStr,
      blockSleep,
    });
    setShowScheduleModal(false);
  };

  const handleStartNow = async () => {
    await cancelSchedule();
    setShowScheduleModal(false);
    await startQueue();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-sm rounded-lg border border-rn-border bg-rn-panel p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-rn-border pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-rn-accent" />
            <h2 className="text-sm font-bold text-rn-text">One-Shot Queue Scheduler</h2>
          </div>
          <button
            onClick={() => setShowScheduleModal(false)}
            className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {scheduleConfig.enabled ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-rn-subpanel p-4 border border-rn-accent/40 text-center">
              <Timer className="h-6 w-6 text-rn-accent mx-auto mb-2" />
              <div className="text-xs text-rn-muted">Queue scheduled to start at:</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-rn-accent mt-1">
                {scheduleConfig.time}
              </div>
              {scheduleConfig.blockSleep && (
                <div className="mt-2 flex items-center justify-center space-x-1 text-[11px] text-rn-success">
                  <Moon className="h-3 w-3" />
                  <span>Sleep blocker active</span>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={handleStartNow}
                className="flex-1 flex items-center justify-center space-x-1.5 rounded-md bg-rn-accent px-3 py-2 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Start Now</span>
              </button>
              <button
                onClick={cancelSchedule}
                className="flex items-center justify-center space-x-1 rounded-md border border-rn-border bg-rn-subpanel px-3 py-2 text-xs font-medium text-rn-text hover:bg-rn-error/15 hover:text-rn-error hover:border-rn-error/40 transition"
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-rn-muted block mb-1.5">
                Start queue automatically at (HH:MM):
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full rounded border border-rn-border bg-rn-input px-3 py-2 text-sm text-rn-text font-mono focus:border-rn-accent focus:outline-none"
              />
              <p className="text-[10px] text-rn-muted mt-1">
                If the selected time has already passed today, it will schedule for tomorrow.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-rn-border/50 pt-3">
              <div>
                <div className="text-xs text-rn-text">Block sleep while waiting</div>
                <div className="text-[10px] text-rn-muted">
                  Prevents computer from going to sleep before render starts
                </div>
              </div>
              <input
                type="checkbox"
                checked={blockSleep}
                onChange={(e) => setBlockSleep(e.target.checked)}
                className="h-4 w-4 rounded border-rn-border bg-rn-input accent-rn-accent cursor-pointer"
              />
            </div>

            <div className="border-t border-rn-border pt-4 flex justify-end space-x-2">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="rounded border border-rn-border bg-rn-subpanel px-3 py-1.5 text-xs text-rn-muted hover:text-rn-text transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySchedule}
                className="rounded-md bg-rn-accent px-3 py-1.5 text-xs font-semibold text-[#0f0f10] hover:brightness-110 transition"
              >
                Schedule Queue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
