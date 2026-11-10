import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GpuStatus {
  verified: boolean;
  name?: string;
  utilizationPercent?: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  tool?: 'nvidia-smi' | 'rocm-smi';
}

/**
 * Best-effort GPU query via nvidia-smi or rocm-smi.
 * Returns verified status if available, or verified: false ("unverified") if absent.
 */
export async function sampleGpuUtilization(): Promise<GpuStatus> {
  // 1. Try nvidia-smi
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 1500 },
    );

    const firstLine = stdout.trim().split('\n')[0];
    if (firstLine) {
      const parts = firstLine.split(',').map((p) => p.trim());
      if (parts.length >= 4) {
        const name = parts[0];
        const utilizationPercent = parseInt(parts[1], 10);
        const memoryUsedMb = parseInt(parts[2], 10);
        const memoryTotalMb = parseInt(parts[3], 10);

        return {
          verified: true,
          name,
          utilizationPercent: isNaN(utilizationPercent) ? undefined : utilizationPercent,
          memoryUsedMb: isNaN(memoryUsedMb) ? undefined : memoryUsedMb,
          memoryTotalMb: isNaN(memoryTotalMb) ? undefined : memoryTotalMb,
          tool: 'nvidia-smi',
        };
      }
    }
  } catch {
    // nvidia-smi not available or failed
  }

  // 2. Try rocm-smi
  try {
    const { stdout } = await execFileAsync(
      'rocm-smi',
      ['--showuse', '--showmeminfo', 'vram', '--json'],
      {
        timeout: 1500,
      },
    );
    const parsed = JSON.parse(stdout);
    // rocm-smi output has card keys e.g. "card0"
    const cardKey = Object.keys(parsed).find((k) => k.startsWith('card'));
    if (cardKey && parsed[cardKey]) {
      const card = parsed[cardKey];
      const useStr = card['GPU use (%)'] || card['GPU use'];
      const utilizationPercent = useStr ? parseInt(String(useStr), 10) : undefined;
      return {
        verified: true,
        name: card['Card Series'] || 'AMD Radeon GPU',
        utilizationPercent: isNaN(utilizationPercent as number) ? undefined : utilizationPercent,
        tool: 'rocm-smi',
      };
    }
  } catch {
    // rocm-smi not available or failed
  }

  return { verified: false };
}
