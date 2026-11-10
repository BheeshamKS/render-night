import type { OutputVideoFormat, StitchProgress } from '../../../core/ffmpeg/converter';
import type { ImageSequenceInfo } from '../../../core/schemas/sequence';

import React, { useEffect, useState } from 'react';

import { AlertCircle, CheckCircle2, Film, Music, Play, Scissors, Square, X } from 'lucide-react';

export interface SequenceConverterProps {
  sequence: ImageSequenceInfo | null;
}

export const SequenceConverter: React.FC<SequenceConverterProps> = ({ sequence }) => {
  const [outputFormat, setOutputFormat] = useState<OutputVideoFormat>('mp4_h264');
  const [fps, setFps] = useState<number>(24);
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [resPreset, setResPreset] = useState<string>('original');
  const [customRes, setCustomRes] = useState<{ width: string; height: string }>({
    width: '',
    height: '',
  });

  const [enableCrop, setEnableCrop] = useState<boolean>(false);
  const [crop, setCrop] = useState<{ width: string; height: string; x: string; y: string }>({
    width: '',
    height: '',
    x: '0',
    y: '0',
  });

  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [customOutputPath, setCustomOutputPath] = useState<string | null>(null);

  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [progress, setProgress] = useState<StitchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successPath, setSuccessPath] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.rnApi?.onStitchProgress) {
      unsub = window.rnApi.onStitchProgress((p) => {
        setProgress(p);
      });
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleSelectAudio = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectAudioFile();
      if (selected) {
        setAudioPath(selected);
      }
    }
  };

  const handleSelectOutputPath = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const ext = outputFormat === 'prores' ? 'mov' : outputFormat === 'webm' ? 'webm' : 'mp4';
      const defaultName = sequence
        ? `${sequence.baseName.replace(/[_\-.]$/, '')}_stitched.${ext}`
        : `output.${ext}`;
      const chosen = await window.rnApi.selectSaveVideoPath(defaultName);
      if (chosen) {
        setCustomOutputPath(chosen);
      }
    }
  };

  const handleStartStitch = async () => {
    if (!sequence) {
      setError('Please load an image sequence first.');
      return;
    }

    setError(null);
    setSuccessPath(null);
    setIsConverting(true);
    setProgress(null);

    try {
      const ext = outputFormat === 'prores' ? 'mov' : outputFormat === 'webm' ? 'webm' : 'mp4';
      const cleanBase = sequence.baseName.replace(/[_\-.]$/, '') || 'sequence';
      const destination = customOutputPath || `${sequence.directory}/${cleanBase}_stitched.${ext}`;

      let resolution: { width: number; height: number } | undefined;
      if (resPreset === '1080p') resolution = { width: 1920, height: 1080 };
      else if (resPreset === '720p') resolution = { width: 1280, height: 720 };
      else if (resPreset === '4k') resolution = { width: 3840, height: 2160 };
      else if (resPreset === 'custom' && customRes.width && customRes.height) {
        resolution = {
          width: parseInt(customRes.width, 10),
          height: parseInt(customRes.height, 10),
        };
      }

      let cropOptions: { width: number; height: number; x: number; y: number } | undefined;
      if (enableCrop && crop.width && crop.height) {
        cropOptions = {
          width: parseInt(crop.width, 10),
          height: parseInt(crop.height, 10),
          x: parseInt(crop.x || '0', 10),
          y: parseInt(crop.y || '0', 10),
        };
      }

      if (typeof window !== 'undefined' && window.rnApi?.stitchSequence) {
        const result = await window.rnApi.stitchSequence({
          inputPattern: sequence.pattern,
          startFrame: sequence.startFrame,
          totalFrames: sequence.totalFrames,
          fps,
          outputFormat,
          quality,
          resolution,
          crop: cropOptions,
          audioPath: audioPath || undefined,
          outputPath: destination,
        });
        setSuccessPath(result);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  };

  const handleCancel = async () => {
    if (typeof window !== 'undefined' && window.rnApi?.cancelStitch) {
      await window.rnApi.cancelStitch();
      setIsConverting(false);
    }
  };

  return (
    <div className="bg-rn-panel border border-rn-border rounded-lg p-4 select-none">
      <div className="flex items-center justify-between pb-3 border-b border-rn-border mb-4">
        <div className="flex items-center space-x-2">
          <Film className="w-4 h-4 text-rn-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rn-text">
            Convert / Stitch Sequence to Video
          </h3>
        </div>
        {sequence && (
          <span className="text-[11px] font-mono text-rn-muted">
            Source: {sequence.totalFrames} frames ({sequence.extension.toUpperCase()})
          </span>
        )}
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        {/* 1. Format */}
        <div className="flex flex-col space-y-1">
          <label className="text-rn-muted font-medium">Format</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputVideoFormat)}
            disabled={isConverting}
            className="w-full bg-rn-input border border-rn-border rounded px-2.5 py-1.5 text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            <option value="mp4_h264">MP4 (H.264)</option>
            <option value="mp4_h265">MP4 (H.265 / HEVC)</option>
            <option value="webm">WebM (VP9)</option>
            <option value="prores">Apple ProRes 422</option>
          </select>
        </div>

        {/* 2. Frame Rate */}
        <div className="flex flex-col space-y-1">
          <label className="text-rn-muted font-medium">Frame Rate (FPS)</label>
          <select
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value, 10))}
            disabled={isConverting}
            className="w-full bg-rn-input border border-rn-border rounded px-2.5 py-1.5 text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            <option value={12}>12 fps</option>
            <option value={24}>24 fps (Cinema)</option>
            <option value={25}>25 fps (PAL)</option>
            <option value={30}>30 fps (Standard)</option>
            <option value={60}>60 fps (High)</option>
          </select>
        </div>

        {/* 3. Resolution */}
        <div className="flex flex-col space-y-1">
          <label className="text-rn-muted font-medium">Resolution</label>
          <select
            value={resPreset}
            onChange={(e) => setResPreset(e.target.value)}
            disabled={isConverting}
            className="w-full bg-rn-input border border-rn-border rounded px-2.5 py-1.5 text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            <option value="original">Original Dimensions</option>
            <option value="1080p">1080p (1920x1080)</option>
            <option value="720p">720p (1280x720)</option>
            <option value="4k">4K UHD (3840x2160)</option>
            <option value="custom">Custom Dimensions</option>
          </select>
        </div>

        {/* 4. Quality */}
        <div className="flex flex-col space-y-1">
          <label className="text-rn-muted font-medium">Quality</label>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as 'high' | 'medium' | 'low')}
            disabled={isConverting}
            className="w-full bg-rn-input border border-rn-border rounded px-2.5 py-1.5 text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            <option value="high">High Quality (Production)</option>
            <option value="medium">Medium Quality (Standard)</option>
            <option value="low">Low Quality (Small file)</option>
          </select>
        </div>
      </div>

      {/* Custom Resolution Inputs */}
      {resPreset === 'custom' && (
        <div className="mt-3 flex items-center space-x-3 text-xs">
          <span className="text-rn-muted">Custom Size:</span>
          <input
            type="number"
            placeholder="Width"
            value={customRes.width}
            onChange={(e) => setCustomRes({ ...customRes, width: e.target.value })}
            className="w-24 bg-rn-input border border-rn-border rounded px-2 py-1 text-rn-text font-mono"
          />
          <span className="text-rn-muted">x</span>
          <input
            type="number"
            placeholder="Height"
            value={customRes.height}
            onChange={(e) => setCustomRes({ ...customRes, height: e.target.value })}
            className="w-24 bg-rn-input border border-rn-border rounded px-2 py-1 text-rn-text font-mono"
          />
        </div>
      )}

      {/* Optional Crop & Audio Options */}
      <div className="mt-4 pt-3 border-t border-rn-border/50 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Audio Track Input */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-rn-muted font-medium flex items-center space-x-1.5">
            <Music className="w-3.5 h-3.5" />
            <span>Audio Track (Optional)</span>
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={audioPath || 'None (silent video)'}
              className="flex-1 bg-rn-input border border-rn-border rounded px-2.5 py-1 text-rn-text truncate font-mono text-[11px]"
            />
            <button
              onClick={handleSelectAudio}
              disabled={isConverting}
              className="px-2.5 py-1 bg-rn-subpanel hover:bg-rn-border rounded border border-rn-border text-rn-text font-medium"
            >
              Browse
            </button>
            {audioPath && (
              <button
                onClick={() => setAudioPath(null)}
                className="p-1 hover:bg-rn-subpanel rounded text-rn-muted hover:text-red-400"
                title="Remove audio"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Crop Settings */}
        <div className="flex flex-col space-y-1.5">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enable-crop-check"
              checked={enableCrop}
              onChange={(e) => setEnableCrop(e.target.checked)}
              className="rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
            />
            <label
              htmlFor="enable-crop-check"
              className="text-rn-muted font-medium flex items-center space-x-1 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Enable Crop Filter</span>
            </label>
          </div>
          {enableCrop && (
            <div className="flex items-center space-x-2 text-[11px]">
              <input
                type="number"
                placeholder="W"
                value={crop.width}
                onChange={(e) => setCrop({ ...crop, width: e.target.value })}
                className="w-16 bg-rn-input border border-rn-border rounded px-1.5 py-0.5 text-rn-text font-mono"
              />
              <span className="text-rn-muted">x</span>
              <input
                type="number"
                placeholder="H"
                value={crop.height}
                onChange={(e) => setCrop({ ...crop, height: e.target.value })}
                className="w-16 bg-rn-input border border-rn-border rounded px-1.5 py-0.5 text-rn-text font-mono"
              />
              <span className="text-rn-muted">@ X:</span>
              <input
                type="number"
                placeholder="X"
                value={crop.x}
                onChange={(e) => setCrop({ ...crop, x: e.target.value })}
                className="w-12 bg-rn-input border border-rn-border rounded px-1.5 py-0.5 text-rn-text font-mono"
              />
              <span className="text-rn-muted">Y:</span>
              <input
                type="number"
                placeholder="Y"
                value={crop.y}
                onChange={(e) => setCrop({ ...crop, y: e.target.value })}
                className="w-12 bg-rn-input border border-rn-border rounded px-1.5 py-0.5 text-rn-text font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Progress & Feedback Display */}
      {isConverting && progress && (
        <div className="mt-4 p-3 bg-rn-subpanel border border-rn-border rounded flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-rn-accent">Stitching video...</span>
            <span className="font-mono text-rn-text">
              Frame {progress.frame}
              {progress.totalFrames ? ` / ${progress.totalFrames}` : ''}{' '}
              {progress.progressPercent !== undefined ? `(${progress.progressPercent}%)` : ''}
            </span>
          </div>
          <div className="w-full bg-rn-input h-2 rounded-full overflow-hidden">
            <div
              className="bg-rn-accent h-full transition-all duration-200"
              style={{ width: `${progress.progressPercent || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-rn-muted font-mono">
            <span>Speed: {progress.speed || '1.0x'}</span>
            <span>FPS: {progress.fps}</span>
            <span>Time: {progress.time}</span>
          </div>
        </div>
      )}

      {/* Error / Success Messages */}
      {error && (
        <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="font-mono whitespace-pre-wrap">{error}</span>
        </div>
      )}

      {successPath && (
        <div className="mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-400 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Stitched video created successfully: {successPath}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-4 pt-3 border-t border-rn-border flex items-center justify-between">
        <button
          onClick={handleSelectOutputPath}
          disabled={isConverting}
          className="text-xs text-rn-muted hover:text-rn-text underline decoration-rn-muted/40"
        >
          {customOutputPath ? `Output: ${customOutputPath}` : 'Choose Custom Output Path...'}
        </button>

        <div className="flex items-center space-x-2">
          {isConverting ? (
            <button
              onClick={handleCancel}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Cancel Stitching</span>
            </button>
          ) : (
            <button
              onClick={handleStartStitch}
              disabled={!sequence}
              className="flex items-center space-x-1.5 px-5 py-1.5 bg-rn-accent text-white text-xs font-medium rounded hover:brightness-110 active:brightness-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Stitch to Video</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
