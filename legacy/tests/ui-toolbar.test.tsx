// @vitest-environment jsdom
import { Toolbar } from '../src/renderer/components/Toolbar';
import { type QueueJob, useQueueStore } from '../src/renderer/store/queueStore';

import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Toolbar Component - Prominent Scheduling on Top', () => {
  beforeEach(() => {
    // Reset store to known baseline
    useQueueStore.setState({
      jobs: [
        {
          id: 'job-1',
          name: 'scene_test.blend',
          filePath: '/path/scene_test.blend',
          status: 'Queued',
          scene: 'Scene',
          camera: 'Camera',
          startFrame: 1,
          endFrame: 10,
          step: 1,
          engine: 'CYCLES',
          device: 'GPU',
          outputPath: '/tmp/output',
          fileFormat: 'PNG',
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          samples: 128,
          enabled: true,
          isVideo: false,
          colorManagement: { viewTransform: 'Standard', look: 'None', exposure: 0, gamma: 1 },
          metadata: { sceneCount: 1, scenes: ['Scene'], cameras: ['Camera'] },
        } as unknown as QueueJob,
      ],
      blenders: [
        {
          id: 'b-1',
          version: '4.2.0',
          major: 4,
          minor: 2,
          patch: 0,
          executable: ['/usr/bin/blender'],
          displayPath: '/usr/bin/blender',
          source: 'system',
          isPortable: false,
        },
      ],
      selectedBlenderId: 'b-1',
      queueState: 'idle',
      scheduleConfig: {
        enabled: false,
        time: '23:00',
        startImmediately: false,
        stopEnabled: false,
        stopTime: '06:00',
        stopAction: 'shutdown',
        blockSleep: true,
      },
      showScheduleModal: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders prominent Schedule button on top toolbar when scheduling is inactive', () => {
    render(<Toolbar />);

    const scheduleBtn = screen.getByRole('button', { name: /Schedule/i });
    expect(scheduleBtn).toBeDefined();

    // Verify it is not disabled even if jobs exist
    expect((scheduleBtn as HTMLButtonElement).disabled).toBe(false);

    // Clicking Schedule opens ScheduleModal
    fireEvent.click(scheduleBtn);
    expect(useQueueStore.getState().showScheduleModal).toBe(true);
  });

  it('allows clicking Schedule button even while queue is running (to set stop window)', () => {
    useQueueStore.setState({ queueState: 'running' });
    render(<Toolbar />);

    const scheduleBtn = screen.getByRole('button', { name: /Schedule/i });
    expect(scheduleBtn).toBeDefined();
    expect((scheduleBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(scheduleBtn);
    expect(useQueueStore.getState().showScheduleModal).toBe(true);
  });

  it('renders active schedule timeframe badge with start and stop times when schedule is enabled', () => {
    useQueueStore.setState({
      scheduleConfig: {
        enabled: true,
        time: '22:30',
        startImmediately: false,
        stopEnabled: true,
        stopTime: '06:30',
        stopAction: 'shutdown',
        blockSleep: true,
      },
    });

    render(<Toolbar />);

    // Should display timeframe pill: 22:30 → 06:30
    expect(screen.getByText(/22:30 → 06:30/)).toBeDefined();

    // Inactive "Schedule" button should not be present
    expect(screen.queryByRole('button', { name: /^Schedule$/i })).toBeNull();

    // Clicking active pill opens ScheduleModal to edit
    const editBtn = screen.getByTitle(/Active schedule: Starts at 22:30/i);
    fireEvent.click(editBtn);
    expect(useQueueStore.getState().showScheduleModal).toBe(true);
  });

  it('displays "Now → stopTime" in timeframe pill when startImmediately is true', () => {
    useQueueStore.setState({
      scheduleConfig: {
        enabled: true,
        time: '12:00',
        startImmediately: true,
        stopEnabled: true,
        stopTime: '04:00',
        stopAction: 'sleep',
        blockSleep: true,
      },
    });

    render(<Toolbar />);

    expect(screen.getByText(/Now → 04:00/)).toBeDefined();
  });

  it('provides an inline cancel button (X) on the schedule pill to cancel immediately', () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    useQueueStore.setState({
      scheduleConfig: {
        enabled: true,
        time: '23:00',
        startImmediately: false,
        stopEnabled: false,
        stopTime: '07:00',
        stopAction: 'shutdown',
        blockSleep: true,
      },
      cancelSchedule: cancelSpy,
    });

    render(<Toolbar />);

    const cancelBtn = screen.getByTitle('Cancel active schedule');
    expect(cancelBtn).toBeDefined();

    fireEvent.click(cancelBtn);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('renders Start Queue button when queue is idle and switches to Pause/Stop when running', async () => {
    const startPreflightSpy = vi.fn().mockResolvedValue(undefined);
    useQueueStore.setState({
      queueState: 'idle',
      startQueueWithPreflight: startPreflightSpy,
    });

    const { rerender } = render(<Toolbar />);
    const startBtn = screen.getByRole('button', { name: /Start Queue/i });
    expect(startBtn).toBeDefined();

    fireEvent.click(startBtn);
    expect(startPreflightSpy).toHaveBeenCalledTimes(1);

    // Switch to running
    await act(async () => {
      useQueueStore.setState({ queueState: 'running' });
    });
    rerender(<Toolbar />);

    expect(screen.queryByRole('button', { name: /Start Queue/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Pause/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Stop/i })).toBeDefined();
  });
});
