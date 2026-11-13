import type { ImageSequenceInfo } from '../../core/schemas/sequence';
import type { ProxyJobInfo, ProxySetting } from './types';

const HEAVY_EXTENSIONS = ['exr', 'hdr', 'dpx', 'tif', 'tiff', 'cin'];

export function isHeavySequence(sequence: ImageSequenceInfo, sourceWidth?: number): boolean {
  const ext = (sequence.extension || '').toLowerCase();
  if (HEAVY_EXTENSIONS.includes(ext) || !sequence.isNativeFormat) {
    return true;
  }
  if (sourceWidth && sourceWidth > 2560) {
    return true;
  }
  return false;
}

export class SequenceProxyManager {
  private _sequence: ImageSequenceInfo;
  private _proxySetting: ProxySetting = 'auto';
  private _info: ProxyJobInfo;
  private _onUpdate?: (info: ProxyJobInfo) => void;
  private _cleanupListener?: () => void;

  constructor(
    sequence: ImageSequenceInfo,
    proxySetting: ProxySetting = 'auto',
    onUpdate?: (info: ProxyJobInfo) => void,
  ) {
    this._sequence = sequence;
    this._proxySetting = proxySetting;
    this._onUpdate = onUpdate;

    this._info = {
      sequenceDirectory: sequence.directory,
      proxyVideoPath: '',
      isGenerating: false,
      progress: 0,
      error: null,
      isToneMapped: isHeavySequence(sequence),
    };

    if (typeof window !== 'undefined' && window.rnApi?.onVideoProxyProgress) {
      this._cleanupListener = window.rnApi.onVideoProxyProgress((data) => {
        if (data.directory === this._sequence.directory) {
          this._info.progress = data.progress;
          this._onUpdate?.({ ...this._info });
        }
      });
    }
  }

  public get info(): ProxyJobInfo {
    return { ...this._info };
  }

  public get proxySetting(): ProxySetting {
    return this._proxySetting;
  }

  public set proxySetting(setting: ProxySetting) {
    this._proxySetting = setting;
    if (setting === 'always' || (setting === 'auto' && isHeavySequence(this._sequence))) {
      void this.startProxyGeneration();
    }
  }

  public setSetting(setting: ProxySetting): void {
    this.proxySetting = setting;
  }

  public shouldAutoStart(sourceWidth?: number): boolean {
    if (this._proxySetting === 'off') return false;
    if (this._proxySetting === 'always') return true;
    return isHeavySequence(this._sequence, sourceWidth);
  }

  public async startProxyGeneration(): Promise<string | null> {
    if (this._info.isGenerating || this._proxySetting === 'off') {
      return this._info.proxyVideoPath || null;
    }

    if (typeof window === 'undefined' || !window.rnApi?.getVideoProxy) {
      return null;
    }

    this._info.isGenerating = true;
    this._info.error = null;
    this._info.progress = 0;
    this._onUpdate?.({ ...this._info });

    try {
      const res = await window.rnApi.getVideoProxy(this._sequence);
      this._info.isGenerating = false;
      this._info.proxyVideoPath = res.proxyPath;
      this._info.isToneMapped = res.isToneMapped;
      this._info.progress = 100;
      this._onUpdate?.({ ...this._info });
      return res.proxyPath;
    } catch (err) {
      this._info.isGenerating = false;
      this._info.error = err instanceof Error ? err.message : String(err);
      this._onUpdate?.({ ...this._info });
      return null;
    }
  }

  public destroy(): void {
    if (this._cleanupListener) {
      this._cleanupListener();
      this._cleanupListener = undefined;
    }
  }
}
