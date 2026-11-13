// @vitest-environment jsdom
import { SequenceViewer } from '../src/renderer/components/sequence/SequenceViewer';

import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi, beforeAll } from 'vitest';

describe('SequenceViewer UI', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    });
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
    });
  });
  it('renders open sequence button and playback controls', () => {
    render(<SequenceViewer sequence={null} onSelectSequence={() => {}} />);
    expect(screen.getByRole('button', { name: /Open Sequence/i })).toBeDefined();
    expect(screen.getByTitle(/Play sequence/i)).toBeDefined();
    expect(screen.getByText(/FPS:/i)).toBeDefined();
  });

  it('renders sequence details and missing frames warning when sequence has missing frames', () => {
    const mockSeq = {
      directory: '/renders',
      baseName: 'shot_',
      extension: 'png',
      pattern: '/renders/shot_%04d.png',
      padding: 4,
      startFrame: 1,
      endFrame: 5,
      totalFrames: 4,
      frames: [1, 2, 4, 5],
      filePaths: {
        1: '/renders/shot_0001.png',
        2: '/renders/shot_0002.png',
        4: '/renders/shot_0004.png',
        5: '/renders/shot_0005.png',
      },
      missingFrames: [3],
      isNativeFormat: true,
    };

    render(<SequenceViewer sequence={mockSeq} onSelectSequence={() => {}} />);
    expect(screen.getByText(/shot_\*\.png/i)).toBeDefined();
    expect(screen.getByText(/Missing 1 frame/i)).toBeDefined();
    expect(screen.getByText(/Frame 1 \/ 5/i)).toBeDefined();
  });

  it('renders In/Out point controls and playback speed buttons', () => {
    const mockSeq = {
      directory: '/renders',
      baseName: 'render_',
      extension: 'png',
      pattern: '/renders/render_%04d.png',
      padding: 4,
      startFrame: 10,
      endFrame: 50,
      totalFrames: 41,
      frames: Array.from({ length: 41 }, (_, i) => 10 + i),
      filePaths: {},
      missingFrames: [],
      isNativeFormat: true,
    };

    render(<SequenceViewer sequence={mockSeq} onSelectSequence={() => {}} />);
    expect(screen.getByTitle(/Set In Point/i)).toBeDefined();
    expect(screen.getByTitle(/Set Out Point/i)).toBeDefined();
    expect(screen.getByText(/Speed:/i)).toBeDefined();
    expect(screen.getByText(/0\.5x/i)).toBeDefined();
    expect(screen.getByText(/2x/i)).toBeDefined();
  });

  it('renders canvas element and mode toggle buttons', () => {
    const mockSeq = {
      directory: '/renders',
      baseName: 'render_',
      extension: 'png',
      pattern: '/renders/render_%04d.png',
      padding: 4,
      startFrame: 1,
      endFrame: 24,
      totalFrames: 24,
      frames: Array.from({ length: 24 }, (_, i) => 1 + i),
      filePaths: { 1: '/renders/render_0001.png' },
      missingFrames: [],
      isNativeFormat: true,
    };

    const { container } = render(<SequenceViewer sequence={mockSeq} onSelectSequence={() => {}} />);
    // Main canvas and cache bar canvas
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(1);

    // Mode toggle buttons
    expect(screen.getByRole('button', { name: /Realtime/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Every frame/i })).toBeDefined();

    // Toggle mode
    fireEvent.click(screen.getByRole('button', { name: /Every frame/i }));
  });

  it('toggles performance stats HUD overlay', () => {
    const mockSeq = {
      directory: '/renders',
      baseName: 'shot_',
      extension: 'png',
      pattern: '/renders/shot_%04d.png',
      padding: 4,
      startFrame: 1,
      endFrame: 10,
      totalFrames: 10,
      frames: Array.from({ length: 10 }, (_, i) => 1 + i),
      filePaths: { 1: '/renders/shot_0001.png' },
      missingFrames: [],
      isNativeFormat: true,
    };

    render(<SequenceViewer sequence={mockSeq} onSelectSequence={() => {}} />);
    const statsBtn = screen.getByTitle(/Toggle Performance HUD/i);
    expect(statsBtn).toBeDefined();
    fireEvent.click(statsBtn);
  });
});
