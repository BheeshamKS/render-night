import type { CrashPolicy } from '../../../core/schemas/override';
import type { FrameRangeConfig } from '../../../core/schemas/queue-state';
import { type QueueJob, useQueueStore } from '../../store/queueStore';
import { BlenderDropdown } from '../controls/BlenderDropdown';
import { BlenderNumberField } from '../controls/BlenderNumberField';
import { CollapsiblePanel } from '../controls/CollapsiblePanel';

import React from 'react';

export interface JobSettingsTabProps {
  job: QueueJob;
}

export const JobSettingsTab: React.FC<JobSettingsTabProps> = ({ job }) => {
  const { updateJob, setJobRangeConfig } = useQueueStore();

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene);
  const availableScenes = job.scenes.map((s) => ({ value: s.name, label: s.name }));
  const availableCameras = (job.availableCameras || []).map((c) => ({ value: c, label: c }));

  const crashPolicy: CrashPolicy = job.crashPolicy || {
    maxRetries: 3,
    maxConsecutiveCrashes: 2,
    fallbackToCpu: true,
    skipOnFailure: false,
  };

  const sceneDefaults = {
    start: currentScene?.frameStart ?? 1,
    end: currentScene?.frameEnd ?? 250,
    step: currentScene?.frameStep ?? 1,
  };

  const handleRangeModeChange = (mode: string) => {
    const m = mode as FrameRangeConfig['mode'];
    const config: FrameRangeConfig = {
      mode: m,
      simple: job.rangeConfig.simple || {
        start: sceneDefaults.start,
        end: sceneDefaults.end,
        step: sceneDefaults.step,
      },
      customExpression:
        job.rangeConfig.customExpression || `${sceneDefaults.start}-${sceneDefaults.end}`,
      singleStillFrame: job.rangeConfig.singleStillFrame ?? sceneDefaults.start,
    };
    setJobRangeConfig(job.id, config);
  };

  const handleCrashPolicyChange = (updates: Partial<CrashPolicy>) => {
    updateJob(job.id, {
      crashPolicy: { ...crashPolicy, ...updates },
    });
  };

  return (
    <div className="space-y-2 text-xs select-none">
      {/* 1. Scene & Camera Selection */}
      <CollapsiblePanel title="Scene & Camera" defaultOpen={true}>
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-rn-muted font-medium w-2/5">Scene</span>
            <div className="w-3/5">
              <BlenderDropdown
                value={job.selectedScene}
                options={availableScenes}
                onChange={(val) => updateJob(job.id, { selectedScene: val })}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-rn-muted font-medium w-2/5">Camera</span>
            <div className="w-3/5">
              <BlenderDropdown
                value={job.selectedCamera}
                options={availableCameras}
                onChange={(val) => updateJob(job.id, { selectedCamera: val })}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      {/* 2. Frame Range Configuration */}
      <CollapsiblePanel title="Frame Range" defaultOpen={true}>
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-rn-muted font-medium w-2/5">Range Mode</span>
            <div className="w-3/5">
              <BlenderDropdown
                value={job.rangeConfig.mode}
                options={[
                  { value: 'scene_default', label: 'Scene Default' },
                  { value: 'simple', label: 'Simple (Start/End/Step)' },
                  { value: 'custom', label: 'Custom Multi-range' },
                  { value: 'single_still', label: 'Single Still' },
                ]}
                onChange={handleRangeModeChange}
                className="w-full"
              />
            </div>
          </div>

          {job.rangeConfig.mode === 'simple' && (
            <div className="space-y-1.5 pt-1 border-t border-rn-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-rn-muted w-2/5">Start Frame</span>
                <div className="w-3/5">
                  <BlenderNumberField
                    value={job.rangeConfig.simple?.start ?? sceneDefaults.start}
                    onChange={(val) =>
                      setJobRangeConfig(job.id, {
                        ...job.rangeConfig,
                        simple: {
                          start: val,
                          end: job.rangeConfig.simple?.end ?? sceneDefaults.end,
                          step: job.rangeConfig.simple?.step ?? sceneDefaults.step,
                        },
                      })
                    }
                    step={1}
                    unit="f"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-rn-muted w-2/5">End Frame</span>
                <div className="w-3/5">
                  <BlenderNumberField
                    value={job.rangeConfig.simple?.end ?? sceneDefaults.end}
                    onChange={(val) =>
                      setJobRangeConfig(job.id, {
                        ...job.rangeConfig,
                        simple: {
                          start: job.rangeConfig.simple?.start ?? sceneDefaults.start,
                          end: val,
                          step: job.rangeConfig.simple?.step ?? sceneDefaults.step,
                        },
                      })
                    }
                    step={1}
                    unit="f"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-rn-muted w-2/5">Frame Step</span>
                <div className="w-3/5">
                  <BlenderNumberField
                    value={job.rangeConfig.simple?.step ?? sceneDefaults.step}
                    min={1}
                    onChange={(val) =>
                      setJobRangeConfig(job.id, {
                        ...job.rangeConfig,
                        simple: {
                          start: job.rangeConfig.simple?.start ?? sceneDefaults.start,
                          end: job.rangeConfig.simple?.end ?? sceneDefaults.end,
                          step: val,
                        },
                      })
                    }
                    step={1}
                  />
                </div>
              </div>
            </div>
          )}

          {job.rangeConfig.mode === 'custom' && (
            <div className="space-y-1 pt-1 border-t border-rn-border/50">
              <label className="text-[11px] text-rn-muted">
                Frame Expression (e.g. 1-50, 75, 120-240x2)
              </label>
              <input
                type="text"
                value={job.rangeConfig.customExpression || ''}
                onChange={(e) =>
                  setJobRangeConfig(job.id, {
                    ...job.rangeConfig,
                    customExpression: e.target.value,
                  })
                }
                placeholder="1-50, 75, 100-200"
                className="w-full rounded border border-rn-border bg-rn-input px-2 py-1 text-xs text-rn-text font-mono focus:border-rn-accent focus:outline-none"
              />
              {job.customRangeError && (
                <p className="text-[10px] text-rn-error">{job.customRangeError}</p>
              )}
            </div>
          )}

          {job.rangeConfig.mode === 'single_still' && (
            <div className="flex items-center justify-between pt-1 border-t border-rn-border/50">
              <span className="text-[11px] text-rn-muted w-2/5">Still Frame</span>
              <div className="w-3/5">
                <BlenderNumberField
                  value={job.rangeConfig.singleStillFrame ?? sceneDefaults.start}
                  onChange={(val) =>
                    setJobRangeConfig(job.id, {
                      ...job.rangeConfig,
                      singleStillFrame: val,
                    })
                  }
                  step={1}
                  unit="f"
                />
              </div>
            </div>
          )}

          {/* Missing Frames Only */}
          {!job.isVideo && (
            <div className="flex items-center justify-between pt-1 border-t border-rn-border/40">
              <span className="text-[11px] text-rn-muted">Render missing frames only</span>
              <input
                type="checkbox"
                checked={job.renderMissingOnly || false}
                onChange={(e) => updateJob(job.id, { renderMissingOnly: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
              />
            </div>
          )}
        </div>
      </CollapsiblePanel>

      {/* 3. Crash Recovery Policy */}
      <CollapsiblePanel title="Crash Recovery Policy" defaultOpen={false}>
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-rn-muted w-2/5">Max Frame Retries</span>
            <div className="w-3/5">
              <BlenderNumberField
                value={crashPolicy.maxRetries}
                min={0}
                max={10}
                onChange={(val) => handleCrashPolicyChange({ maxRetries: val })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-rn-muted w-2/5">Consecutive Crash Limit</span>
            <div className="w-3/5">
              <BlenderNumberField
                value={crashPolicy.maxConsecutiveCrashes}
                min={1}
                max={10}
                onChange={(val) => handleCrashPolicyChange({ maxConsecutiveCrashes: val })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-rn-border/40">
            <span className="text-[11px] text-rn-muted">Fallback to CPU on crash</span>
            <input
              type="checkbox"
              checked={crashPolicy.fallbackToCpu}
              onChange={(e) => handleCrashPolicyChange({ fallbackToCpu: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
            />
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  );
};
