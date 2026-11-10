// @vitest-environment jsdom
import { JobCard } from '../src/renderer/components/JobCard';
import { PreflightModal } from '../src/renderer/components/PreflightModal';
import { RenderPropertiesTab } from '../src/renderer/components/drawer/RenderPropertiesTab';
import { useQueueStore, type QueueJob } from '../src/renderer/store/queueStore';

import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Pre-flight Modal & Job Tools UI', () => {
  const sampleJob: QueueJob = {
    id: 'job-pf-1',
    filePath: '/renders/scene_a.blend',
    fileName: 'scene_a.blend',
    project: 'scene_a',
    enabled: true,
    status: 'Queued',
    selectedScene: 'Scene',
    selectedCamera: 'Camera_Main',
    scenes: [
      {
        name: 'Scene',
        activeCamera: 'Camera_Main',
        cameras: ['Camera_Main', 'Camera_Wide'],
        viewLayers: ['ViewLayer'],
        frameStart: 1,
        frameEnd: 250,
        frameStep: 1,
        fps: 24,
        fpsBase: 1,
        resolutionX: 1920,
        resolutionY: 1080,
        resolutionPercentage: 100,
        render: {},
        imageSettings: {},
        ffmpeg: {},
        cycles: {},
        eevee: {},
        viewSettings: {},
        displaySettings: {},
      },
    ],
    availableCameras: ['Camera_Main', 'Camera_Wide'],
    outputPathPattern: '//render/test_####.png',
    outputPreview: '//render/test_0001.png',
    rangeConfig: { mode: 'scene_default' },
    failedFrames: [],
    logs: [],
    overrides: {},
  };

  beforeEach(() => {
    useQueueStore.setState({
      jobs: [sampleJob],
      blenders: [
        {
          id: 'b-42',
          version: '4.2.0',
          major: 4,
          minor: 2,
          patch: 0,
          executable: ['blender'],
          displayPath: '/usr/bin/blender',
          isPortable: false,
          source: 'system',
        },
      ],
      selectedBlenderId: 'b-42',
      showPreflightModal: false,
      preflightReport: null,
      preflightTargetJobId: null,
    });
  });

  it('renders PreflightModal with errors and quick-fix button', () => {
    const errorIssue = {
      id: 'err-1',
      jobId: 'job-pf-1',
      jobName: 'scene_a.blend',
      code: 'VIDEO_RANGE_RULE_VIOLATION',
      severity: 'error' as const,
      message: 'Video formats require continuous frame ranges.',
      quickFix: {
        label: 'Switch to Continuous Range',
        action: 'switch_range_to_continuous' as const,
      },
    };

    useQueueStore.setState({
      showPreflightModal: true,
      preflightReport: {
        timestamp: Date.now(),
        hasErrors: true,
        hasWarnings: false,
        errors: [errorIssue],
        warnings: [],
        jobReports: [
          {
            jobId: 'job-pf-1',
            jobName: 'scene_a.blend',
            errors: [errorIssue],
            warnings: [],
          },
        ],
      },
    });

    render(<PreflightModal />);

    expect(screen.getByText(/Pre-Flight Validation Report/i)).toBeDefined();
    expect(screen.getByText(/Execution Blocked/i)).toBeDefined();
    expect(screen.getByText(/Video formats require continuous frame ranges/i)).toBeDefined();
    expect(screen.getByText('Switch to Continuous Range')).toBeDefined();
  });

  it('clicking quick fix button triggers applyQuickFix', async () => {
    const applyQuickFixSpy = vi.fn();
    const errorIssue = {
      id: 'err-1',
      jobId: 'job-pf-1',
      jobName: 'scene_a.blend',
      code: 'VIDEO_RANGE_RULE_VIOLATION',
      severity: 'error' as const,
      message: 'Video formats require continuous frame ranges.',
      quickFix: {
        label: 'Switch to Continuous Range',
        action: 'switch_range_to_continuous' as const,
      },
    };

    useQueueStore.setState({
      showPreflightModal: true,
      applyQuickFix: applyQuickFixSpy,
      preflightReport: {
        timestamp: Date.now(),
        hasErrors: true,
        hasWarnings: false,
        errors: [errorIssue],
        warnings: [],
        jobReports: [
          {
            jobId: 'job-pf-1',
            jobName: 'scene_a.blend',
            errors: [errorIssue],
            warnings: [],
          },
        ],
      },
    });

    render(<PreflightModal />);

    const quickFixBtn = screen.getByText('Switch to Continuous Range');
    fireEvent.click(quickFixBtn);

    expect(applyQuickFixSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VIDEO_RANGE_RULE_VIOLATION',
      }),
    );
  });

  it('renders Ignore Warnings & Start Render when warnings only exist', () => {
    const startQueueSpy = vi.fn();
    const warnIssue = {
      id: 'warn-1',
      jobId: 'job-pf-1',
      jobName: 'scene_a.blend',
      code: 'MISSING_ASSETS',
      severity: 'warning' as const,
      message: 'Found 1 missing external texture.',
    };

    useQueueStore.setState({
      showPreflightModal: true,
      startQueue: startQueueSpy,
      preflightReport: {
        timestamp: Date.now(),
        hasErrors: false,
        hasWarnings: true,
        errors: [],
        warnings: [warnIssue],
        jobReports: [
          {
            jobId: 'job-pf-1',
            jobName: 'scene_a.blend',
            errors: [],
            warnings: [warnIssue],
          },
        ],
      },
    });

    render(<PreflightModal />);

    expect(screen.getByText(/Warnings Detected/i)).toBeDefined();
    const ignoreBtn = screen.getByText(/Ignore Warnings & Start Render/i);
    expect(ignoreBtn).toBeDefined();

    fireEvent.click(ignoreBtn);
    expect(startQueueSpy).toHaveBeenCalled();
  });

  it('renders JobCard with Job Tools (Pre-flight, Duplicate, All Cameras, All Scenes, Open in Blender)', () => {
    const duplicateSpy = vi.fn();
    const expandCamerasSpy = vi.fn();
    const openInBlenderSpy = vi.fn();

    useQueueStore.setState({
      duplicateJob: duplicateSpy,
      expandAllCameras: expandCamerasSpy,
      openInBlender: openInBlenderSpy,
    });

    render(<JobCard job={sampleJob} index={0} total={1} />);

    expect(screen.getByText('Pre-flight')).toBeDefined();
    expect(screen.getByText('Duplicate')).toBeDefined();
    expect(screen.getByText(/All Cameras/i)).toBeDefined();
    expect(screen.getByText(/All Scenes/i)).toBeDefined();
    expect(screen.getByText('Open in Blender')).toBeDefined();

    fireEvent.click(screen.getByText('Duplicate'));
    expect(duplicateSpy).toHaveBeenCalledWith('job-pf-1');

    fireEvent.click(screen.getByText(/All Cameras/i));
    expect(expandCamerasSpy).toHaveBeenCalledWith('job-pf-1');

    fireEvent.click(screen.getByText('Open in Blender'));
    expect(openInBlenderSpy).toHaveBeenCalledWith('job-pf-1');
  });

  it('renders Pre-Render Python Hook input in RenderPropertiesTab with security notice', () => {
    render(<RenderPropertiesTab job={sampleJob} />);

    expect(screen.getByText('Pre-Render Python Hook')).toBeDefined();
    expect(screen.getByText(/Advanced: Trusted Code Only/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/# e.g. bpy.context.scene/i)).toBeDefined();
  });
});
