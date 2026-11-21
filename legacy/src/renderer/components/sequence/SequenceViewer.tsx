import type { ImageSequenceInfo } from '../../../core/schemas/sequence';
import { SequencePlayerEngine } from '../../sequence/player-engine';
import { SequenceProxyManager } from '../../sequence/proxy-manager';
import type { PlaybackMode, PlayerStats, ProxyJobInfo, ProxySetting } from '../../sequence/types';
import { useQueueStore } from '../../store/queueStore';
import { toRnMediaUrl } from '../../utils/url';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Activity,
  AlertTriangle,
  Film,
  FolderOpen,
  Pause,
  Play,
  Radio,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Video,
  X,
} from 'lucide-react';

export interface SequenceViewerProps {
  sequence: ImageSequenceInfo | null;
  errorMessage?: string | null;
  onSelectSequence?: (seq: ImageSequenceInfo | null) => void;
}

export const SequenceViewer: React.FC<SequenceViewerProps> = ({
  sequence,
  errorMessage,
  onSelectSequence,
}) => {
  const { queueState, jobs, monitorStats, setActiveSequence } = useQueueStore();

  const [currentFrame, setCurrentFrame] = useState<number>(sequence?.startFrame || 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(24);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [loop, setLoop] = useState<boolean>(true);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [mode, setMode] = useState<PlaybackMode>('realtime');
  const [fitActual, setFitActual] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showStats, setShowStats] = useState<boolean>(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);

  // Proxy state
  const [proxySetting, setProxySetting] = useState<ProxySetting>('auto');
  const [proxyInfo, setProxyInfo] = useState<ProxyJobInfo | null>(null);
  const [useProxyVideo, setUseProxyVideo] = useState<boolean>(false);

  // Live render watch mode
  const [isLiveWatch, setIsLiveWatch] = useState<boolean>(false);

  // DOM Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheBarRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Engine & Proxy manager instances
  const engineRef = useRef<SequencePlayerEngine | null>(null);
  const proxyManagerRef = useRef<SequenceProxyManager | null>(null);
  const isDraggingTimelineRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isStill = sequence ? sequence.startFrame === sequence.endFrame : false;
  const isCurrentMissing = Boolean(sequence?.missingFrames?.includes(currentFrame));

  // Determine if active sequence is currently rendering
  const isCurrentlyRendering = useMemo(() => {
    if (!sequence || queueState !== 'running') return false;
    return jobs.some(
      (j) =>
        j.status === 'Rendering' &&
        (j.outputPreview?.includes(sequence.directory) ||
          sequence.directory.includes(j.project || '')),
    );
  }, [sequence, queueState, jobs]);

  // Initialize or re-create player engine when sequence changes
  useEffect(() => {
    if (!sequence) {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (proxyManagerRef.current) {
        proxyManagerRef.current.destroy();
        proxyManagerRef.current = null;
      }
      setProxyInfo(null);
      setUseProxyVideo(false);
      return;
    }

    setCurrentFrame(sequence.startFrame);
    setIsPlaying(false);
    setInPoint(null);
    setOutPoint(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    const engine = new SequencePlayerEngine({
      sequence,
      fps,
      speed: playbackSpeed,
      loop,
      inPoint: null,
      outPoint: null,
      mode,
      onFrameChange: (f) => setCurrentFrame(f),
      onStatsChange: (s) => setStats(s),
    });

    engineRef.current = engine;

    if (canvasRef.current) {
      engine.attachCanvas(canvasRef.current);
    }

    // Proxy Manager
    const pm = new SequenceProxyManager(sequence, proxySetting, (info) => {
      setProxyInfo(info);
      if (info.proxyVideoPath && !info.isGenerating && proxySetting !== 'off') {
        // Auto-switch to video proxy if heavy format or sustained drops
        if (info.isToneMapped || proxySetting === 'always') {
          setUseProxyVideo(true);
        }
      }
    });
    proxyManagerRef.current = pm;

    if (pm.shouldAutoStart()) {
      void pm.startProxyGeneration();
    }

    return () => {
      engine.destroy();
      pm.destroy();
      engineRef.current = null;
      proxyManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence]);

  // Sync settings into active engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setFps(fps);
      engineRef.current.setSpeed(playbackSpeed);
      engineRef.current.setLoop(loop);
      engineRef.current.setMode(mode);
      engineRef.current.setInOut(inPoint, outPoint);
      engineRef.current.fitActual = fitActual;
      engineRef.current.zoom = zoom;
      engineRef.current.panX = pan.x;
      engineRef.current.panY = pan.y;
    }
  }, [fps, playbackSpeed, loop, mode, inPoint, outPoint, fitActual, zoom, pan]);

  // Draw Blender-style green cache bar along scrubber
  const drawCacheBar = useCallback(() => {
    const canvas = cacheBarRef.current;
    if (!canvas || !sequence) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    const start = sequence.startFrame;
    const end = sequence.endFrame;
    const total = end - start + 1;
    if (total <= 0) return;

    const cachedFrames = engineRef.current ? engineRef.current.cache.getCachedFrames() : [];
    const cachedSet = new Set(cachedFrames);
    const missingSet = new Set(sequence.missingFrames || []);

    const frameWidth = w / total;

    // Draw cached frames (Blender green)
    ctx.fillStyle = '#22c55e';
    for (const f of cachedSet) {
      const idx = f - start;
      if (idx >= 0 && idx < total) {
        ctx.fillRect(Math.floor(idx * frameWidth), 0, Math.ceil(frameWidth), h);
      }
    }

    // Draw missing frames (Red ticks)
    ctx.fillStyle = '#ef4444';
    for (const f of missingSet) {
      const idx = f - start;
      if (idx >= 0 && idx < total) {
        ctx.fillRect(Math.floor(idx * frameWidth), 0, Math.max(2, Math.ceil(frameWidth)), h);
      }
    }

    // In / Out shading
    if (inPoint !== null || outPoint !== null) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const effStart = inPoint !== null ? Math.max(start, inPoint) : start;
      const effEnd = outPoint !== null ? Math.min(end, outPoint) : end;

      if (effStart > start) {
        const inW = ((effStart - start) / total) * w;
        ctx.fillRect(0, 0, inW, h);
      }
      if (effEnd < end) {
        const outX = ((effEnd - start + 1) / total) * w;
        ctx.fillRect(outX, 0, w - outX, h);
      }
    }
  }, [sequence, inPoint, outPoint]);

  // Resize canvas when container size changes
  useEffect(() => {
    const handleResize = () => {
      engineRef.current?.resizeToDisplay();
      drawCacheBar();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawCacheBar]);

  // Live watch loop: check for newly rendered frames
  useEffect(() => {
    if (!sequence || (!isCurrentlyRendering && !isLiveWatch)) return;

    const interval = setInterval(async () => {
      if (typeof window !== 'undefined' && window.rnApi?.detectSequence) {
        try {
          const updated = await window.rnApi.detectSequence(sequence.directory);
          if (
            updated &&
            (updated.totalFrames > sequence.totalFrames || updated.endFrame > sequence.endFrame)
          ) {
            setActiveSequence(updated);
            if (engineRef.current) {
              engineRef.current.sequence = updated;
              engineRef.current.clock.options.endFrame = updated.endFrame;
            }
          }
        } catch {}
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [sequence, isCurrentlyRendering, isLiveWatch, setActiveSequence]);

  // Jump to latest frame when monitorStats thumbnail updates during live render
  useEffect(() => {
    if (isCurrentlyRendering && monitorStats.lastThumbnailPath && sequence) {
      const match = monitorStats.lastThumbnailPath.match(/(\d+)\.[a-zA-Z0-9]+$/);
      if (match) {
        const frameNum = parseInt(match[1], 10);
        if (frameNum >= sequence.startFrame && frameNum <= sequence.endFrame) {
          engineRef.current?.seek(frameNum);
        }
      }
    }
  }, [monitorStats.lastThumbnailPath, isCurrentlyRendering, sequence]);

  useEffect(() => {
    drawCacheBar();
  }, [drawCacheBar, stats?.cachedFramesCount, inPoint, outPoint]);

  // Video proxy sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !useProxyVideo || !sequence) return;

    if (isPlaying) {
      video.playbackRate = playbackSpeed;
      void video.play();
    } else {
      video.pause();
      const targetTime = Math.max(0, (currentFrame - sequence.startFrame) / fps);
      if (Math.abs(video.currentTime - targetTime) > 0.05) {
        video.currentTime = targetTime;
      }
    }
  }, [isPlaying, playbackSpeed, currentFrame, fps, sequence, useProxyVideo]);

  // Video requestVideoFrameCallback for frame-accurate lockstep
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !useProxyVideo || !sequence) return;

    let callbackId: number | null = null;
    const videoWithCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };

    const onFrame = () => {
      if (video.duration && sequence) {
        const f = sequence.startFrame + Math.floor(video.currentTime * fps);
        if (f !== currentFrame && f <= sequence.endFrame) {
          setCurrentFrame(f);
        }
      }
      if (videoWithCallback.requestVideoFrameCallback) {
        callbackId = videoWithCallback.requestVideoFrameCallback(onFrame);
      }
    };

    if (videoWithCallback.requestVideoFrameCallback) {
      callbackId = videoWithCallback.requestVideoFrameCallback(onFrame);
    }

    return () => {
      if (callbackId !== null && videoWithCallback.cancelVideoFrameCallback) {
        videoWithCallback.cancelVideoFrameCallback(callbackId);
      }
    };
  }, [useProxyVideo, sequence, fps, currentFrame]);

  // Playback Toggle
  const handleTogglePlay = useCallback(() => {
    if (!sequence || isStill) return;
    if (useProxyVideo) {
      setIsPlaying((p) => !p);
    } else {
      const playing = engineRef.current?.togglePlay();
      setIsPlaying(Boolean(playing));
    }
  }, [sequence, isStill, useProxyVideo]);

  // Frame Step
  const handleStep = useCallback(
    (delta: number) => {
      if (!sequence) return;
      setIsPlaying(false);
      if (useProxyVideo) {
        const next = Math.max(
          sequence.startFrame,
          Math.min(sequence.endFrame, currentFrame + delta),
        );
        setCurrentFrame(next);
      } else {
        engineRef.current?.step(delta);
      }
    },
    [sequence, currentFrame, useProxyVideo],
  );

  // In / Out Points
  const handleSetInPoint = useCallback(() => {
    if (!sequence) return;
    const maxAllowed = outPoint ?? sequence.endFrame;
    const newIn = Math.min(currentFrame, maxAllowed);
    setInPoint(newIn);
    engineRef.current?.setInOut(newIn, outPoint);
  }, [currentFrame, sequence, outPoint]);

  const handleSetOutPoint = useCallback(() => {
    if (!sequence) return;
    const minAllowed = inPoint ?? sequence.startFrame;
    const newOut = Math.max(currentFrame, minAllowed);
    setOutPoint(newOut);
    engineRef.current?.setInOut(inPoint, newOut);
  }, [currentFrame, sequence, inPoint]);

  const handleClearInOut = useCallback(() => {
    setInPoint(null);
    setOutPoint(null);
    engineRef.current?.setInOut(null, null);
  }, []);

  // View reset
  const handleResetView = useCallback((actual: boolean) => {
    setFitActual(actual);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (engineRef.current) {
      engineRef.current.fitActual = actual;
      engineRef.current.zoom = 1;
      engineRef.current.panX = 0;
      engineRef.current.panY = 0;
      engineRef.current.drawCurrentFrame();
    }
  }, []);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }
      if (!sequence) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStep(e.shiftKey ? -10 : -1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStep(e.shiftKey ? 10 : 1);
      } else if (e.code === 'Home') {
        e.preventDefault();
        setIsPlaying(false);
        const target = inPoint !== null ? inPoint : sequence.startFrame;
        engineRef.current?.seek(target);
      } else if (e.code === 'End') {
        e.preventDefault();
        setIsPlaying(false);
        const target = outPoint !== null ? outPoint : sequence.endFrame;
        engineRef.current?.seek(target);
      } else if (e.code === 'KeyL' && !e.ctrlKey && !e.metaKey) {
        // J/K/L Shuttle or Loop
        if (e.shiftKey) {
          setLoop((l) => !l);
        } else {
          // Shuttle forward: 1x -> 2x
          setPlaybackSpeed((prev) => (prev === 1 ? 2 : 1));
          if (!isPlaying) handleTogglePlay();
        }
      } else if (e.code === 'KeyK') {
        // Shuttle stop
        e.preventDefault();
        setIsPlaying(false);
        engineRef.current?.pause();
      } else if (e.code === 'KeyJ') {
        // Shuttle reverse: step back or negative speed
        e.preventDefault();
        handleStep(-1);
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        handleSetInPoint();
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        handleSetOutPoint();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        handleResetView(false);
      } else if (e.code === 'Digit1') {
        e.preventDefault();
        handleResetView(true);
      } else if (e.code === 'KeyS' || e.code === 'Backquote') {
        e.preventDefault();
        setShowStats((s) => !s);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    sequence,
    isPlaying,
    handleTogglePlay,
    handleStep,
    handleSetInPoint,
    handleSetOutPoint,
    handleResetView,
    inPoint,
    outPoint,
  ]);

  // Viewport Mouse Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
    setZoom(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  // Timeline scrubber scrubbing
  const handleScrubberChange = (val: number) => {
    setCurrentFrame(val);
    if (useProxyVideo && videoRef.current && sequence) {
      videoRef.current.currentTime = Math.max(0, (val - sequence.startFrame) / fps);
    } else {
      engineRef.current?.scrubTo(val);
    }
  };

  const handleOpenFolder = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectDirectory();
      if (selected) {
        await useQueueStore.getState().loadSequenceFromPath(selected);
        const seq = useQueueStore.getState().activeSequence;
        onSelectSequence?.(seq);
      }
    }
  };

  const currentFileName = useMemo(() => {
    if (!sequence) return '';
    const p = sequence.filePaths[currentFrame];
    if (!p) return `Frame ${currentFrame}`;
    return p.split(/[/\\]/).pop() || `Frame ${currentFrame}`;
  }, [sequence, currentFrame]);

  return (
    <div className="flex-1 flex flex-col bg-rn-bg overflow-hidden min-h-0 border border-rn-border rounded-xl shadow-lg">
      {/* Top Header & Mode Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-rn-panel border-b border-rn-border text-xs flex-shrink-0">
        {/* Left: Sequence title & tag */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <Film className="w-4 h-4 text-rn-accent flex-shrink-0" />
          <div className="min-w-0 flex items-center space-x-2">
            <span className="font-semibold text-rn-text truncate" title={sequence?.pattern}>
              {sequence ? `${sequence.baseName}*.${sequence.extension}` : 'No Sequence Loaded'}
            </span>
            {sequence && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rn-subpanel text-rn-muted border border-rn-border/80 flex-shrink-0">
                Frame {sequence.startFrame} / {sequence.endFrame} ({sequence.totalFrames}f)
              </span>
            )}
            {sequence?.missingFrames && sequence.missingFrames.length > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rn-warning/15 text-rn-warning border border-rn-warning/40 flex-shrink-0 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>
                  Missing {sequence.missingFrames.length} frame
                  {sequence.missingFrames.length > 1 ? 's' : ''}
                </span>
              </span>
            )}
            {isCurrentlyRendering && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rn-accent/20 text-rn-accent border border-rn-accent/40 flex items-center space-x-1 animate-pulse">
                <Radio className="w-3 h-3" />
                <span>Rendering Live</span>
              </span>
            )}
            {sequence && !isCurrentlyRendering && (
              <button
                type="button"
                onClick={() => setIsLiveWatch((w) => !w)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center space-x-1 transition ${
                  isLiveWatch
                    ? 'bg-rn-accent/20 border-rn-accent text-rn-accent'
                    : 'bg-rn-subpanel border-rn-border text-rn-muted hover:text-rn-text'
                }`}
                title="Live Render Mode: automatically detect new frames written to disk and extend timeline without restarting playback"
              >
                <Radio className={`w-3 h-3 ${isLiveWatch ? 'animate-pulse text-rn-accent' : ''}`} />
                <span>{isLiveWatch ? 'Live Watch: ON' : 'Live Watch'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Engine Modes, Proxy Toggle & Open Action */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {sequence && (
            <>
              {/* Realtime vs Every Frame Toggle */}
              <div className="flex items-center bg-rn-input p-0.5 rounded-md border border-rn-border">
                <button
                  type="button"
                  onClick={() => setMode('realtime')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                    mode === 'realtime'
                      ? 'bg-rn-accent text-[#0f0f10] font-semibold'
                      : 'text-rn-muted hover:text-rn-text'
                  }`}
                  title="Realtime mode: drops frames if decode lags to maintain correct playback speed"
                >
                  Realtime
                </button>
                <button
                  type="button"
                  onClick={() => setMode('every-frame')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                    mode === 'every-frame'
                      ? 'bg-rn-accent text-[#0f0f10] font-semibold'
                      : 'text-rn-muted hover:text-rn-text'
                  }`}
                  title="Every Frame mode: pauses clock until frame is ready for quality review"
                >
                  Every frame
                </button>
              </div>

              {/* Proxy Setting Selector */}
              <select
                aria-label="Proxy mode"
                value={proxySetting}
                onChange={(e) => {
                  const val = e.target.value as ProxySetting;
                  setProxySetting(val);
                  if (proxyManagerRef.current) {
                    proxyManagerRef.current.setSetting(val);
                  }
                  if (val === 'off') {
                    setUseProxyVideo(false);
                  }
                }}
                className="bg-rn-input border border-rn-border rounded text-[11px] px-1.5 py-0.5 text-rn-text focus:outline-none"
                title="Proxy generation policy (Auto: generate for EXR/HDR/4K or on drops; Always; Off)"
              >
                <option value="auto">Proxy: Auto</option>
                <option value="always">Proxy: Always</option>
                <option value="off">Proxy: Off</option>
              </select>

              {/* Proxy State & Toggle */}
              {proxyInfo?.isGenerating ? (
                <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-rn-accent/10 border border-rn-accent/30 text-[11px] text-rn-accent">
                  <div className="w-3 h-3 border-2 border-rn-accent border-t-transparent rounded-full animate-spin" />
                  <span>Proxy ({proxyInfo.progress}%)</span>
                </div>
              ) : proxyInfo?.proxyVideoPath ? (
                <button
                  type="button"
                  onClick={() => setUseProxyVideo((p) => !p)}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                    useProxyVideo
                      ? 'bg-rn-accent/20 border-rn-accent text-rn-accent'
                      : 'bg-rn-subpanel border-rn-border text-rn-muted hover:text-rn-text'
                  }`}
                  title="Toggle hardware-accelerated H.264 proxy playback"
                >
                  <Video className="w-3 h-3" />
                  <span>{proxyInfo.isToneMapped ? 'Proxy · tone-mapped' : 'Proxy · 1280p'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => proxyManagerRef.current?.startProxyGeneration()}
                  className="px-2 py-0.5 rounded text-[11px] text-rn-muted hover:text-rn-text bg-rn-subpanel border border-rn-border hover:border-rn-muted transition"
                  title="Generate high-performance GOP 1 proxy"
                >
                  Make Proxy
                </button>
              )}

              {/* View scale reset: Fit or 100% */}
              <div className="flex items-center bg-rn-input p-0.5 rounded-md border border-rn-border">
                <button
                  type="button"
                  onClick={() => handleResetView(false)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                    !fitActual ? 'bg-rn-subpanel text-rn-text' : 'text-rn-muted hover:text-rn-text'
                  }`}
                  title="Fit to view (F)"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => handleResetView(true)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                    fitActual ? 'bg-rn-subpanel text-rn-text' : 'text-rn-muted hover:text-rn-text'
                  }`}
                  title="100% 1:1 scale (1)"
                >
                  100%
                </button>
              </div>

              {/* Stats HUD toggle */}
              <button
                type="button"
                onClick={() => setShowStats((s) => !s)}
                className={`p-1.5 rounded-md border transition ${
                  showStats
                    ? 'bg-rn-accent/20 border-rn-accent text-rn-accent'
                    : 'bg-rn-subpanel border-rn-border text-rn-muted hover:text-rn-text'
                }`}
                title="Toggle Performance HUD (S)"
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-rn-accent text-[#0f0f10] font-medium text-xs hover:brightness-110 transition shadow-sm"
            title="Open image sequence or still frame folder"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Sequence</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative flex-1 bg-[#0f0f10] flex items-center justify-center overflow-hidden min-h-[260px] select-none cursor-default"
      >
        {sequence ? (
          useProxyVideo && proxyInfo?.proxyVideoPath ? (
            <div className="relative flex items-center justify-center w-full h-full p-2">
              <video
                ref={videoRef}
                src={toRnMediaUrl(proxyInfo.proxyVideoPath)}
                className="max-h-full max-w-full object-contain pointer-events-none"
                playsInline
                muted
              />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="w-full h-full block touch-none"
              style={{
                cursor: isPanningRef.current ? 'grabbing' : 'default',
              }}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-rn-muted space-y-2 p-8 text-center max-w-md">
            <FolderOpen className="w-10 h-10 stroke-[1.2] opacity-40 text-rn-muted" />
            {errorMessage ? (
              <>
                <p className="text-xs font-medium text-rn-accent">{errorMessage}</p>
                <p className="text-[11px] text-rn-muted">
                  Use "Open Sequence" to pick the folder containing your rendered frames.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-rn-text">
                  Click "Open Sequence" or select a finished job above to preview
                </p>
                <p className="text-[11px] text-rn-muted">
                  Supports PNG, JPG, EXR, TIF, WebP sequences and single stills
                </p>
              </>
            )}
          </div>
        )}

        {/* Viewport Info Overlay (Frame, Timecode, Filename) */}
        {sequence && (
          <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 bg-black/85 backdrop-blur-md rounded-md text-[11px] font-mono tabular-nums text-rn-text flex items-center space-x-2 pointer-events-none border border-rn-border/80 shadow-lg">
            <span className="font-semibold text-rn-accent">
              #{String(currentFrame).padStart(sequence.padding || 4, '0')}
            </span>
            <span className="text-rn-muted">|</span>
            <span>
              {Math.floor((currentFrame - sequence.startFrame) / fps)}s{' '}
              {((currentFrame - sequence.startFrame) % fps).toString().padStart(2, '0')}f
            </span>
            <span className="text-rn-muted">|</span>
            <span className="text-rn-muted max-w-[180px] truncate" title={currentFileName}>
              {currentFileName}
            </span>
            {isCurrentMissing && (
              <>
                <span className="text-rn-muted">|</span>
                <span className="text-rn-warning font-semibold flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Missing Frame</span>
                </span>
              </>
            )}
            {useProxyVideo && (
              <>
                <span className="text-rn-muted">|</span>
                <span className="text-rn-accent font-semibold">Video Proxy</span>
              </>
            )}
          </div>
        )}

        {/* Performance & Stats HUD Overlay */}
        {showStats && stats && (
          <div className="absolute top-2.5 right-2.5 w-60 p-3 bg-black/90 backdrop-blur-md border border-rn-border/90 rounded-lg text-xs font-mono shadow-2xl pointer-events-none space-y-1.5">
            <div className="flex items-center justify-between pb-1 border-b border-rn-border/60">
              <span className="font-semibold text-rn-accent flex items-center space-x-1">
                <Activity className="w-3.5 h-3.5" />
                <span>Performance HUD</span>
              </span>
              <span className="text-[10px] text-rn-muted">[S to close]</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rn-muted">Playback FPS:</span>
              <span
                className={`font-semibold tabular-nums ${
                  stats.achievedFps >= stats.targetFps * 0.95
                    ? 'text-emerald-400'
                    : stats.achievedFps >= stats.targetFps * 0.75
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {stats.achievedFps.toFixed(1)} / {stats.targetFps} fps
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rn-muted">Dropped frames:</span>
              <span
                className={`tabular-nums ${stats.droppedFrames > 0 ? 'text-rose-400 font-semibold' : 'text-rn-text'}`}
              >
                {stats.droppedFrames}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rn-muted">Decode latency:</span>
              <span className="tabular-nums text-rn-text">{stats.decodeMs.toFixed(1)} ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rn-muted">RAM Cache:</span>
              <span className="tabular-nums text-rn-text">
                {stats.cacheMb} MB / {stats.budgetMb} MB
              </span>
            </div>
            <div className="w-full bg-rn-subpanel h-1 rounded-full overflow-hidden">
              <div
                className="bg-rn-accent h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (stats.cacheMb / Math.max(1, stats.budgetMb)) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-rn-muted">Cached frames:</span>
              <span className="tabular-nums text-emerald-400">
                {stats.cachedFramesCount} / {stats.totalFrames} (
                {Math.round((stats.cachedFramesCount / Math.max(1, stats.totalFrames)) * 100)}%)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rn-muted">Engine Mode:</span>
              <span className="text-rn-text font-medium">
                {useProxyVideo ? 'Hardware Video Proxy' : `${mode} · Canvas 2D`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Playback & Scrubber Controls Toolbar */}
      <div className="p-3 border-t border-rn-border bg-rn-panel flex flex-col space-y-2.5">
        {/* Timeline Scrubber with Blender-style Cache Bar */}
        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono tabular-nums text-rn-muted w-10 text-right">
            {sequence?.startFrame || 1}
          </span>

          <div className="relative flex-1 flex flex-col justify-center">
            {/* Blender Green Cache Bar Canvas */}
            {sequence && (
              <div className="w-full h-1.5 rounded-full overflow-hidden bg-rn-input mb-1 relative pointer-events-none">
                <canvas ref={cacheBarRef} className="w-full h-full block" />
              </div>
            )}

            {/* Scrubber Range Slider */}
            <input
              type="range"
              min={sequence?.startFrame || 1}
              max={sequence?.endFrame || 100}
              value={currentFrame}
              disabled={!sequence || isStill}
              onMouseDown={() => {
                isDraggingTimelineRef.current = true;
              }}
              onMouseUp={() => {
                isDraggingTimelineRef.current = false;
              }}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                handleScrubberChange(val);
              }}
              className="w-full h-2 bg-rn-input rounded-lg appearance-none cursor-pointer accent-rn-accent disabled:opacity-30 disabled:cursor-not-allowed"
            />
          </div>

          <span className="text-[11px] font-mono tabular-nums text-rn-muted w-10">
            {sequence?.endFrame || 100}
          </span>
        </div>

        {/* Transport Toolbar */}
        <div className="flex items-center justify-between">
          {/* Left Transport: Step, Play, Loop, Shuttle */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Previous Frame (Left Arrow)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md bg-rn-accent text-[#0f0f10] hover:brightness-110 active:brightness-95 transition disabled:opacity-30 shadow-sm"
              title={isPlaying ? 'Pause sequence (Space)' : 'Play sequence (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Next Frame (Right Arrow)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setLoop((l) => !l)}
              disabled={!sequence || isStill}
              className={`p-1.5 rounded-md transition ${
                loop
                  ? 'text-rn-accent bg-rn-subpanel'
                  : 'text-rn-muted hover:text-rn-text hover:bg-rn-subpanel'
              } disabled:opacity-30`}
              title={loop ? 'Loop Enabled (L)' : 'Loop Disabled (L)'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (sequence) {
                  engineRef.current?.seek(sequence.startFrame);
                }
              }}
              disabled={!sequence || isStill}
              className="p-1.5 rounded-md hover:bg-rn-subpanel text-rn-muted hover:text-rn-text transition disabled:opacity-30"
              title="Jump to Start (Home)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-rn-border mx-1" />

            {/* In / Out Points */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleSetInPoint}
                disabled={!sequence || isStill}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition ${
                  inPoint !== null
                    ? 'bg-rn-accent/20 text-rn-accent border border-rn-accent/40 font-semibold'
                    : 'text-rn-muted hover:text-rn-text hover:bg-rn-subpanel border border-rn-border/50'
                } disabled:opacity-30`}
                title="Set In Point (I)"
              >
                In{inPoint !== null ? ` ${inPoint}` : ''}
              </button>

              <button
                type="button"
                onClick={handleSetOutPoint}
                disabled={!sequence || isStill}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition ${
                  outPoint !== null
                    ? 'bg-rn-accent/20 text-rn-accent border border-rn-accent/40 font-semibold'
                    : 'text-rn-muted hover:text-rn-text hover:bg-rn-subpanel border border-rn-border/50'
                } disabled:opacity-30`}
                title="Set Out Point (O)"
              >
                Out{outPoint !== null ? ` ${outPoint}` : ''}
              </button>

              {(inPoint !== null || outPoint !== null) && (
                <button
                  type="button"
                  onClick={handleClearInOut}
                  className="p-1 rounded text-rn-muted hover:text-rn-text hover:bg-rn-subpanel transition"
                  title="Clear In/Out Points"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Transport: Speed, FPS & Keyboard Shortcuts */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="hidden lg:flex items-center space-x-1.5 text-[10px] text-rn-muted font-mono">
              <span>[Space] Play</span>
              <span>·</span>
              <span>[J/K/L] Shuttle</span>
              <span>·</span>
              <span>[I/O] In/Out</span>
              <span>·</span>
              <span>[F] Fit</span>
            </div>

            {/* Speed Multiplier */}
            <div className="flex items-center space-x-1.5">
              <span className="text-rn-muted text-[11px]">Speed:</span>
              <div className="flex items-center space-x-0.5 bg-rn-input p-0.5 rounded-md border border-rn-border">
                {[0.25, 0.5, 1, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackSpeed(spd)}
                    disabled={isStill}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition ${
                      playbackSpeed === spd
                        ? 'bg-rn-accent text-[#0f0f10] font-semibold'
                        : 'text-rn-muted hover:text-rn-text'
                    } disabled:opacity-40`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* FPS Selector */}
            <div className="flex items-center space-x-1.5">
              <span className="text-rn-muted text-[11px]">FPS:</span>
              <div className="flex items-center space-x-0.5 bg-rn-input p-0.5 rounded-md border border-rn-border">
                {[12, 24, 25, 30, 60].map((rate) => (
                  <button
                    key={rate}
                    type="button"
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
