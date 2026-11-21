export type PlaybackMode = 'realtime' | 'every-frame';
export type ProxySetting = 'auto' | 'off' | 'always';

export interface DecodedFrame {
  frame: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  byteSize: number;
  decodeMs: number;
}

export interface DecodeTask {
  id: string;
  frame: number;
  url: string;
  filePath: string;
  targetWidth?: number;
  targetHeight?: number;
  priority: number;
}

export interface PlayerStats {
  achievedFps: number;
  targetFps: number;
  droppedFrames: number;
  renderedFrames: number;
  decodeMs: number;
  cacheMb: number;
  budgetMb: number;
  cachedFramesCount: number;
  totalFrames: number;
  mode: 'Cache' | 'Proxy';
  proxyProgress?: number | null;
  isProxyActive?: boolean;
}

export interface ClockState {
  currentFrame: number;
  isPlaying: boolean;
  fps: number;
  playbackSpeed: number;
  loop: boolean;
  inPoint: number | null;
  outPoint: number | null;
  mode: PlaybackMode;
}

export interface ProxyJobInfo {
  sequenceDirectory: string;
  proxyVideoPath: string;
  isGenerating: boolean;
  progress: number;
  error?: string | null;
  isToneMapped?: boolean;
}
