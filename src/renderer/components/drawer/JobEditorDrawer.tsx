import { getActiveEngine, getRnaDefaultValue } from '../../../core/overrides';
import { type QueueJob, useQueueStore } from '../../store/queueStore';
import {
  BlenderDropdown,
  BlenderNumberField,
  CollapsiblePanel,
  PanelRow,
  SegmentedEnumToggle,
} from '../controls';
import { JobSettingsTab } from '../properties/JobSettingsTab';
import { AllPropertiesTree } from './AllPropertiesTree';
import { OutputPropertiesTab } from './OutputPropertiesTab';
import { PresetToolbar } from './PresetToolbar';
import { RenderPropertiesTab } from './RenderPropertiesTab';

import React, { useEffect, useRef } from 'react';

import { RotateCcw, Sliders, X } from 'lucide-react';

export interface JobEditorDrawerProps {
  job: QueueJob;
  onClose: () => void;
}

export const JobEditorDrawer: React.FC<JobEditorDrawerProps> = ({ job, onClose }) => {
  const {
    propertiesPanelWidth,
    setJobOverride,
    resetJobOverride,
    resetAllJobOverrides,
    updateJob,
    setJobRangeConfig,
  } = useQueueStore();

  const drawerRef = useRef<HTMLDivElement>(null);

  // Esc key closes the drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene) || job.scenes[0];
  const activeEngine = getActiveEngine(job);
  const isCycles = activeEngine.includes('CYCLES');

  const overrideKeys = Object.keys(job.overrides || {});
  const overrideCount = overrideKeys.length;

  // Helper to get property state & override handlers
  const getPropState = (rnaPath: string) => {
    const fileDefault = getRnaDefaultValue(currentScene, rnaPath);
    const overrides = job.overrides || {};
    const isOverridden = overrides[rnaPath] !== undefined;
    const value = isOverridden ? overrides[rnaPath] : fileDefault;

    return {
      value,
      fileDefault,
      isOverridden,
      setValue: (val: unknown) => setJobOverride(job.id, rnaPath, val),
      reset: () => resetJobOverride(job.id, rnaPath),
    };
  };

  // Essentials properties
  const engineProp = getPropState('scene.render.engine');
  const deviceProp = getPropState('scene.cycles.device');
  const resXProp = getPropState('scene.render.resolution_x');
  const resYProp = getPropState('scene.render.resolution_y');
  const resPctProp = getPropState('scene.render.resolution_percentage');
  const fileFormatProp = getPropState('scene.render.image_settings.file_format');
  const cyclesSamplesProp = getPropState('scene.cycles.samples');
  const cyclesThresholdProp = getPropState('scene.cycles.adaptive_threshold');
  const eeveeSamplesProp = getPropState('scene.eevee.taa_render_samples');

  // Options
  const sceneOptions = job.scenes.map((s) => ({ value: s.name, label: s.name }));
  const cameraOptions = (job.availableCameras || []).map((c) => ({ value: c, label: c }));

  const engineItems = [
    { identifier: 'CYCLES', name: 'Cycles' },
    { identifier: 'BLENDER_EEVEE_NEXT', name: 'EEVEE' },
    { identifier: 'BLENDER_WORKBENCH', name: 'Workbench' },
  ];

  const deviceItems = [
    { identifier: 'GPU', name: 'GPU' },
    { identifier: 'CPU', name: 'CPU' },
  ];

  const formatItems = [
    { identifier: 'PNG', name: 'PNG' },
    { identifier: 'JPEG', name: 'JPEG' },
    { identifier: 'OPEN_EXR', name: 'OpenEXR' },
    { identifier: 'FFMPEG', name: 'FFmpeg Video' },
  ];

  return (
    <div
      ref={drawerRef}
      style={{ width: `${Math.max(420, propertiesPanelWidth || 440)}px` }}
      className="absolute top-0 bottom-0 right-0 z-30 flex flex-col border-l border-rn-border bg-[#1c1c1c] shadow-2xl animate-in slide-in-from-right duration-200 select-none"
    >
      {/* ============================================================== */}
      {/* Drawer Header: Filename, Overrides status & Close button       */}
      {/* ============================================================== */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-rn-border bg-[#222222] px-4">
        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
          <Sliders className="h-4 w-4 text-rn-accent flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate" title={job.fileName}>
              {job.fileName}
            </span>
            <div className="flex items-center space-x-2 text-[10px]">
              {overrideCount > 0 ? (
                <>
                  <span className="font-semibold text-rn-accent">
                    {overrideCount} override{overrideCount === 1 ? '' : 's'} active
                  </span>
                  <button
                    type="button"
                    onClick={() => resetAllJobOverrides(job.id)}
                    className="flex items-center space-x-1 text-rn-muted hover:text-white transition"
                    title="Reset all settings to original .blend defaults"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset all</span>
                  </button>
                </>
              ) : (
                <span className="text-rn-muted italic">Using file defaults</span>
              )}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-white transition"
          title="Close settings drawer (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preset Toolbar (Apply, Save, Copy, Paste) */}
      <PresetToolbar job={job} />

      {/* ============================================================== */}
      {/* Scrollable Drawer Body                                         */}
      {/* ============================================================== */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ============================================================ */}
        {/* Section 1: ESSENTIALS (Always visible & expanded by default) */}
        {/* ============================================================ */}
        <CollapsiblePanel
          title="Essentials"
          defaultExpanded={true}
          overrideCount={
            (engineProp.isOverridden ? 1 : 0) +
            (deviceProp.isOverridden ? 1 : 0) +
            (resXProp.isOverridden ? 1 : 0) +
            (resYProp.isOverridden ? 1 : 0) +
            (resPctProp.isOverridden ? 1 : 0) +
            (fileFormatProp.isOverridden ? 1 : 0) +
            (cyclesSamplesProp.isOverridden ? 1 : 0) +
            (cyclesThresholdProp.isOverridden ? 1 : 0) +
            (eeveeSamplesProp.isOverridden ? 1 : 0)
          }
        >
          {/* 1. Scene */}
          <PanelRow label="Active Scene">
            <BlenderDropdown
              value={job.selectedScene}
              options={sceneOptions}
              onChange={(val) => updateJob(job.id, { selectedScene: val })}
              className="w-full"
            />
          </PanelRow>

          {/* 2. Camera */}
          <PanelRow label="Active Camera">
            {cameraOptions.length > 0 ? (
              <BlenderDropdown
                value={job.selectedCamera}
                options={cameraOptions}
                onChange={(val) => updateJob(job.id, { selectedCamera: val })}
                className="w-full"
              />
            ) : (
              <span className="text-xs text-rn-muted italic">No cameras in scene</span>
            )}
          </PanelRow>

          {/* 3. Frame Range Mode */}
          <PanelRow label="Frame Range">
            <SegmentedEnumToggle
              value={job.rangeConfig.mode}
              options={[
                { value: 'scene_default', label: 'File Default' },
                { value: 'custom', label: 'Custom' },
                { value: 'single_still', label: 'Still' },
              ]}
              onChange={(val) => {
                setJobRangeConfig(job.id, {
                  ...job.rangeConfig,
                  mode: val as 'scene_default' | 'custom' | 'single_still',
                });
              }}
            />
          </PanelRow>

          {/* Frame Range Inputs */}
          {job.rangeConfig.mode === 'custom' && (
            <PanelRow label="Custom Range" description='Frame ranges, e.g. "1-100", "1,5,10-20"'>
              <input
                type="text"
                value={job.rangeConfig.customExpression || ''}
                onChange={(e) =>
                  setJobRangeConfig(job.id, {
                    ...job.rangeConfig,
                    customExpression: e.target.value,
                  })
                }
                placeholder="e.g. 1-50, 60, 75-100"
                className="h-6 w-full rounded border border-rn-border bg-rn-input px-2 font-mono text-xs text-rn-text outline-none focus:border-rn-accent"
              />
            </PanelRow>
          )}

          {job.rangeConfig.mode === 'single_still' && (
            <PanelRow label="Still Frame">
              <BlenderNumberField
                value={job.rangeConfig.singleStillFrame ?? currentScene?.frameStart ?? 1}
                min={1}
                max={500000}
                onChange={(val) =>
                  setJobRangeConfig(job.id, {
                    ...job.rangeConfig,
                    singleStillFrame: val,
                  })
                }
              />
            </PanelRow>
          )}

          {/* 4. Resolution */}
          <PanelRow
            label="Resolution"
            isOverridden={resXProp.isOverridden || resYProp.isOverridden || resPctProp.isOverridden}
            onReset={() => {
              resXProp.reset();
              resYProp.reset();
              resPctProp.reset();
            }}
          >
            <div className="flex items-center space-x-1.5">
              <div className="flex-1">
                <BlenderNumberField
                  value={Number(resXProp.value ?? 1920)}
                  min={1}
                  max={65536}
                  unit="px"
                  isOverridden={resXProp.isOverridden}
                  onReset={resXProp.reset}
                  onChange={(val) => resXProp.setValue(val)}
                />
              </div>
              <span className="text-[11px] text-rn-muted">×</span>
              <div className="flex-1">
                <BlenderNumberField
                  value={Number(resYProp.value ?? 1080)}
                  min={1}
                  max={65536}
                  unit="px"
                  isOverridden={resYProp.isOverridden}
                  onReset={resYProp.reset}
                  onChange={(val) => resYProp.setValue(val)}
                />
              </div>
              <div className="w-16">
                <BlenderNumberField
                  value={Number(resPctProp.value ?? 100)}
                  min={1}
                  max={1000}
                  unit="%"
                  isOverridden={resPctProp.isOverridden}
                  onReset={resPctProp.reset}
                  onChange={(val) => resPctProp.setValue(val)}
                />
              </div>
            </div>
          </PanelRow>

          {/* 5. Render Engine */}
          <PanelRow
            label="Render Engine"
            isOverridden={engineProp.isOverridden}
            onReset={engineProp.reset}
          >
            <SegmentedEnumToggle
              value={String(engineProp.value ?? 'BLENDER_EEVEE_NEXT')}
              items={engineItems}
              isOverridden={engineProp.isOverridden}
              onReset={engineProp.reset}
              onChange={(val) => engineProp.setValue(val)}
            />
          </PanelRow>

          {/* 6. Compute Device (Cycles only) */}
          {isCycles && (
            <PanelRow
              label="Compute Device"
              isOverridden={deviceProp.isOverridden}
              onReset={deviceProp.reset}
            >
              <SegmentedEnumToggle
                value={String(deviceProp.value ?? 'GPU')}
                items={deviceItems}
                isOverridden={deviceProp.isOverridden}
                onReset={deviceProp.reset}
                onChange={(val) => deviceProp.setValue(val)}
              />
            </PanelRow>
          )}

          {/* 7. Samples */}
          {isCycles ? (
            <>
              <PanelRow
                label="Render Samples"
                isOverridden={cyclesSamplesProp.isOverridden}
                onReset={cyclesSamplesProp.reset}
              >
                <BlenderNumberField
                  value={Number(cyclesSamplesProp.value ?? 1024)}
                  min={1}
                  max={65536}
                  isOverridden={cyclesSamplesProp.isOverridden}
                  onReset={cyclesSamplesProp.reset}
                  onChange={(val) => cyclesSamplesProp.setValue(val)}
                />
              </PanelRow>

              <PanelRow
                label="Noise Threshold"
                isOverridden={cyclesThresholdProp.isOverridden}
                onReset={cyclesThresholdProp.reset}
              >
                <BlenderNumberField
                  value={Number(cyclesThresholdProp.value ?? 0.01)}
                  min={0}
                  max={1}
                  step={0.005}
                  precision={4}
                  isOverridden={cyclesThresholdProp.isOverridden}
                  onReset={cyclesThresholdProp.reset}
                  onChange={(val) => cyclesThresholdProp.setValue(val)}
                />
              </PanelRow>
            </>
          ) : (
            <PanelRow
              label="Render Samples"
              isOverridden={eeveeSamplesProp.isOverridden}
              onReset={eeveeSamplesProp.reset}
            >
              <BlenderNumberField
                value={Number(eeveeSamplesProp.value ?? 64)}
                min={1}
                max={4096}
                isOverridden={eeveeSamplesProp.isOverridden}
                onReset={eeveeSamplesProp.reset}
                onChange={(val) => eeveeSamplesProp.setValue(val)}
              />
            </PanelRow>
          )}

          {/* 8. File Format */}
          <PanelRow
            label="File Format"
            isOverridden={fileFormatProp.isOverridden}
            onReset={fileFormatProp.reset}
          >
            <SegmentedEnumToggle
              value={String(fileFormatProp.value ?? 'PNG')}
              items={formatItems}
              isOverridden={fileFormatProp.isOverridden}
              onReset={fileFormatProp.reset}
              onChange={(val) => fileFormatProp.setValue(val)}
            />
          </PanelRow>
        </CollapsiblePanel>

        {/* ============================================================ */}
        {/* Section 2: ALL SETTINGS (Collapsible, collapsed by default)  */}
        {/* ============================================================ */}
        <div className="pt-2 border-t border-rn-border/60">
          <span className="text-[11px] font-semibold text-rn-muted uppercase tracking-wider block mb-2 px-1">
            All Settings & Power-User Controls
          </span>

          <div className="space-y-2">
            {/* Advanced Render Properties Panel */}
            <CollapsiblePanel title="Advanced Render Settings" defaultExpanded={false}>
              <RenderPropertiesTab job={job} />
            </CollapsiblePanel>

            {/* Advanced Output Properties Panel */}
            <CollapsiblePanel title="Advanced Output Settings" defaultExpanded={false}>
              <OutputPropertiesTab job={job} />
            </CollapsiblePanel>

            {/* Job Settings & Pre-render Python Hook */}
            <CollapsiblePanel title="Job Execution & Hooks" defaultExpanded={false}>
              <JobSettingsTab job={job} />
            </CollapsiblePanel>

            {/* Complete RNA Schema Properties Tree */}
            <CollapsiblePanel title="Full RNA Property Tree" defaultExpanded={false}>
              <AllPropertiesTree job={job} />
            </CollapsiblePanel>
          </div>
        </div>
      </div>
    </div>
  );
};
