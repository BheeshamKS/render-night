// @vitest-environment jsdom
import { ScheduleModal } from '../src/renderer/components/ScheduleModal';
import { useQueueStore } from '../src/renderer/store/queueStore';

import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ScheduleModal Component', () => {
  beforeEach(() => {
    useQueueStore.setState({
      showScheduleModal: true,
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
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders Queue Scheduling title and configuration controls when inactive', () => {
    render(<ScheduleModal />);

    expect(screen.getByText('Queue Scheduling')).toBeDefined();
    expect(screen.getByText('Start Time')).toBeDefined();
    expect(screen.getByText('Stop Window & Action')).toBeDefined();
    expect(screen.getByRole('button', { name: /Activate Schedule/i })).toBeDefined();
  });

  it('calls setSchedule with correct payload when activating schedule', async () => {
    const setScheduleSpy = vi.fn().mockResolvedValue(undefined);
    useQueueStore.setState({ setSchedule: setScheduleSpy });

    render(<ScheduleModal />);

    const activateBtn = screen.getByRole('button', { name: /Activate Schedule/i });
    await act(async () => {
      fireEvent.click(activateBtn);
    });

    expect(setScheduleSpy).toHaveBeenCalledTimes(1);
    expect(setScheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        stopAction: 'shutdown',
        blockSleep: true,
      }),
    );
  });

  it('displays active schedule summary and allows entering edit mode', async () => {
    useQueueStore.setState({
      scheduleConfig: {
        enabled: true,
        time: '21:30',
        startImmediately: false,
        stopEnabled: true,
        stopTime: '05:00',
        stopAction: 'sleep',
        blockSleep: true,
      },
    });

    render(<ScheduleModal />);

    expect(screen.getByText('Active Schedule Configured')).toBeDefined();
    expect(screen.getByText('At 21:30')).toBeDefined();
    expect(screen.getByText('At 05:00')).toBeDefined();

    // Check action buttons
    const editBtn = screen.getByRole('button', { name: /Edit Schedule/i });
    const cancelBtn = screen.getByRole('button', { name: /Cancel Schedule/i });
    expect(editBtn).toBeDefined();
    expect(cancelBtn).toBeDefined();

    // Click "Edit Schedule"
    await act(async () => {
      fireEvent.click(editBtn);
    });

    // Should switch to edit view with "Save Changes" and "Back"
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Back/i })).toBeDefined();

    // Click "Back"
    const backBtn = screen.getByRole('button', { name: /Back/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });

    // Should return to summary
    expect(screen.getByText('Active Schedule Configured')).toBeDefined();
  });

  it('shows appropriate notification when queue is already running', () => {
    useQueueStore.setState({
      queueState: 'running',
      scheduleConfig: {
        enabled: false,
        time: '23:00',
        startImmediately: false,
        stopEnabled: false,
        stopTime: '06:00',
        stopAction: 'shutdown',
        blockSleep: true,
      },
    });

    render(<ScheduleModal />);

    expect(
      screen.getByText(/Queue is currently rendering. Set an automatic stop window below/i),
    ).toBeDefined();
  });
});
