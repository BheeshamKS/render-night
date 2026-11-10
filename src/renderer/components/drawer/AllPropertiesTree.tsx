import { getActiveEngine, isPropertyRelevantToEngine } from '../../../core/overrides';
import type { RnaPropertyMeta, RnaStruct } from '../../../core/schemas/inspect';
import { useQueueStore, type QueueJob } from '../../store/queueStore';
import { BlenderNumberField, CollapsiblePanel, PanelRow, SegmentedEnumToggle } from '../controls';

import React from 'react';

export interface AllPropertiesTreeProps {
  job: QueueJob;
}

const PINNED_PROPERTIES = new Set([
  'scene.render.engine',
  'scene.cycles.device',
  'scene.render.threads',
  'scene.render.threads_mode',
  'scene.cycles.samples',
  'scene.cycles.preview_samples',
  'scene.cycles.adaptive_threshold',
  'scene.cycles.use_denoising',
  'scene.cycles.denoiser',
  'scene.eevee.taa_render_samples',
  'scene.render.film_transparent',
  'scene.render.use_motion_blur',
  'scene.render.use_persistent_data',
  'scene.cycles.use_auto_tile',
  'scene.cycles.tile_size',
  'scene.render.use_compositing',
  'scene.render.use_sequencer',
  'scene.view_settings.view_transform',
  'scene.view_settings.look',
  'scene.view_settings.exposure',
  'scene.view_settings.gamma',
  'scene.render.resolution_x',
  'scene.render.resolution_y',
  'scene.render.resolution_percentage',
  'scene.render.fps',
  'scene.render.fps_base',
  'scene.render.image_settings.file_format',
  'scene.render.image_settings.color_mode',
  'scene.render.image_settings.color_depth',
  'scene.render.image_settings.compression',
  'scene.render.image_settings.quality',
  'scene.render.image_settings.exr_codec',
  'scene.render.ffmpeg.format',
  'scene.render.ffmpeg.codec',
  'scene.render.ffmpeg.constant_rate_factor',
  'scene.render.ffmpeg.ffmpeg_preset',
  'scene.render.ffmpeg.gopsize',
  'scene.render.ffmpeg.audio_codec',
]);

interface StructGroup {
  id: string;
  title: string;
  prefix: string;
  struct?: RnaStruct;
}

export const AllPropertiesTree: React.FC<AllPropertiesTreeProps> = ({ job }) => {
  const { setJobOverride, resetJobOverride } = useQueueStore();

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene) || job.scenes[0];
  const activeEngine = getActiveEngine(job);

  if (!currentScene) {
    return null;
  }

  const groups: StructGroup[] = [
    {
      id: 'render',
      title: 'Render Engine Properties',
      prefix: 'scene.render',
      struct: currentScene.render,
    },
    {
      id: 'imageSettings',
      title: 'Image Settings Properties',
      prefix: 'scene.render.image_settings',
      struct: currentScene.imageSettings,
    },
    {
      id: 'ffmpeg',
      title: 'FFmpeg Video Properties',
      prefix: 'scene.render.ffmpeg',
      struct: currentScene.ffmpeg,
    },
    {
      id: 'cycles',
      title: 'Cycles Engine Properties',
      prefix: 'scene.cycles',
      struct: currentScene.cycles,
    },
    {
      id: 'eevee',
      title: 'EEVEE Engine Properties',
      prefix: 'scene.eevee',
      struct: currentScene.eevee,
    },
    {
      id: 'viewSettings',
      title: 'View Settings Properties',
      prefix: 'scene.view_settings',
      struct: currentScene.viewSettings,
    },
    {
      id: 'displaySettings',
      title: 'Display Settings Properties',
      prefix: 'scene.display_settings',
      struct: currentScene.displaySettings,
    },
  ];

  const boolItems = [
    { identifier: 'true', name: 'True' },
    { identifier: 'false', name: 'False' },
  ];

  const renderPropertyControl = (rnaPath: string, meta: RnaPropertyMeta) => {
    const overrides = job.overrides || {};
    const isOverridden = overrides[rnaPath] !== undefined;
    const value = isOverridden ? overrides[rnaPath] : meta.value;

    const handleReset = () => resetJobOverride(job.id, rnaPath);

    if (meta.type === 'INT' || meta.type === 'FLOAT') {
      return (
        <PanelRow
          key={rnaPath}
          label={meta.name || rnaPath.split('.').pop() || rnaPath}
          description={meta.description}
          isOverridden={isOverridden}
          onReset={handleReset}
        >
          <BlenderNumberField
            value={Number(value ?? meta.value ?? 0)}
            min={meta.min}
            max={meta.max}
            step={meta.type === 'FLOAT' ? 0.05 : 1}
            precision={meta.type === 'FLOAT' ? 2 : 0}
            isOverridden={isOverridden}
            onReset={handleReset}
            onChange={(val) => setJobOverride(job.id, rnaPath, val)}
          />
        </PanelRow>
      );
    }

    if (meta.type === 'ENUM' && meta.enumItems && meta.enumItems.length > 0) {
      return (
        <PanelRow
          key={rnaPath}
          label={meta.name || rnaPath.split('.').pop() || rnaPath}
          description={meta.description}
          isOverridden={isOverridden}
          onReset={handleReset}
        >
          <SegmentedEnumToggle
            value={String(value ?? meta.value ?? '')}
            items={meta.enumItems}
            isOverridden={isOverridden}
            onReset={handleReset}
            onChange={(val) => setJobOverride(job.id, rnaPath, val)}
          />
        </PanelRow>
      );
    }

    if (meta.type === 'BOOLEAN') {
      return (
        <PanelRow
          key={rnaPath}
          label={meta.name || rnaPath.split('.').pop() || rnaPath}
          description={meta.description}
          isOverridden={isOverridden}
          onReset={handleReset}
        >
          <SegmentedEnumToggle
            value={String(value ?? meta.value ?? 'false')}
            items={boolItems}
            isOverridden={isOverridden}
            onReset={handleReset}
            onChange={(val) => setJobOverride(job.id, rnaPath, val === 'true')}
          />
        </PanelRow>
      );
    }

    // Default string or non-scalar
    return null;
  };

  return (
    <div className="mt-4 pt-3 border-t border-rn-border/70">
      <div className="text-[11px] font-semibold text-rn-muted uppercase tracking-wider mb-2 px-1">
        All Properties (Introspected RNA Schema)
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          if (!group.struct) return null;

          // Filter properties in this struct
          const entries = Object.entries(group.struct).filter(([propId]) => {
            const rnaPath = `${group.prefix}.${propId}`;
            if (PINNED_PROPERTIES.has(rnaPath)) return false;
            if (!isPropertyRelevantToEngine(rnaPath, activeEngine)) return false;
            return true;
          });

          if (entries.length === 0) return null;

          // Count overrides in this group
          const overrideCount = entries.filter(([propId]) => {
            const rnaPath = `${group.prefix}.${propId}`;
            return job.overrides?.[rnaPath] !== undefined;
          }).length;

          const resetGroup = () => {
            entries.forEach(([propId]) => {
              const rnaPath = `${group.prefix}.${propId}`;
              if (job.overrides?.[rnaPath] !== undefined) {
                resetJobOverride(job.id, rnaPath);
              }
            });
          };

          return (
            <CollapsiblePanel
              key={group.id}
              title={group.title}
              defaultExpanded={false}
              badge={`${entries.length} props`}
              overrideCount={overrideCount}
              onResetAll={overrideCount > 0 ? resetGroup : undefined}
            >
              {entries.map(([propId, meta]) => {
                const rnaPath = `${group.prefix}.${propId}`;
                return renderPropertyControl(rnaPath, meta);
              })}
            </CollapsiblePanel>
          );
        })}
      </div>
    </div>
  );
};
