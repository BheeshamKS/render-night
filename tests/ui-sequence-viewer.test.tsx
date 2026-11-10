// @vitest-environment jsdom
import { SequenceViewer } from '../src/renderer/components/sequence/SequenceViewer';

import React from 'react';

import { render, screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

describe('SequenceViewer UI', () => {
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
});
