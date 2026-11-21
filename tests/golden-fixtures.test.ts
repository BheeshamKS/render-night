import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseCustomRange,
  RangeParseError,
  resolveFrameRange,
  validateRangeForFormat,
} from '../src/core/ranges/frame-range';
import { expandTokens, previewTokens } from '../src/core/render/token-expander';
import { parseStdoutLine, StdoutParseError } from '../src/core/render/stdout-parser';
import { inspectOutputSchema } from '../src/core/schemas/inspect';
import { queueStateSchema } from '../src/core/schemas/queue-state';
import { runnerPayloadSchema } from '../src/core/schemas/override';
import { historyEntrySchema } from '../src/core/schemas/history';

describe('Golden Fixtures Validation', () => {
  const goldenDir = path.resolve(__dirname, 'golden');

  describe('range_parser_cases.json', () => {
    const fixturePath = path.join(goldenDir, 'range_parser_cases.json');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    it('validates all valid_cases', () => {
      for (const tc of data.valid_cases) {
        const frames = parseCustomRange(tc.input);
        expect(frames.length).toBe(tc.expected_count);
        expect(frames[0]).toBe(tc.expected_first);
        expect(frames[frames.length - 1]).toBe(tc.expected_last);
        if (tc.expected_frames) {
          expect(frames).toEqual(tc.expected_frames);
        }
        if (tc.must_include) {
          for (const f of tc.must_include) {
            expect(frames).toContain(f);
          }
        }
        if (tc.must_not_include) {
          for (const f of tc.must_not_include) {
            expect(frames).not.toContain(f);
          }
        }
      }
    });

    it('validates all invalid_cases', () => {
      for (const tc of data.invalid_cases) {
        expect(() => parseCustomRange(tc.input)).toThrow(RangeParseError);
      }
    });

    it('validates mode_resolution_cases', () => {
      for (const tc of data.mode_resolution_cases) {
        const res = resolveFrameRange(
          tc.config,
          tc.scene_defaults,
        );
        expect(res.isContinuous).toBe(tc.expected_is_continuous);
        expect(res.frames.length).toBe(tc.expected_total_count);
        if (tc.expected_frames) {
          expect(res.frames).toEqual(tc.expected_frames);
        }
      }
    });

    it('validates video_validation_cases', () => {
      for (const tc of data.video_validation_cases) {
        const rangeObj = {
          frames: tc.frames,
          isContinuous: tc.is_continuous,
          totalCount: tc.total_count,
        };
        const res = validateRangeForFormat(rangeObj as any, tc.format);
        expect(res.valid).toBe(tc.expected_valid);
        if (!tc.expected_valid && tc.expected_error) {
          expect(res.reason).toContain(tc.expected_error);
        }
      }
    });
  });

  describe('token_expander_cases.json', () => {
    const fixturePath = path.join(goldenDir, 'token_expander_cases.json');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    it('validates all token expansion cases', () => {
      for (const tc of data.cases) {
        const result = tc.is_preview
          ? previewTokens(tc.template, tc.context)
          : expandTokens(tc.template, tc.context);
        expect(result).toBe(tc.expected);
      }
    });
  });

  describe('stdout_samples.json', () => {
    const fixturePath = path.join(goldenDir, 'stdout_samples.json');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    it('validates single line samples', () => {
      for (const tc of data.single_line_samples) {
        if (tc.expected_is_error) {
          expect(() => parseStdoutLine(tc.line)).toThrow(StdoutParseError);
        } else {
          const res = parseStdoutLine(tc.line);
          expect(res.kind).toBe(tc.expected_kind);
          if (tc.expected_progress) {
            expect(res.progress).toEqual(tc.expected_progress);
          }
          if (tc.expected_saved_path) {
            expect(res.savedPath).toBe(tc.expected_saved_path);
          }
          if (tc.expected_event) {
            expect(res.event).toEqual(tc.expected_event);
          }
        }
      }
    });

    it('parses multi-line stream lines without error', () => {
      for (const stream of data.multi_line_stream_samples) {
        for (const line of stream.lines) {
          expect(() => parseStdoutLine(line)).not.toThrow();
        }
      }
    });
  });

  describe('legacy_queue_state.json', () => {
    const fixturePath = path.join(goldenDir, 'legacy_queue_state.json');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    it('validates queue_state_v1 schema', () => {
      expect(() => queueStateSchema.parse(data.queue_state_v1)).not.toThrow();
    });

    it('has legacy_v0_unmigrated with version 0', () => {
      expect(data.legacy_v0_unmigrated.version).toBe(0);
      expect(data.legacy_v0_unmigrated.jobs.length).toBe(1);
    });

    it('has minimal_cli_queue with required fields', () => {
      expect(data.minimal_cli_queue.jobs.length).toBe(1);
      expect(data.minimal_cli_queue.jobs[0].blendPath).toBe('/renders/scene.blend');
    });

    it('has session_lock with pid and workerPids', () => {
      expect(data.session_lock.pid).toBe(12345);
      expect(data.session_lock.workerPids).toEqual([12346, 12347]);
    });
  });

  describe('schema_fixtures.json', () => {
    const fixturePath = path.join(goldenDir, 'schema_fixtures.json');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    it('validates inspect_output_sample against schema', () => {
      expect(() => inspectOutputSchema.parse(data.inspect_output_sample)).not.toThrow();
    });

    it('validates runner_payload_fixture against schema', () => {
      expect(() => runnerPayloadSchema.parse(data.runner_payload_fixture)).not.toThrow();
    });

    it('validates history_entry_fixture against schema', () => {
      expect(() => historyEntrySchema.parse(data.history_entry_fixture)).not.toThrow();
    });

    it('contains override_diff_fixtures and preset_fixture', () => {
      expect(data.override_diff_fixtures.cycles_samples_diff['scene.cycles.samples']).toBe(256);
      expect(data.preset_fixture.name).toBe('1080p / 256 samples / PNG 16-bit');
    });
  });
});
