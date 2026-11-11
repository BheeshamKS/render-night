import { getEnumOptions, getRnaDefaultValue, getRnaPropertyMeta } from '../../../core/overrides';
import { isFormatVideo } from '../../../core/ranges/frame-range';
import { useQueueStore, type QueueJob } from '../../store/queueStore';
import { BlenderNumberField, CollapsiblePanel, PanelRow, SegmentedEnumToggle } from '../controls';

import React from 'react';

export interface OutputPropertiesTabProps {
  job: QueueJob;
}

export const OutputPropertiesTab: React.FC<OutputPropertiesTabProps> = ({ job }) => {
  const { setJobOverride, resetJobOverride } = useQueueStore();

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene) || job.scenes[0];

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

  // Dimensions
  const resXProp = getPropState('scene.render.resolution_x');
  const resYProp = getPropState('scene.render.resolution_y');
  const resPctProp = getPropState('scene.render.resolution_percentage');
  const fpsProp = getPropState('scene.render.fps');

  // Format
  const fileFormatProp = getPropState('scene.render.image_settings.file_format');
  const formatStr = (fileFormatProp.value as string) || 'PNG';
  const isVideo = isFormatVideo(formatStr);

  // Image options
  const colorModeProp = getPropState('scene.render.image_settings.color_mode');
  const colorDepthProp = getPropState('scene.render.image_settings.color_depth');
  const compressionProp = getPropState('scene.render.image_settings.compression');
  const qualityProp = getPropState('scene.render.image_settings.quality');
  const exrCodecProp = getPropState('scene.render.image_settings.exr_codec');

  // Video options (FFmpeg)
  const ffmpegFormatProp = getPropState('scene.render.ffmpeg.format');
  const ffmpegCodecProp = getPropState('scene.render.ffmpeg.codec');
  const ffmpegCrfProp = getPropState('scene.render.ffmpeg.constant_rate_factor');
  const ffmpegSpeedProp = getPropState('scene.render.ffmpeg.ffmpeg_preset');
  const ffmpegGopProp = getPropState('scene.render.ffmpeg.gopsize');
  const ffmpegAudioProp = getPropState('scene.render.ffmpeg.audio_codec');

  return (
    <div className="space-y-3 p-3">
      {/* 1. Dimensions */}
      <CollapsiblePanel
        title="Dimensions"
        overrideCount={
          (resXProp.isOverridden ? 1 : 0) +
          (resYProp.isOverridden ? 1 : 0) +
          (resPctProp.isOverridden ? 1 : 0) +
          (fpsProp.isOverridden ? 1 : 0)
        }
        onResetAll={() => {
          resXProp.reset();
          resYProp.reset();
          resPctProp.reset();
          fpsProp.reset();
        }}
      >
        <PanelRow
          label="Resolution X"
          isOverridden={resXProp.isOverridden}
          onReset={resXProp.reset}
        >
          <BlenderNumberField
            value={Number(resXProp.value ?? 1920)}
            min={1}
            max={65536}
            step={16}
            unit="px"
            isOverridden={resXProp.isOverridden}
            onChange={(val) => resXProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow
          label="Resolution Y"
          isOverridden={resYProp.isOverridden}
          onReset={resYProp.reset}
        >
          <BlenderNumberField
            value={Number(resYProp.value ?? 1080)}
            min={1}
            max={65536}
            step={16}
            unit="px"
            isOverridden={resYProp.isOverridden}
            onChange={(val) => resYProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow
          label="Resolution %"
          isOverridden={resPctProp.isOverridden}
          onReset={resPctProp.reset}
        >
          <BlenderNumberField
            value={Number(resPctProp.value ?? 100)}
            min={1}
            max={1000}
            step={5}
            unit="%"
            isOverridden={resPctProp.isOverridden}
            onChange={(val) => resPctProp.setValue(val)}
          />
        </PanelRow>

        <PanelRow label="Frame Rate" isOverridden={fpsProp.isOverridden} onReset={fpsProp.reset}>
          <BlenderNumberField
            value={Number(fpsProp.value ?? 24)}
            min={1}
            max={240}
            step={1}
            unit="fps"
            isOverridden={fpsProp.isOverridden}
            onChange={(val) => fpsProp.setValue(val)}
          />
        </PanelRow>
      </CollapsiblePanel>

      {/* 2. File Format & Output Options */}
      <CollapsiblePanel
        title="File Format & Encoding"
        overrideCount={
          (fileFormatProp.isOverridden ? 1 : 0) +
          (colorModeProp.isOverridden ? 1 : 0) +
          (colorDepthProp.isOverridden ? 1 : 0) +
          (compressionProp.isOverridden ? 1 : 0) +
          (exrCodecProp.isOverridden ? 1 : 0) +
          (ffmpegFormatProp.isOverridden ? 1 : 0) +
          (ffmpegCodecProp.isOverridden ? 1 : 0) +
          (ffmpegCrfProp.isOverridden ? 1 : 0) +
          (ffmpegSpeedProp.isOverridden ? 1 : 0)
        }
        onResetAll={() => {
          fileFormatProp.reset();
          colorModeProp.reset();
          colorDepthProp.reset();
          compressionProp.reset();
          exrCodecProp.reset();
          ffmpegFormatProp.reset();
          ffmpegCodecProp.reset();
          ffmpegCrfProp.reset();
          ffmpegSpeedProp.reset();
        }}
      >
        <PanelRow
          label="File Format"
          isOverridden={fileFormatProp.isOverridden}
          onReset={fileFormatProp.reset}
        >
          <SegmentedEnumToggle
            value={formatStr}
            items={getEnumOptions(fileFormatProp.meta, [
              { identifier: 'PNG', name: 'PNG' },
              { identifier: 'JPEG', name: 'JPEG' },
              { identifier: 'OPEN_EXR', name: 'OpenEXR' },
              { identifier: 'FFMPEG', name: 'FFmpeg Video' },
            ])}
            isOverridden={fileFormatProp.isOverridden}
            onChange={(val) => fileFormatProp.setValue(val)}
          />
        </PanelRow>

        {!isVideo ? (
          /* Image-specific properties */
          <>
            <PanelRow
              label="Color Mode"
              isOverridden={colorModeProp.isOverridden}
              onReset={colorModeProp.reset}
            >
              <SegmentedEnumToggle
                value={(colorModeProp.value as string) || 'RGBA'}
                items={getEnumOptions(colorModeProp.meta, [
                  { identifier: 'BW', name: 'BW' },
                  { identifier: 'RGB', name: 'RGB' },
                  { identifier: 'RGBA', name: 'RGBA' },
                ])}
                isOverridden={colorModeProp.isOverridden}
                onChange={(val) => colorModeProp.setValue(val)}
              />
            </PanelRow>

            {formatStr !== 'JPEG' && (
              <PanelRow
                label="Color Depth"
                isOverridden={colorDepthProp.isOverridden}
                onReset={colorDepthProp.reset}
              >
                <SegmentedEnumToggle
                  value={String(colorDepthProp.value ?? '8')}
                  items={getEnumOptions(colorDepthProp.meta, [
                    { identifier: '8', name: '8-bit' },
                    { identifier: '16', name: '16-bit' },
                    { identifier: '32', name: '32-bit Float' },
                  ])}
                  isOverridden={colorDepthProp.isOverridden}
                  onChange={(val) => colorDepthProp.setValue(val)}
                />
              </PanelRow>
            )}

            {formatStr === 'PNG' && (
              <PanelRow
                label="Compression"
                isOverridden={compressionProp.isOverridden}
                onReset={compressionProp.reset}
              >
                <BlenderNumberField
                  value={Number(compressionProp.value ?? 15)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  isOverridden={compressionProp.isOverridden}
                  onChange={(val) => compressionProp.setValue(val)}
                />
              </PanelRow>
            )}

            {formatStr === 'JPEG' && (
              <PanelRow
                label="Quality"
                isOverridden={qualityProp.isOverridden}
                onReset={qualityProp.reset}
              >
                <BlenderNumberField
                  value={Number(qualityProp.value ?? 90)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  isOverridden={qualityProp.isOverridden}
                  onChange={(val) => qualityProp.setValue(val)}
                />
              </PanelRow>
            )}

            {formatStr === 'OPEN_EXR' && (
              <PanelRow
                label="EXR Codec"
                isOverridden={exrCodecProp.isOverridden}
                onReset={exrCodecProp.reset}
              >
                <SegmentedEnumToggle
                  value={(exrCodecProp.value as string) || 'ZIP'}
                  items={getEnumOptions(exrCodecProp.meta, [
                    { identifier: 'NONE', name: 'None' },
                    { identifier: 'ZIP', name: 'ZIP' },
                    { identifier: 'PIZ', name: 'PIZ' },
                    { identifier: 'DWAA', name: 'DWAA' },
                  ])}
                  isOverridden={exrCodecProp.isOverridden}
                  onChange={(val) => exrCodecProp.setValue(val)}
                />
              </PanelRow>
            )}
          </>
        ) : (
          /* Video-specific properties (FFmpeg) */
          <>
            <PanelRow
              label="Container"
              isOverridden={ffmpegFormatProp.isOverridden}
              onReset={ffmpegFormatProp.reset}
            >
              <SegmentedEnumToggle
                value={(ffmpegFormatProp.value as string) || 'MPEG4'}
                items={getEnumOptions(ffmpegFormatProp.meta, [
                  { identifier: 'MPEG4', name: 'MP4' },
                  { identifier: 'MKV', name: 'Matroska' },
                  { identifier: 'QUICKTIME', name: 'QuickTime' },
                  { identifier: 'WEBM', name: 'WebM' },
                ])}
                isOverridden={ffmpegFormatProp.isOverridden}
                onChange={(val) => ffmpegFormatProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Video Codec"
              isOverridden={ffmpegCodecProp.isOverridden}
              onReset={ffmpegCodecProp.reset}
            >
              <SegmentedEnumToggle
                value={(ffmpegCodecProp.value as string) || 'H264'}
                items={getEnumOptions(ffmpegCodecProp.meta, [
                  { identifier: 'H264', name: 'H.264' },
                  { identifier: 'PRORES', name: 'ProRes' },
                  { identifier: 'DNXHD', name: 'DNxHD' },
                  { identifier: 'AV1', name: 'AV1' },
                ])}
                isOverridden={ffmpegCodecProp.isOverridden}
                onChange={(val) => ffmpegCodecProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Output Quality"
              isOverridden={ffmpegCrfProp.isOverridden}
              onReset={ffmpegCrfProp.reset}
            >
              <SegmentedEnumToggle
                value={(ffmpegCrfProp.value as string) || 'MEDIUM'}
                items={getEnumOptions(ffmpegCrfProp.meta, [
                  { identifier: 'LOSSLESS', name: 'Lossless' },
                  { identifier: 'PERC_LOSSLESS', name: 'Perceptually Lossless' },
                  { identifier: 'HIGH', name: 'High' },
                  { identifier: 'MEDIUM', name: 'Medium' },
                  { identifier: 'LOW', name: 'Low' },
                ])}
                isOverridden={ffmpegCrfProp.isOverridden}
                onChange={(val) => ffmpegCrfProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Encoding Speed"
              isOverridden={ffmpegSpeedProp.isOverridden}
              onReset={ffmpegSpeedProp.reset}
            >
              <SegmentedEnumToggle
                value={(ffmpegSpeedProp.value as string) || 'GOOD'}
                items={getEnumOptions(ffmpegSpeedProp.meta, [
                  { identifier: 'SLOWEST', name: 'Slowest' },
                  { identifier: 'GOOD', name: 'Good' },
                  { identifier: 'REALTIME', name: 'Realtime' },
                ])}
                isOverridden={ffmpegSpeedProp.isOverridden}
                onChange={(val) => ffmpegSpeedProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Keyframe Interval"
              isOverridden={ffmpegGopProp.isOverridden}
              onReset={ffmpegGopProp.reset}
            >
              <BlenderNumberField
                value={Number(ffmpegGopProp.value ?? 18)}
                min={1}
                max={500}
                step={1}
                isOverridden={ffmpegGopProp.isOverridden}
                onChange={(val) => ffmpegGopProp.setValue(val)}
              />
            </PanelRow>

            <PanelRow
              label="Audio Codec"
              isOverridden={ffmpegAudioProp.isOverridden}
              onReset={ffmpegAudioProp.reset}
            >
              <SegmentedEnumToggle
                value={(ffmpegAudioProp.value as string) || 'AAC'}
                items={getEnumOptions(ffmpegAudioProp.meta, [
                  { identifier: 'NONE', name: 'No Audio' },
                  { identifier: 'AAC', name: 'AAC' },
                  { identifier: 'MP3', name: 'MP3' },
                  { identifier: 'FLAC', name: 'FLAC' },
                ])}
                isOverridden={ffmpegAudioProp.isOverridden}
                onChange={(val) => ffmpegAudioProp.setValue(val)}
              />
            </PanelRow>
          </>
        )}
      </CollapsiblePanel>
    </div>
  );
};
