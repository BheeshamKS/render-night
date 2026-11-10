import { parseCliArgs } from '../src/cli/args';

import { describe, expect, it } from 'vitest';

describe('CLI Args Parser', () => {
  it('parses --queue flags and optional parameters', () => {
    const cmd = parseCliArgs([
      '--queue',
      'queue.json',
      '--blender',
      '4.2',
      '--post-action',
      'shutdown',
      '--dry-run',
      '--resume',
      '--preset',
      'Draft',
    ]);
    expect(cmd.kind).toBe('queue');
    if (cmd.kind === 'queue') {
      expect(cmd.queueFile).toBe('queue.json');
      expect(cmd.blender).toBe('4.2');
      expect(cmd.postAction).toBe('shutdown');
      expect(cmd.dryRun).toBe(true);
      expect(cmd.resume).toBe(true);
      expect(cmd.preset).toBe('Draft');
    }
  });

  it('parses inspect command and its optional blender flag', () => {
    const cmd1 = parseCliArgs(['inspect', 'sample.blend']);
    expect(cmd1.kind).toBe('inspect');
    if (cmd1.kind === 'inspect') {
      expect(cmd1.blendPath).toBe('sample.blend');
      expect(cmd1.blender).toBeUndefined();
    }

    const cmd2 = parseCliArgs(['inspect', 'sample.blend', '--blender', 'latest']);
    expect(cmd2.kind).toBe('inspect');
    if (cmd2.kind === 'inspect') {
      expect(cmd2.blendPath).toBe('sample.blend');
      expect(cmd2.blender).toBe('latest');
    }
  });

  it('parses list-blenders command', () => {
    const cmd = parseCliArgs(['list-blenders']);
    expect(cmd.kind).toBe('list-blenders');
  });

  it('parses help and version flags', () => {
    expect(parseCliArgs(['--help']).kind).toBe('help');
    expect(parseCliArgs(['-h']).kind).toBe('help');
    expect(parseCliArgs([]).kind).toBe('help');
    expect(parseCliArgs(['--version']).kind).toBe('version');
    expect(parseCliArgs(['-v']).kind).toBe('version');
  });

  it('rejects unknown commands with kind unknown', () => {
    const cmd = parseCliArgs(['unknown-command']);
    expect(cmd.kind).toBe('unknown');
  });
});
