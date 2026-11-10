import type { ImageSequenceInfo } from '../../../core/schemas/sequence';

import React, { useEffect, useRef, useState } from 'react';

import {
  AlertTriangle,
  FolderOpen,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';

export interface SequenceViewerProps {
  sequence: ImageSequenceInfo | null;
  onSelectSequence?: (seq: ImageSequenceInfo | null) => void;
}

export const SequenceViewer: React.FC<SequenceViewerProps> = ({ sequence, onSelectSequence }) => {
  const [currentFrame, setCurrentFrame] = useState<number>(sequence?.startFrame || 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(24);
  const [loop, setLoop] = useState<boolean>(true);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [isLoadingProxy, setIsLoadingProxy] = useState<boolean>(false);

  // Update current frame when sequence changes
  useEffect(() => {
    if (sequence) {
      setCurrentFrame(sequence.startFrame);
      setIsPlaying(false);
      setProxyError(null);
    }
  }, [sequence]);

  // Load proxy if current frame is non-native format
  useEffect(() => {
    let isCancelled = false;
    if (!sequence) {
      setProxyUrl(null);
      return;
    }

    const currentFilePath = sequence.filePaths[currentFrame];
    if (!currentFilePath) {
      setProxyUrl(null);
      return;
    }

    if (sequence.isNativeFormat) {
      setProxyUrl(`file://${currentFilePath}`);
      setProxyError(null);
      return;
    }

    // Non-native format: invoke proxy generator
    if (typeof window !== 'undefined' && window.rnApi?.generateProxy) {
      setIsLoadingProxy(true);
      window.rnApi
        .generateProxy(currentFilePath)
        .then((res) => {
          if (!isCancelled) {
            setIsLoadingProxy(false);
            if (res.proxyPath) {
              setProxyUrl(`file://${res.proxyPath}`);
              setProxyError(null);
            } else {
              setProxyUrl(null);
              setProxyError(res.error || 'Preview could not be generated for this format.');
            }
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setIsLoadingProxy(false);
            setProxyUrl(null);
            setProxyError(err instanceof Error ? err.message : String(err));
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [sequence, currentFrame]);

  // Playback timer
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isPlaying || !sequence) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(10, Math.round(1000 / fps));
    playTimerRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= sequence.endFrame) {
          if (loop) return sequence.startFrame;
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, fps, loop, sequence]);

  const handleOpenFolder = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectDirectory();
      if (selected) {
        const detected = await window.rnApi.detectSequence(selected);
        if (onSelectSequence) {
          onSelectSequence(detected);
        }
      }
    }
  };

  const handleStep = (delta: number) => {
    if (!sequence) return;
    setIsPlaying(false);
    setCurrentFrame((prev) => {
      const next = prev + delta;
      return Math.min(sequence.endFrame, Math.max(sequence.startFrame, next));
    });
  };

  const isCurrentMissing = sequence ? sequence.missingFrames.includes(currentFrame) : false;

  return (
    <div className="flex flex-col h-full bg-rn-panel border border-rn-border rounded-lg overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rn-border bg-rn-subpanel">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-rn-accent text-white text-xs font-medium hover:brightness-110 active:brightness-95 transition"
            title="Open Directory to Detect Image Sequence"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Sequence</span>
          </button>

          {sequence ? (
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-rn-text font-mono">
                {sequence.baseName}*.{sequence.extension}
              </span>
              <span className="text-rn-muted">
                (Frames {sequence.startFrame}–{sequence.endFrame}, {sequence.totalFrames} total)
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                  sequence.isNativeFormat
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                }`}
              >
                {sequence.isNativeFormat ? sequence.extension : `${sequence.extension} (Proxy)`}
              </span>
            </div>
          ) : (
            <span className="text-xs text-rn-muted">No sequence loaded</span>
          )}
        </div>

        {sequence && (
          <div className="text-xs font-mono text-rn-text">
            Frame {currentFrame} / {sequence.endFrame}
          </div>
        )}
      </div>

      {/* Missing Frames Alert Banner */}
      {sequence && sequence.missingFrames.length > 0 && (
        <div className="flex items-center space-x-2 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Missing {sequence.missingFrames.length} frame(s):{' '}
            {sequence.missingFrames.slice(0, 8).join(', ')}
            {sequence.missingFrames.length > 8 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Main Viewport */}
      <div className="relative flex-1 bg-black/60 flex items-center justify-center overflow-hidden min-h-[240px]">
        {sequence ? (
          isCurrentMissing ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-rn-muted">
              <AlertTriangle className="w-10 h-10 text-yellow-500/80 mb-2" />
              <span className="text-sm font-medium text-yellow-400">
                Frame {currentFrame} is Missing
              </span>
              <span className="text-xs mt-1">This frame is absent from the sequence.</span>
            </div>
          ) : proxyError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
              <span className="text-xs font-medium text-red-300">Preview Limitation Notice</span>
              <span className="text-[11px] text-rn-muted mt-1">{proxyError}</span>
            </div>
          ) : proxyUrl ? (
            <img
              src={proxyUrl}
              alt={`Frame ${currentFrame}`}
              className="max-h-full max-w-full object-contain pointer-events-none"
            />
          ) : isLoadingProxy ? (
            <div className="flex items-center space-x-2 text-xs text-rn-muted">
              <div className="w-4 h-4 border-2 border-rn-accent border-t-transparent rounded-full animate-spin" />
              <span>Generating proxy preview...</span>
            </div>
          ) : (
            <span className="text-xs text-rn-muted">Frame not found</span>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-rn-muted space-y-2 p-8">
            <FolderOpen className="w-10 h-10 opacity-30" />
            <p className="text-xs">Click "Open Sequence" or drag an image folder here to preview</p>
          </div>
        )}

        {/* Viewport Overlay */}
        {sequence && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur rounded text-[11px] font-mono text-rn-text flex items-center space-x-2 pointer-events-none">
            <span>#{String(currentFrame).padStart(sequence.padding, '0')}</span>
            <span className="text-rn-muted">|</span>
            <span>
              {Math.floor((currentFrame - sequence.startFrame) / fps)}s{' '}
              {((currentFrame - sequence.startFrame) % fps).toString().padStart(2, '0')}f
            </span>
          </div>
        )}
      </div>

      {/* Playback & Scrubber Controls */}
      <div className="p-3 border-t border-rn-border bg-rn-subpanel flex flex-col space-y-2.5">
        {/* Timeline Slider */}
        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono text-rn-muted w-10 text-right">
            {sequence?.startFrame || 1}
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={sequence?.startFrame || 1}
              max={sequence?.endFrame || 100}
              value={currentFrame}
              disabled={!sequence}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrame(parseInt(e.target.value, 10));
              }}
              className="w-full h-1.5 bg-rn-input rounded-lg appearance-none cursor-pointer accent-rn-accent disabled:opacity-40"
            />
          </div>
          <span className="text-[11px] font-mono text-rn-muted w-10">
            {sequence?.endFrame || 100}
          </span>
        </div>

        {/* Transport Toolbar */}
        <div className="flex items-center justify-between">
          {/* Left Transport: Step, Play, Loop */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handleStep(-1)}
              disabled={!sequence}
              className="p-1.5 rounded hover:bg-rn-panel text-rn-muted hover:text-rn-text transition disabled:opacity-40"
              title="Previous Frame"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying((p) => !p)}
              disabled={!sequence}
              className="p-1.5 rounded bg-rn-accent text-white hover:brightness-110 active:brightness-95 transition disabled:opacity-40"
              title={isPlaying ? 'Pause sequence' : 'Play sequence'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={() => handleStep(1)}
              disabled={!sequence}
              className="p-1.5 rounded hover:bg-rn-panel text-rn-muted hover:text-rn-text transition disabled:opacity-40"
              title="Next Frame"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={() => setLoop((l) => !l)}
              className={`p-1.5 rounded transition ${
                loop ? 'text-rn-accent bg-rn-panel' : 'text-rn-muted hover:text-rn-text'
              }`}
              title={loop ? 'Loop Enabled' : 'Loop Disabled'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (sequence) setCurrentFrame(sequence.startFrame);
              }}
              disabled={!sequence}
              className="p-1.5 rounded hover:bg-rn-panel text-rn-muted hover:text-rn-text transition disabled:opacity-40"
              title="Jump to Start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Right Transport: FPS Selection */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-rn-muted">FPS:</span>
            <div className="flex items-center space-x-1 bg-rn-input p-0.5 rounded border border-rn-border">
              {[12, 24, 25, 30, 60].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setFps(rate)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition ${
                    fps === rate
                      ? 'bg-rn-accent text-white font-medium'
                      : 'text-rn-muted hover:text-rn-text'
                  }`}
                >
                  {rate}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
