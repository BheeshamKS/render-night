import type { ImageSequenceInfo } from '../../../core/schemas/sequence';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertTriangle,
  FolderOpen,
  Maximize2,
  Minimize2,
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
  const [fitActual, setFitActual] = useState<boolean>(false);

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

  // Preload adjacent frames for butter-smooth playback without stutter
  useEffect(() => {
    if (!sequence || !sequence.isNativeFormat) return;

    const countToPreload = Math.min(24, sequence.totalFrames);
    for (let i = 1; i <= countToPreload; i++) {
      let f = currentFrame + i;
      if (f > sequence.endFrame) {
        if (loop) f = sequence.startFrame + (f - sequence.endFrame - 1);
        else break;
      }
      const p = sequence.filePaths[f];
      if (p) {
        const img = new Image();
        img.src = `file://${p}`;
      }
    }
  }, [currentFrame, sequence, loop]);

  // Step frame helper
  const handleStep = useCallback(
    (delta: number) => {
      if (!sequence) return;
      setIsPlaying(false);
      setCurrentFrame((prev) => {
        const next = prev + delta;
        return Math.min(sequence.endFrame, Math.max(sequence.startFrame, next));
      });
    },
    [sequence],
  );

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }
      if (!sequence) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStep(e.shiftKey ? -10 : -1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStep(e.shiftKey ? 10 : 1);
      } else if (e.code === 'Home') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame(sequence.startFrame);
      } else if (e.code === 'End') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrame(sequence.endFrame);
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        setLoop((l) => !l);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sequence, handleStep]);

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

  const handleRevealDirectory = async () => {
    if (sequence?.directory && typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.openPath(sequence.directory);
    }
  };

  const isCurrentMissing = sequence ? sequence.missingFrames.includes(currentFrame) : false;
  const isStill = sequence
    ? sequence.totalFrames === 1 || sequence.startFrame === sequence.endFrame
    : false;

  return (
    <div className="flex flex-col h-full bg-rn-panel border border-rn-border rounded-xl overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-rn-border bg-rn-panel">
        <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-rn-accent text-[#0f0f10] text-xs font-semibold hover:brightness-110 active:brightness-95 transition flex-shrink-0"
            title="Open Directory to Detect Image Sequence"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Sequence</span>
          </button>

          {sequence ? (
            <div className="flex items-center space-x-2 text-xs min-w-0 truncate">
              <span
                className="font-semibold text-rn-text font-mono truncate"
                title={sequence.directory}
              >
                {sequence.baseName}*.{sequence.extension}
              </span>
              <span className="text-rn-muted text-[11px] tabular-nums flex-shrink-0">
                {isStill
                  ? '(Still Image · 1 frame)'
                  : `(Frames ${sequence.startFrame}–${sequence.endFrame}, ${sequence.totalFrames} total)`}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase flex-shrink-0 ${
                  sequence.isNativeFormat
                    ? 'bg-rn-subpanel text-rn-text border border-rn-border'
                    : 'bg-rn-accent/15 text-rn-accent border border-rn-accent/30'
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
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={handleRevealDirectory}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] text-rn-muted hover:text-rn-text hover:bg-rn-subpanel border border-rn-border transition"
              title="Reveal sequence folder on disk"
            >
              <FolderOpen className="w-3 h-3 text-rn-muted" />
              <span>Folder</span>
            </button>

            <button
              onClick={() => setFitActual((a) => !a)}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] border transition ${
                fitActual
                  ? 'bg-rn-accent/15 text-rn-accent border-rn-accent/40'
                  : 'border-rn-border text-rn-muted hover:text-rn-text hover:bg-rn-subpanel'
              }`}
              title={fitActual ? 'View: 1:1 Pixel Size' : 'View: Fit to Viewport'}
            >
              {fitActual ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              <span>{fitActual ? '100%' : 'Fit'}</span>
            </button>

            <div className="text-xs font-mono font-semibold tabular-nums text-rn-text bg-rn-input px-2 py-0.5 rounded border border-rn-border">
              Frame {currentFrame} / {sequence.endFrame}
            </div>
          </div>
        )}
      </div>

      {/* Missing Frames Alert Banner */}
      {sequence && sequence.missingFrames.length > 0 && (
        <div className="flex items-center space-x-2 px-3 py-1 bg-rn-warning/10 border-b border-rn-warning/25 text-rn-warning text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="tabular-nums">
            Missing {sequence.missingFrames.length} frame(s):{' '}
            {sequence.missingFrames.slice(0, 8).join(', ')}
            {sequence.missingFrames.length > 8 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Main Viewport */}
      <div className="relative flex-1 bg-[#0f0f10] flex items-center justify-center overflow-auto min-h-[260px]">
        {sequence ? (
          isCurrentMissing ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-rn-muted">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
              <span className="text-sm font-medium text-amber-300">
                Frame {currentFrame} is Missing
              </span>
              <span className="text-xs mt-1 text-neutral-400">
                This frame is absent from the sequence.
              </span>
            </div>
          ) : proxyError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
              <AlertTriangle className="w-8 h-8 text-rose-400 mb-2" />
              <span className="text-xs font-medium text-rose-300">Preview Limitation Notice</span>
              <span className="text-[11px] text-neutral-400 mt-1">{proxyError}</span>
            </div>
          ) : proxyUrl ? (
            <div
              className={`relative flex items-center justify-center w-full h-full p-2 ${fitActual ? 'overflow-auto' : ''}`}
            >
              <img
                src={proxyUrl}
                alt={`Frame ${currentFrame}`}
                className={`${
                  fitActual
                    ? 'max-h-none max-w-none object-none'
                    : 'max-h-full max-w-full object-contain'
                } pointer-events-none select-none drop-shadow-md`}
              />
            </div>
          ) : isLoadingProxy ? (
            <div className="flex items-center space-x-2 text-xs text-neutral-400">
              <div className="w-4 h-4 border-2 border-rn-accent border-t-transparent rounded-full animate-spin" />
              <span>Generating proxy preview...</span>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">Frame not found</span>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-500 space-y-2 p-8 text-center">
            <FolderOpen className="w-10 h-10 stroke-[1.2] opacity-40 text-neutral-400" />
            <p className="text-xs font-medium text-neutral-300">
              Click "Open Sequence" or select a finished job above to preview
            </p>
            <p className="text-[11px] text-neutral-500">
              Supports PNG, JPG, EXR, TIF, WebP sequences and single stills
            </p>
          </div>
        )}

        {/* Viewport Overlay */}
        {sequence && (
          <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/80 backdrop-blur rounded text-[11px] font-mono tabular-nums text-rn-text flex items-center space-x-2 pointer-events-none border border-rn-border/80 shadow">
            <span className="font-semibold text-rn-accent">
              #{String(currentFrame).padStart(sequence.padding || 4, '0')}
            </span>
            <span className="text-rn-muted">|</span>
            <span>
              {Math.floor((currentFrame - sequence.startFrame) / fps)}s{' '}
              {((currentFrame - sequence.startFrame) % fps).toString().padStart(2, '0')}f
            </span>
            {isStill && (
              <>
                <span className="text-rn-muted">|</span>
                <span className="text-rn-muted">Still</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Playback & Scrubber Controls */}
      <div className="p-3 border-t border-rn-border bg-rn-panel flex flex-col space-y-2.5">
        {/* Timeline Slider */}
        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono tabular-nums text-rn-muted w-10 text-right">
            {sequence?.startFrame || 1}
          </span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={sequence?.startFrame || 1}
              max={sequence?.endFrame || 100}
              value={currentFrame}
              disabled={!sequence || isStill}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrame(parseInt(e.target.value, 10));
              }}
              className="w-full h-1.5 bg-rn-input rounded-lg appearance-none cursor-pointer accent-rn-accent disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-rn-muted w-10">
            {sequence?.endFrame || 100}
          </span>
        </div>

        {/* Transport Toolbar */}
        <div className="flex items-center justify-between">
          {/* Left Transport: Step, Play, Loop */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handleStep(-1)}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Previous Frame (Left Arrow)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying((p) => !p)}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md bg-rn-accent text-[#0f0f10] hover:brightness-110 active:brightness-95 transition disabled:opacity-30 shadow-sm"
              title={isPlaying ? 'Pause sequence' : 'Play sequence'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>

            <button
              onClick={() => handleStep(1)}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Next Frame (Right Arrow)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={() => setLoop((l) => !l)}
              disabled={!sequence || isStill}
              className={`p-1.5 rounded-md transition ${
                loop
                  ? 'text-rn-accent bg-rn-subpanel'
                  : 'text-rn-muted hover:text-rn-text hover:bg-rn-subpanel'
              } disabled:opacity-30`}
              title={loop ? 'Loop Enabled' : 'Loop Disabled'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (sequence) setCurrentFrame(sequence.startFrame);
              }}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Jump to Start (Home)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Right Transport: FPS Selection & Keyboard Hints */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="hidden sm:flex items-center space-x-1 text-[10px] text-rn-muted font-mono">
              <span>[Space] Play</span>
              <span>·</span>
              <span>[←/→] Step</span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-rn-muted text-[11px]">FPS:</span>
              <div className="flex items-center space-x-0.5 bg-rn-input p-0.5 rounded-md border border-rn-border">
                {[12, 24, 25, 30, 60].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setFps(rate)}
                    disabled={isStill}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition ${
                      fps === rate
                        ? 'bg-rn-accent text-[#0f0f10] font-semibold'
                        : 'text-rn-muted hover:text-rn-text'
                    } disabled:opacity-40`}
                  >
                    {rate}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
