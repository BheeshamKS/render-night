// @vitest-environment jsdom
import { SequenceConverter } from '../src/renderer/components/sequence/SequenceConverter';

import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

describe('SequenceConverter UI', () => {
  it('renders format dropdown, resolution, quality, audio picker, and stitch button', () => {
    render(<SequenceConverter sequence={null} />);
    expect(screen.getByText(/Format/i)).toBeDefined();
    expect(screen.getByText(/Resolution/i)).toBeDefined();
    expect(screen.getByText(/^Quality$/i)).toBeDefined();
    expect(screen.getByText(/Audio Track/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Stitch to Video/i })).toBeDefined();
  });

  it('triggers stitchSequence when clicking Stitch to Video with loaded sequence', async () => {
    const mockStitch = vi.fn().mockResolvedValue('/renders/output.mp4');
    window.rnApi = {
      stitchSequence: mockStitch,
      onStitchProgress: vi.fn().mockReturnValue(() => {}),
      selectSaveVideoPath: vi.fn().mockResolvedValue('/renders/custom_out.mp4'),
    } as unknown as typeof window.rnApi;

    const mockSeq = {
      directory: '/renders',
      baseName: 'shot_',
      extension: 'png',
      pattern: '/renders/shot_%04d.png',
      padding: 4,
      startFrame: 1,
      endFrame: 10,
      totalFrames: 10,
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      filePaths: {},
      missingFrames: [],
      isNativeFormat: true,
    };

    render(<SequenceConverter sequence={mockSeq} />);
    const stitchBtn = screen.getByRole('button', { name: /Stitch to Video/i });

    await act(async () => {
      fireEvent.click(stitchBtn);
    });

    expect(mockStitch).toHaveBeenCalled();
  });
});
