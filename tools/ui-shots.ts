import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron } from 'playwright';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots');

const RESOLUTIONS = [
  { width: 1100, height: 700 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

function loadFixtureInspect() {
  const p = path.resolve(process.cwd(), 'tests/fixtures/inspect-sample.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function run() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const inspectFixture = loadFixtureInspect();

  const mockBlenders = [
    {
      id: 'blender-4.2',
      displayPath: '/usr/bin/blender',
      version: '4.2.0',
      major: 4,
      minor: 2,
      patch: 0,
      isPortable: false,
      source: 'system',
      executable: ['/usr/bin/blender'],
    },
    {
      id: 'blender-3.6',
      displayPath: '/opt/blender-3.6/blender',
      version: '3.6.14',
      major: 3,
      minor: 6,
      patch: 14,
      isPortable: true,
      source: 'custom',
      executable: ['/opt/blender-3.6/blender'],
    },
  ];

  const baseJob = (
    id: string,
    name: string,
    status: 'Queued' | 'Inspecting' | 'Rendering' | 'Completed' | 'Failed' | 'Skipped' = 'Queued',
  ) => ({
    id,
    fileName: name,
    filePath: `/projects/vfx/shots/${name}`,
    project: 'cyberpunk_city',
    enabled: true,
    status,
    selectedScene: 'Scene',
    selectedCamera: 'Camera',
    scenes: inspectFixture.scenes,
    availableCameras: ['Camera', 'Camera.Wide', 'Camera.CloseUp'],
    outputPathPattern: '//render/{project}/{scene}_{camera}_####.png',
    outputPreview: `/renders/cyberpunk_city/Scene_Camera_0001.png`,
    inspectData: inspectFixture,
    logs: [
      {
        line: `Initialized job ${name}`,
        stream: 'stdout',
        isError: false,
        timestamp: Date.now() - 5000,
      },
      {
        line: 'Fra:1 Mem:245.3M (Peak 312.1M) | Time:00:04.12 | Remaining:01:24.00 | Sample 128/512',
        stream: 'stdout',
        isError: false,
        timestamp: Date.now() - 2000,
      },
    ],
    rangeConfig: { mode: 'Simple', start: 1, end: 250, step: 1 },
    failedFrames: [],
    overrides: {},
    presets: [],
  });

  const STATES = [
    {
      id: '01-empty-queue',
      description: 'empty queue',
      getState: () => ({
        jobs: [],
        queueState: 'idle',
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        selectedJobId: null,
      }),
    },
    {
      id: '02-inspecting-jobs',
      description: '3 jobs inspecting',
      getState: () => ({
        jobs: [
          { ...baseJob('job-1', 'hero_character_v04.blend', 'Inspecting'), inspectData: undefined },
          {
            ...baseJob('job-2', 'city_environment_lighting.blend', 'Inspecting'),
            inspectData: undefined,
          },
          { ...baseJob('job-3', 'rain_particles_sim.blend', 'Inspecting'), inspectData: undefined },
        ],
        queueState: 'idle',
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        selectedJobId: 'job-1',
      }),
    },
    {
      id: '03-queued-jobs',
      description: '5 jobs queued',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', '01_intro_neon.blend', 'Queued'),
            overrides: { 'scene.cycles.samples': 256, 'scene.render.resolution_x': 1920 },
            rangeConfig: {
              mode: 'simple',
              simple: { start: 1, end: 250, step: 1 },
            },
          },
          {
            ...baseJob('job-2', '02_alleyway_chase.blend', 'Queued'),
            rangeConfig: {
              mode: 'custom',
              customExpression: '1-100, 150-200',
            },
            customRangeLiveCount: 151,
          },
          {
            ...baseJob('job-3', '03_rooftop_confrontation.blend', 'Queued'),
            rangeConfig: {
              mode: 'simple',
              simple: { start: 50, end: 300, step: 2 },
            },
          },
          { ...baseJob('job-4', '04_cyber_car_interior.blend', 'Queued') },
          { ...baseJob('job-5', '05_credits_sequence.blend', 'Queued') },
        ],
        queueState: 'idle',
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        selectedJobId: 'job-1',
      }),
    },
    {
      id: '04-job-rendering',
      description: 'one job rendering',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', '01_intro_neon.blend', 'Rendering'),
            completedFrames: 64,
            totalFrames: 250,
            deviceReport: {
              computeDeviceType: 'OPTIX',
              devices: [
                {
                  name: 'NVIDIA GeForce RTX 3080 Ti',
                  type: 'OPTIX',
                  use: true,
                },
              ],
              mode: 'GPU',
              engine: 'CYCLES',
            },
          },
          baseJob('job-2', '02_alleyway_chase.blend', 'Queued'),
          baseJob('job-3', '03_rooftop_confrontation.blend', 'Queued'),
        ],
        queueState: 'running',
        activeJobId: 'job-1',
        queueProgress: {
          activeJobId: 'job-1',
          activeJobName: '01_intro_neon.blend',
          currentFrame: 64,
          totalFrames: 250,
          currentSample: 128,
          totalSamples: 512,
          elapsedSeconds: 312,
          remainingSeconds: 480,
          peakMemoryMb: 1420.5,
          computeDeviceType: 'OPTIX',
          devices: ['NVIDIA GeForce RTX 3080 Ti'],
          mode: 'GPU',
          engine: 'CYCLES',
          overallProgress: 25.6,
        },
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        selectedJobId: 'job-1',
      }),
    },
    {
      id: '05-failed-job-crash-log',
      description: 'one failed job with crash log',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', 'heavy_fluid_explosion.blend', 'Failed'),
            error: 'Blender process crashed (SIGSEGV): CUDA_ERROR_OUT_OF_MEMORY during tile render',
            logs: [
              {
                line: 'Fra:42 Mem:8450M (Peak 12100M) | Time:01:23.44 | Remaining:04:12.00 | Sample 410/512',
                stream: 'stdout',
                isError: false,
                timestamp: Date.now() - 3000,
              },
              {
                line: 'Error: CUDA out of memory in cuMemAllocManaged(&device_pointer, size)',
                stream: 'stderr',
                isError: true,
                timestamp: Date.now() - 2000,
              },
              {
                line: 'Fra:42 error: System out of GPU memory. Render aborted.',
                stream: 'stderr',
                isError: true,
                timestamp: Date.now() - 1000,
              },
              {
                line: 'Blender quit with return code 139 (SIGSEGV)',
                stream: 'stderr',
                isError: true,
                timestamp: Date.now(),
              },
            ],
            failedFrames: [
              { frame: 42, error: 'CUDA out of memory', attempts: 3, timestamp: Date.now() },
            ],
          },
          baseJob('job-2', 'light_props.blend', 'Queued'),
        ],
        queueState: 'idle',
        isMonitorCollapsed: false,
        monitorTab: 'console',
        logs: [
          '[02:14:10] Starting job heavy_fluid_explosion.blend (Blender 4.2.0)',
          '[02:14:12] Fra:40 Mem:8100M | Time:01:10.22 | Sample 512/512 | Saved: //render/frame_0040.png',
          '[02:14:15] Fra:41 Mem:8240M | Time:01:12.80 | Sample 512/512 | Saved: //render/frame_0041.png',
          '[02:14:18] Fra:42 Mem:8450M (Peak 12100M) | Time:01:23.44 | Sample 410/512',
          '[02:14:22] Error: CUDA_ERROR_OUT_OF_MEMORY: out of memory in cuMemAllocManaged(&mem, size)',
          '[02:14:22] CUDA back-end failed to allocate 4.21 GB for volume shadow grid cache',
          '[02:14:23] Blender process crashed with signal SIGSEGV (core dumped)',
          '[02:14:23] Job failed: 1 frame failed, crash retry limit exceeded.',
        ],
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        selectedJobId: 'job-1',
      }),
    },
    {
      id: '06-properties-editor-open',
      description: 'properties editor open',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', 'cyber_street_hero.blend', 'Queued'),
            overrides: {
              'scene.render.engine': 'CYCLES',
              'scene.cycles.device': 'GPU',
              'scene.cycles.samples': 512,
              'scene.cycles.use_denoising': true,
              'scene.render.resolution_x': 1920,
              'scene.render.resolution_y': 1080,
              'scene.render.resolution_percentage': 100,
            },
          },
          baseJob('job-2', 'drone_flight_path.blend', 'Queued'),
        ],
        queueState: 'idle',
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'queue',
        selectedJobId: 'job-1',
        isDrawerOpen: true,
        propertiesTab: 'render',
        propertiesPanelWidth: 440,
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
      }),
    },
    {
      id: '07-history-tab',
      description: 'History tab',
      getState: () => ({
        jobs: [baseJob('job-1', '01_intro_neon.blend', 'Completed')],
        queueState: 'idle',
        activeTab: 'history',
        showHistoryModal: false,
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
      }),
    },
    {
      id: '08-sequence-tools-tab',
      description: 'Sequence Tools tab',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', '01_intro_neon.blend', 'Completed'),
            outputPreview: '/renders/cyberpunk_city/Scene_Camera_0001.png',
          },
        ],
        queueState: 'idle',
        activeTab: 'sequences',
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
      }),
    },
    {
      id: '09-settings',
      description: 'Settings',
      getState: () => ({
        jobs: [baseJob('job-1', '01_intro_neon.blend', 'Queued')],
        queueState: 'idle',
        blenders: mockBlenders,
        selectedBlenderId: 'blender-4.2',
        activeTab: 'settings',
        showSettingsModal: false,
        showPreflightModal: false,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showHistoryModal: false,
      }),
    },
    {
      id: '10-pre-flight-dialog',
      description: 'pre-flight dialog',
      getState: () => ({
        jobs: [baseJob('job-1', 'spaceship_exterior.blend', 'Queued')],
        queueState: 'idle',
        showPreflightModal: true,
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showSettingsModal: false,
        showHistoryModal: false,
        preflightReport: {
          timestamp: Date.now(),
          hasErrors: true,
          hasWarnings: true,
          errors: [
            {
              id: 'err-1',
              jobId: 'job-1',
              jobName: 'spaceship_exterior.blend',
              code: 'missing-libraries',
              severity: 'error' as const,
              message: 'Missing linked asset: //assets/hull_textures.blend',
              quickFix: {
                label: 'Relink asset',
                action: 'custom' as const,
              },
            },
          ],
          warnings: [
            {
              id: 'warn-1',
              jobId: 'job-1',
              jobName: 'spaceship_exterior.blend',
              code: 'version-mismatch',
              severity: 'warning' as const,
              message: 'File saved with Blender 4.3, running with 4.2 LTS',
              quickFix: {
                label: 'Select Blender 4.3',
                action: 'custom' as const,
              },
            },
          ],
          jobReports: [
            {
              jobId: 'job-1',
              jobName: 'spaceship_exterior.blend',
              errors: [
                {
                  id: 'err-1',
                  jobId: 'job-1',
                  jobName: 'spaceship_exterior.blend',
                  code: 'missing-libraries',
                  severity: 'error' as const,
                  message: 'Missing linked asset: //assets/hull_textures.blend',
                  quickFix: {
                    label: 'Relink asset',
                    action: 'custom' as const,
                  },
                },
              ],
              warnings: [
                {
                  id: 'warn-1',
                  jobId: 'job-1',
                  jobName: 'spaceship_exterior.blend',
                  code: 'version-mismatch',
                  severity: 'warning' as const,
                  message: 'File saved with Blender 4.3, running with 4.2 LTS',
                  quickFix: {
                    label: 'Select Blender 4.3',
                    action: 'custom' as const,
                  },
                },
              ],
            },
          ],
        },
      }),
    },
    {
      id: '11-resume-after-crash-dialog',
      description: 'resume-after-crash dialog',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', 'animated_fight_scene.blend', 'Queued'),
            completedFrames: 88,
            totalFrames: 250,
          },
        ],
        queueState: 'idle',
        showCrashRestoreBanner: true,
        showPreflightModal: false,
        showPostActionModal: false,
        showSettingsModal: false,
        showHistoryModal: false,
        isRestoredSession: true,
      }),
    },
    {
      id: '12-shutdown-countdown',
      description: 'shutdown countdown',
      getState: () => ({
        jobs: [
          {
            ...baseJob('job-1', 'overnight_heavy_bake.blend', 'Completed'),
            completedFrames: 500,
            totalFrames: 500,
          },
        ],
        queueState: 'idle',
        postAction: 'shutdown' as const,
        postActionArmed: true,
        postActionCountdown: 54,
        showPostActionModal: true,
        showCrashRestoreBanner: false,
        showPreflightModal: false,
        showSettingsModal: false,
        showHistoryModal: false,
      }),
    },
    {
      id: '13-components-showcase',
      description: 'components showcase',
      getState: () => ({
        jobs: [baseJob('job-1', 'cyber_street_hero.blend', 'Queued')],
        queueState: 'idle',
        activeTab: 'components',
        showPostActionModal: false,
        showCrashRestoreBanner: false,
        showPreflightModal: false,
        showSettingsModal: false,
        showHistoryModal: false,
      }),
    },
  ];

  for (const res of RESOLUTIONS) {
    console.log(`\n=== Launching Electron for ${res.width}x${res.height} ===`);
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DISPLAY: process.env.DISPLAY || ':0',
        WINDOW_WIDTH: String(res.width),
        WINDOW_HEIGHT: String(res.height),
      },
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.waitForFunction(
      () => {
        return (
          typeof (window as unknown as { __queueStore?: unknown }).__queueStore !== 'undefined'
        );
      },
      { timeout: 10000 },
    );

    await window.setViewportSize({ width: res.width, height: res.height });
    await window.waitForTimeout(400);

    for (const st of STATES) {
      process.stdout.write(`Capturing [${st.id}] @ ${res.width}x${res.height}... `);
      const stateData = st.getState();

      await window.evaluate((data) => {
        const store = (
          window as unknown as {
            __queueStore?: { setState: (d: unknown) => void };
          }
        ).__queueStore;
        if (store) {
          store.setState(data);
        }
        const tab = (data as { activeTab?: string }).activeTab;
        const winApi = (window as unknown as { rnApi?: { getHistory?: () => Promise<unknown> } })
          .rnApi;
        if (tab === 'history' && winApi) {
          winApi.getHistory = async () => [
            {
              id: 'hist-1',
              jobId: 'job-1',
              fileName: '01_intro_neon.blend',
              filePath: '/projects/vfx/shots/01_intro_neon.blend',
              scene: 'Scene',
              camera: 'Camera',
              frameCount: 250,
              totalTimeSeconds: 1420,
              averageFrameTimeSeconds: 5.68,
              engine: 'CYCLES',
              device: 'GPU · RTX 3080 Ti · OPTIX',
              result: 'completed',
              failedFrames: [],
              outputPath: '/renders/cyberpunk_city/Scene_Camera_0001.png',
              timestamp: Date.now() - 3600000 * 2,
            },
            {
              id: 'hist-2',
              jobId: 'job-2',
              fileName: '02_alleyway_chase.blend',
              filePath: '/projects/vfx/shots/02_alleyway_chase.blend',
              scene: 'Alley',
              camera: 'Camera.Wide',
              frameCount: 180,
              totalTimeSeconds: 2340,
              averageFrameTimeSeconds: 13.0,
              engine: 'CYCLES',
              device: 'GPU · RTX 3080 Ti · OPTIX',
              result: 'completed',
              failedFrames: [],
              outputPath: '/renders/cyberpunk_city/Alley_Camera.Wide_0001.png',
              timestamp: Date.now() - 3600000 * 5,
            },
            {
              id: 'hist-3',
              jobId: 'job-3',
              fileName: 'heavy_fluid_explosion.blend',
              filePath: '/projects/vfx/shots/heavy_fluid_explosion.blend',
              scene: 'Scene',
              camera: 'Camera',
              frameCount: 60,
              totalTimeSeconds: 840,
              averageFrameTimeSeconds: 14.0,
              engine: 'CYCLES',
              device: 'GPU · RTX 3080 Ti · OPTIX',
              result: 'failed',
              failedFrames: [42],
              outputPath: '/renders/fluid/Scene_Camera_0001.png',
              timestamp: Date.now() - 3600000 * 12,
            },
          ];
        }
      }, stateData);

      await window.waitForTimeout(300);

      const filename = `${st.id}-${res.width}x${res.height}.png`;
      const outPath = path.join(SCREENSHOT_DIR, filename);
      await window.screenshot({ path: outPath });
      process.stdout.write('Done\n');
    }

    await app.close();
  }

  console.log('\nAll 36 screenshots captured successfully in docs/screenshots/');
}

run().catch((err) => {
  console.error('Error running ui-shots:', err);
  process.exit(1);
});
