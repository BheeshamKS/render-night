// @vitest-environment jsdom
import { MonitorDock } from '../src/renderer/components/MonitorDock';
import { useQueueStore } from '../src/renderer/store/queueStore';

import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MonitorDock Thumbnail & Fallback', () => {
  beforeEach(() => {
    useQueueStore.setState({
      jobs: [],
      activeJobId: null,
      logs: [],
      isMonitorCollapsed: false,
      monitorTab: 'monitor',
      monitorStats: {
        currentFrame: 1,
        totalFrames: 100,
        sampleCurrent: 128,
        sampleTotal: 128,
        elapsedSeconds: 10,
        etaSeconds: 50,
        peakMemory: '1.2 GB',
        lastThumbnailPath: '/path/to/thumb_0001.png',
        isExr: false,
        overallProgress: 1,
      },
    });
  });

  it('renders thumbnail with toFileUrl and falls back to readImageDataUrl on error', async () => {
    const mockReadDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,mockThumbnailData');
    // @ts-expect-error mock window.rnApi
    window.rnApi = {
      readImageDataUrl: mockReadDataUrl,
    };

    render(<MonitorDock />);
    const img = screen.getByRole('img', { name: /Last Rendered Frame/i });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toContain('/path/to/thumb_0001.png');

    // Simulate error loading file:// thumbnail
    fireEvent.error(img);

    await waitFor(() => {
      expect(mockReadDataUrl).toHaveBeenCalledWith('/path/to/thumb_0001.png');
      expect(img.getAttribute('src')).toBe('data:image/png;base64,mockThumbnailData');
    });
  });

  it('switches to fallback placeholder icon if both fail', async () => {
    const mockReadDataUrl = vi.fn().mockResolvedValue(null);
    // @ts-expect-error mock window.rnApi
    window.rnApi = {
      readImageDataUrl: mockReadDataUrl,
    };

    render(<MonitorDock />);
    const img = screen.getByRole('img', { name: /Last Rendered Frame/i });

    fireEvent.error(img);

    await waitFor(() => {
      // The image element should be unmounted and replaced by placeholder text
      expect(screen.queryByRole('img', { name: /Last Rendered Frame/i })).toBeNull();
      expect(screen.getByText(/Last Rendered Frame/i)).toBeDefined();
    });
  });
});
