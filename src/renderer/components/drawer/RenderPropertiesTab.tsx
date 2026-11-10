import {
  getActiveEngine,
  getEnumOptions,
  getRnaDefaultValue,
  getRnaPropertyMeta,
} from '../../../core/overrides';
import { useQueueStore, type QueueJob } from '../../store/queueStore';
import { BlenderNumberField, CollapsiblePanel, PanelRow, SegmentedEnumToggle } from '../controls';

import React from 'react';

export interface RenderPropertiesTabProps {
  job: QueueJob;
}

export const RenderPropertiesTab: React.FC<RenderPropertiesTabProps> = ({ job }) => {
  const { setJobOverride, resetJobOverride } = useQueueStore();

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene) || job.scenes[0];
  const activeEngine = getActiveEngine(job);
  const isCycles = activeEngine.includes('CYCLES');
  const isEevee = activeEngine.includes('EEVEE');

  // Generic helper to get value & override state for an RNA path
  const getPropState = (rnaPath: string) => {
    const fileDefault = getRnaDefaultValue(currentScene, rnaPath);
    const meta = getRnaPropertyMeta(currentScene, rnaPath, job.inspectData);
    const overrides = job.overrides || {};
    const isOverridden = overrides[rnaPath] !== undefined;
    const value = isOverridden ? overrides[rnaPath] : fileDefault;

    return {
      value,
      fileDefault,
      isOverridden,
      meta,
      setValue: (val: unknown) => setJobOverride(job.id, rnaPath, val),
      reset: () => resetJobOverride(job.id, rnaPath),
    };
  };

  // Section 1: Engine & Device
  const engineProp = getPropState('scene.render.engine');
  const deviceProp = getPropState('scene.cycles.device');
  const threadsModeProp = getPropState('scene.render.threads_mode');
  const threadsProp = getPropState('scene.render.threads');

  // Section 2: Sampling & Denoising
  const cyclesSamplesProp = getPropState('scene.cycles.samples');
  const cyclesMinSamplesProp = getPropState('scene.cycles.preview_samples');
  const cyclesThresholdProp = getPropState('scene.cycles.adaptive_threshold');
  const cyclesDenoiseProp = getPropState('scene.cycles.use_denoising');
  const cyclesDenoiserProp = getPropState('scene.cycles.denoiser');
  const eeveeSamplesProp = getPropState('scene.eevee.taa_render_samples');

  // Section 3: Performance & Features
  const filmTransparentProp = getPropState('scene.render.film_transparent');
  const motionBlurProp = getPropState('scene.render.use_motion_blur');
  const persistentDataProp = getPropState('scene.render.use_persistent_data');
  const useTilingProp = getPropState('scene.cycles.use_auto_tile');
  const tileSizeProp = getPropState('scene.cycles.tile_size');
  const compositingProp = getPropState('scene.render.use_compositing');
  const sequencerProp = getPropState('scene.render.use_sequencer');

  // Section 4: Color Management
  const viewTransformProp = getPropState('scene.view_settings.view_transform');
  const lookProp = getPropState('scene.view_settings.look');
  const exposureProp = getPropState('scene.view_settings.exposure');
  const gammaProp = getPropState('scene.view_settings.gamma');

  // Standard Boolean Toggle Items
  const boolItems = [
    { identifier: 'true', name: 'Enabled' },
    { identifier: 'false', name: 'Disabled' },
  ];

  return (
    <div className="space-y-3 p-3">
      {/* 1. Engine & Compute Device */}
      <CollapsiblePanel
        title="Engine & Compute Device"
        overrideCount={
          (engineProp.isOverridden ? 1 : 0) +
          (deviceProp.isOverridden ? 1 : 0) +
          (threadsModeProp.isOverridden ? 1 : 0) +
          (threadsProp.isOverridden ? 1 : 0)
        }
        onResetAll={() => {
          engineProp.reset();
          deviceProp.reset();
          threadsModeProp.reset();
          threadsProp.reset();
        }}
      >
        <PanelRow
          label="Render Engine"
          isOverridden={engineProp.isOverridden}
          onReset={engineProp.reset}
        >
          <SegmentedEnumToggle
            value={(engineProp.value as string) || 'CYCLES'}
            items={getEnumOptions(engineProp.meta, [
              { identifier: 'CYCLES', name: 'Cycles' },
              { identifier: 'BLENDER_EEVEE_NEXT', name: 'EEVEE' },
              { identifier: 'BLENDER_WORKBENCH', name: 'Workbench' },
            ])}
            isOverridden={engineProp.isOverridden}
            onReset={engineProp.reset}
            onChange={(val) => engineProp.setValue(val)}
          />
        </PanelRow>

        {isCycles && (
          <PanelRow
            label="Cycles Device"
            isOverridden={deviceProp.isOverridden}
            onReset={deviceProp.reset}
          >
            <SegmentedEnumToggle
              value={(deviceProp.value as string) || 'GPU'}
              items={getEnumOptions(deviceProp.meta, [
                { identifier: 'CPU', name: 'CPU' },
                { identifier: 'GPU', name: 'GPU Compute' },
              ])}
              isOverridden={deviceProp.isOverridden}
              onReset={deviceProp.reset}
              onChange={(val) => deviceProp.setValue(val)}
            />
          </PanelRow>
        )}

        <PanelRow
          label="Threads Mode"
          isOverridden={threadsModeProp.isOverridden}
          onReset={threadsModeProp.reset}
        >
          <SegmentedEnumToggle
            value={(threadsModeProp.value as string) || 'AUTO'}
            items={[
              { identifier: 'AUTO', name: 'Auto-detect' },
              { identifier: 'FIXED', name: 'Fixed' },
            ]}
            isOverridden={threadsModeProp.isOverridden}
            onReset={threadsModeProp.reset}
            onChange={(val) => threadsModeProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow
          label="Render Threads"
          isOverridden={threadsProp.isOverridden}
          onReset={threadsProp.reset}
        >
          <BlenderNumberField
            value={Number(threadsProp.value ?? 0)}
            min={0}
            max={128}
            step={1}
            unit="threads"
            description="0 for Auto-detect threads, or specific thread count"
            isOverridden={threadsProp.isOverridden}
            onReset={threadsProp.reset}
            onChange={(val) => threadsProp.setValue(val)}
          />
        </PanelRow>
      </CollapsiblePanel>

      {/* 2. Sampling & Denoising */}
      <CollapsiblePanel
        title="Sampling & Denoising"
        overrideCount={
          isCycles
            ? (cyclesSamplesProp.isOverridden ? 1 : 0) +
              (cyclesMinSamplesProp.isOverridden ? 1 : 0) +
              (cyclesThresholdProp.isOverridden ? 1 : 0) +
              (cyclesDenoiseProp.isOverridden ? 1 : 0) +
              (cyclesDenoiserProp.isOverridden ? 1 : 0)
            : eeveeSamplesProp.isOverridden
              ? 1
              : 0
        }
        onResetAll={() => {
          if (isCycles) {
            cyclesSamplesProp.reset();
            cyclesMinSamplesProp.reset();
            cyclesThresholdProp.reset();
            cyclesDenoiseProp.reset();
            cyclesDenoiserProp.reset();
          } else {
            eeveeSamplesProp.reset();
          }
        }}
      >
        {isCycles ? (
          <>
            <PanelRow
              label="Render Samples"
              isOverridden={cyclesSamplesProp.isOverridden}
              onReset={cyclesSamplesProp.reset}
            >
              <BlenderNumberField
                value={Number(cyclesSamplesProp.value ?? 128)}
                min={1}
                max={100000}
                step={16}
                unit="samples"
                isOverridden={cyclesSamplesProp.isOverridden}
                onReset={cyclesSamplesProp.reset}
                onChange={(val) => cyclesSamplesProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Min Samples"
              isOverridden={cyclesMinSamplesProp.isOverridden}
              onReset={cyclesMinSamplesProp.reset}
            >
              <BlenderNumberField
                value={Number(cyclesMinSamplesProp.value ?? 0)}
                min={0}
                max={10000}
                step={8}
                unit="samples"
                isOverridden={cyclesMinSamplesProp.isOverridden}
                onReset={cyclesMinSamplesProp.reset}
                onChange={(val) => cyclesMinSamplesProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Noise Threshold"
              isOverridden={cyclesThresholdProp.isOverridden}
              onReset={cyclesThresholdProp.reset}
            >
              <BlenderNumberField
                value={Number(cyclesThresholdProp.value ?? 0.01)}
                min={0.0}
                max={1.0}
                step={0.005}
                precision={3}
                isOverridden={cyclesThresholdProp.isOverridden}
                onReset={cyclesThresholdProp.reset}
                onChange={(val) => cyclesThresholdProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Use Denoising"
              isOverridden={cyclesDenoiseProp.isOverridden}
              onReset={cyclesDenoiseProp.reset}
            >
              <SegmentedEnumToggle
                value={String(cyclesDenoiseProp.value ?? 'true')}
                items={boolItems}
                isOverridden={cyclesDenoiseProp.isOverridden}
                onReset={cyclesDenoiseProp.reset}
                onChange={(val) => cyclesDenoiseProp.setValue(val === 'true')}
              />
            </PanelRow>

            <PanelRow
              label="Denoiser"
              isOverridden={cyclesDenoiserProp.isOverridden}
              onReset={cyclesDenoiserProp.reset}
            >
              <SegmentedEnumToggle
                value={(cyclesDenoiserProp.value as string) || 'OPENIMAGEDENOISE'}
                items={getEnumOptions(cyclesDenoiserProp.meta, [
                  { identifier: 'OPENIMAGEDENOISE', name: 'OpenImageDenoise' },
                  { identifier: 'OPTIX', name: 'OptiX' },
                ])}
                isOverridden={cyclesDenoiserProp.isOverridden}
                onReset={cyclesDenoiserProp.reset}
                onChange={(val) => cyclesDenoiserProp.setValue(val)}
              />
            </PanelRow>
          </>
        ) : isEevee ? (
          <PanelRow
            label="Render Samples"
            isOverridden={eeveeSamplesProp.isOverridden}
            onReset={eeveeSamplesProp.reset}
          >
            <BlenderNumberField
              value={Number(eeveeSamplesProp.value ?? 64)}
              min={1}
              max={4096}
              step={16}
              unit="samples"
              isOverridden={eeveeSamplesProp.isOverridden}
              onReset={eeveeSamplesProp.reset}
              onChange={(val) => eeveeSamplesProp.setValue(val)}
            />
          </PanelRow>
        ) : null}
      </CollapsiblePanel>

      {/* 3. Performance & Features */}
      <CollapsiblePanel
        title="Performance & Features"
        overrideCount={
          (filmTransparentProp.isOverridden ? 1 : 0) +
          (motionBlurProp.isOverridden ? 1 : 0) +
          (persistentDataProp.isOverridden ? 1 : 0) +
          (useTilingProp.isOverridden ? 1 : 0) +
          (tileSizeProp.isOverridden ? 1 : 0) +
          (compositingProp.isOverridden ? 1 : 0) +
          (sequencerProp.isOverridden ? 1 : 0)
        }
        onResetAll={() => {
          filmTransparentProp.reset();
          motionBlurProp.reset();
          persistentDataProp.reset();
          useTilingProp.reset();
          tileSizeProp.reset();
          compositingProp.reset();
          sequencerProp.reset();
        }}
      >
        <PanelRow
          label="Film Transparent"
          isOverridden={filmTransparentProp.isOverridden}
          onReset={filmTransparentProp.reset}
        >
          <SegmentedEnumToggle
            value={String(filmTransparentProp.value ?? 'false')}
            items={boolItems}
            isOverridden={filmTransparentProp.isOverridden}
            onReset={filmTransparentProp.reset}
            onChange={(val) => filmTransparentProp.setValue(val === 'true')}
          />
        </PanelRow>

        <PanelRow
          label="Motion Blur"
          isOverridden={motionBlurProp.isOverridden}
          onReset={motionBlurProp.reset}
        >
          <SegmentedEnumToggle
            value={String(motionBlurProp.value ?? 'false')}
            items={boolItems}
            isOverridden={motionBlurProp.isOverridden}
            onReset={motionBlurProp.reset}
            onChange={(val) => motionBlurProp.setValue(val === 'true')}
          />
        </PanelRow>

        <PanelRow
          label="Persistent Data"
          isOverridden={persistentDataProp.isOverridden}
          onReset={persistentDataProp.reset}
        >
          <SegmentedEnumToggle
            value={String(persistentDataProp.value ?? 'false')}
            items={boolItems}
            isOverridden={persistentDataProp.isOverridden}
            onReset={persistentDataProp.reset}
            onChange={(val) => persistentDataProp.setValue(val === 'true')}
          />
        </PanelRow>

        {isCycles && (
          <>
            <PanelRow
              label="Use Tiling"
              isOverridden={useTilingProp.isOverridden}
              onReset={useTilingProp.reset}
            >
              <SegmentedEnumToggle
                value={String(useTilingProp.value ?? 'false')}
                items={boolItems}
                isOverridden={useTilingProp.isOverridden}
                onReset={useTilingProp.reset}
                onChange={(val) => useTilingProp.setValue(val === 'true')}
              />
            </PanelRow>

            <PanelRow
              label="Tile Size"
              isOverridden={tileSizeProp.isOverridden}
              onReset={tileSizeProp.reset}
            >
              <BlenderNumberField
                value={Number(tileSizeProp.value ?? 2048)}
                min={64}
                max={8192}
                step={64}
                unit="px"
                isOverridden={tileSizeProp.isOverridden}
                onReset={tileSizeProp.reset}
                onChange={(val) => tileSizeProp.setValue(val)}
              />
            </PanelRow>
          </>
        )}

        <PanelRow
          label="Compositing"
          isOverridden={compositingProp.isOverridden}
          onReset={compositingProp.reset}
        >
          <SegmentedEnumToggle
            value={String(compositingProp.value ?? 'true')}
            items={boolItems}
            isOverridden={compositingProp.isOverridden}
            onReset={compositingProp.reset}
            onChange={(val) => compositingProp.setValue(val === 'true')}
          />
        </PanelRow>

        <PanelRow
          label="Sequencer"
          isOverridden={sequencerProp.isOverridden}
          onReset={sequencerProp.reset}
        >
          <SegmentedEnumToggle
            value={String(sequencerProp.value ?? 'true')}
            items={boolItems}
            isOverridden={sequencerProp.isOverridden}
            onReset={sequencerProp.reset}
            onChange={(val) => sequencerProp.setValue(val === 'true')}
          />
        </PanelRow>
      </CollapsiblePanel>

      {/* 4. Color Management */}
      <CollapsiblePanel
        title="Color Management"
        overrideCount={
          (viewTransformProp.isOverridden ? 1 : 0) +
          (lookProp.isOverridden ? 1 : 0) +
          (exposureProp.isOverridden ? 1 : 0) +
          (gammaProp.isOverridden ? 1 : 0)
        }
        onResetAll={() => {
          viewTransformProp.reset();
          lookProp.reset();
          exposureProp.reset();
          gammaProp.reset();
        }}
      >
        <PanelRow
          label="View Transform"
          isOverridden={viewTransformProp.isOverridden}
          onReset={viewTransformProp.reset}
        >
          <SegmentedEnumToggle
            value={(viewTransformProp.value as string) || 'Standard'}
            items={getEnumOptions(viewTransformProp.meta, [
              { identifier: 'Standard', name: 'Standard' },
              { identifier: 'AgX', name: 'AgX' },
              { identifier: 'Filmic', name: 'Filmic' },
              { identifier: 'Raw', name: 'Raw' },
            ])}
            isOverridden={viewTransformProp.isOverridden}
            onReset={viewTransformProp.reset}
            onChange={(val) => viewTransformProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow label="Look" isOverridden={lookProp.isOverridden} onReset={lookProp.reset}>
          <SegmentedEnumToggle
            value={(lookProp.value as string) || 'None'}
            items={getEnumOptions(lookProp.meta, [
              { identifier: 'None', name: 'None' },
              { identifier: 'Very High Contrast', name: 'Very High Contrast' },
              { identifier: 'High Contrast', name: 'High Contrast' },
              { identifier: 'Medium Contrast', name: 'Medium Contrast' },
              { identifier: 'Low Contrast', name: 'Low Contrast' },
            ])}
            isOverridden={lookProp.isOverridden}
            onReset={lookProp.reset}
            onChange={(val) => lookProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow
          label="Exposure"
          isOverridden={exposureProp.isOverridden}
          onReset={exposureProp.reset}
        >
          <BlenderNumberField
            value={Number(exposureProp.value ?? 0.0)}
            min={-10.0}
            max={10.0}
            step={0.1}
            precision={2}
            isOverridden={exposureProp.isOverridden}
            onReset={exposureProp.reset}
            onChange={(val) => exposureProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow label="Gamma" isOverridden={gammaProp.isOverridden} onReset={gammaProp.reset}>
          <BlenderNumberField
            value={Number(gammaProp.value ?? 1.0)}
            min={0.0}
            max={5.0}
            step={0.05}
            precision={2}
            isOverridden={gammaProp.isOverridden}
            onReset={gammaProp.reset}
            onChange={(val) => gammaProp.setValue(val)}
          />
        </PanelRow>
      </CollapsiblePanel>
    </div>
  );
};
