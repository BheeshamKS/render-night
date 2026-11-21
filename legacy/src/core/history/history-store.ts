import { readJsonFile, writeAtomicJson } from '../persistence/atomic-file';
import {
  historyEntrySchema,
  historyListSchema,
  type HistoryEntry,
  type HistoryResult,
} from '../schemas/history';
import type { DeviceReport } from '../schemas/runner-event';

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HistoryFilter {
  query?: string;
  engine?: string;
  result?: HistoryResult;
  device?: string;
  startDate?: number;
  endDate?: number;
}

export interface HistoryStoreOptions {
  historyDir: string;
  maxEntriesPerFile?: number;
}

export function formatActualDevice(
  report?: DeviceReport,
  devicePreferences?: { deviceType?: string; enableGpu?: boolean; selectedDevices?: string[] },
): string {
  if (!report) {
    if (devicePreferences?.enableGpu) {
      return devicePreferences.deviceType
        ? `GPU (${devicePreferences.deviceType})`
        : 'GPU (Unverified)';
    }
    return 'CPU';
  }

  if (report.mode === 'GPU') {
    const devicesList =
      report.devices && report.devices.length > 0
        ? report.devices.map((d) => (typeof d === 'string' ? d : d.name))
        : [];
    const devicesStr = devicesList.length > 0 ? devicesList.join(', ') : 'GPU';
    const typeStr = report.computeDeviceType ? ` (${report.computeDeviceType})` : '';
    return `GPU: ${devicesStr}${typeStr}`;
  }

  if (report.mode === 'CPU') {
    return report.threads ? `CPU: ${report.threads} threads` : 'CPU';
  }

  return report.mode || 'Default';
}

export class HistoryStore {
  private historyDir: string;
  private historyFilePath: string;
  private archiveFilePath: string;
  private maxEntries: number;

  constructor(options: HistoryStoreOptions) {
    this.historyDir = options.historyDir;
    this.historyFilePath = path.join(this.historyDir, 'render-history.json');
    this.archiveFilePath = path.join(this.historyDir, 'render-history.old.json');
    this.maxEntries = options.maxEntriesPerFile ?? 1000;
  }

  public getFilePath(): string {
    return this.historyFilePath;
  }

  public async getEntries(filter?: HistoryFilter): Promise<HistoryEntry[]> {
    const raw = await readJsonFile<unknown>(this.historyFilePath);
    if (!raw) {
      return [];
    }

    const parsed = historyListSchema.safeParse(raw);
    let entries = parsed.success ? parsed.data : [];

    // Filter results if requested
    if (filter) {
      const q = filter.query?.toLowerCase().trim();
      const eng = filter.engine?.toLowerCase().trim();
      const dev = filter.device?.toLowerCase().trim();

      entries = entries.filter((entry) => {
        if (filter.result && entry.result !== filter.result) {
          return false;
        }

        if (filter.startDate && entry.timestamp < filter.startDate) {
          return false;
        }

        if (filter.endDate && entry.timestamp > filter.endDate) {
          return false;
        }

        if (eng && !entry.engine.toLowerCase().includes(eng)) {
          return false;
        }

        if (dev && !entry.device.toLowerCase().includes(dev)) {
          return false;
        }

        if (q) {
          const matchName = entry.fileName.toLowerCase().includes(q);
          const matchPath = entry.filePath.toLowerCase().includes(q);
          const matchScene = entry.scene.toLowerCase().includes(q);
          const matchCamera = entry.camera.toLowerCase().includes(q);
          const matchOut = entry.outputPath.toLowerCase().includes(q);
          const matchDev = entry.device.toLowerCase().includes(q);
          if (!matchName && !matchPath && !matchScene && !matchCamera && !matchOut && !matchDev) {
            return false;
          }
        }

        return true;
      });
    }

    // Return entries sorted by timestamp descending (newest first)
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  public async appendEntry(entry: HistoryEntry): Promise<void> {
    const validated = historyEntrySchema.parse(entry);

    let entries: HistoryEntry[] = [];
    const existing = await readJsonFile<unknown>(this.historyFilePath);
    if (existing) {
      const parsed = historyListSchema.safeParse(existing);
      if (parsed.success) {
        entries = parsed.data;
      }
    }

    // Newest entries at the front
    entries.unshift(validated);

    // Rotation: if entries exceed maxEntries, rotate excess to archive
    if (entries.length > this.maxEntries) {
      const toKeep = entries.slice(0, this.maxEntries);
      const toArchive = entries.slice(this.maxEntries);

      // Append to old history archive
      let existingArchive: HistoryEntry[] = [];
      const oldRaw = await readJsonFile<unknown>(this.archiveFilePath);
      if (oldRaw) {
        const parsedOld = historyListSchema.safeParse(oldRaw);
        if (parsedOld.success) {
          existingArchive = parsedOld.data;
        }
      }
      const combinedArchive = [...toArchive, ...existingArchive];
      await writeAtomicJson(this.archiveFilePath, combinedArchive);

      entries = toKeep;
    }

    await writeAtomicJson(this.historyFilePath, entries);
  }

  public async clear(): Promise<void> {
    if (fs.existsSync(this.historyFilePath)) {
      await fs.promises.unlink(this.historyFilePath);
    }
    if (fs.existsSync(this.archiveFilePath)) {
      await fs.promises.unlink(this.archiveFilePath);
    }
  }

  public async deleteEntry(id: string): Promise<boolean> {
    const raw = await readJsonFile<unknown>(this.historyFilePath);
    if (!raw) return false;

    const parsed = historyListSchema.safeParse(raw);
    if (!parsed.success) return false;

    const filtered = parsed.data.filter((e) => e.id !== id);
    if (filtered.length === parsed.data.length) return false;

    await writeAtomicJson(this.historyFilePath, filtered);
    return true;
  }
}
