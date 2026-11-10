import type { PostAction } from '../core/schemas/queue-state';

export type CliParsedCommand =
  | {
      kind: 'queue';
      queueFile: string;
      blender?: string;
      postAction?: PostAction;
      resume?: boolean;
      preset?: string;
      dryRun?: boolean;
    }
  | {
      kind: 'inspect';
      blendPath: string;
      blender?: string;
    }
  | {
      kind: 'list-blenders';
    }
  | {
      kind: 'help';
    }
  | {
      kind: 'version';
    }
  | {
      kind: 'unknown';
      error: string;
    };

export function parseCliArgs(argv: string[]): CliParsedCommand {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return { kind: 'help' };
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    return { kind: 'version' };
  }

  const first = argv[0];

  if (first === 'list-blenders') {
    return { kind: 'list-blenders' };
  }

  if (first === 'inspect') {
    const blendPath = argv[1];
    if (!blendPath || blendPath.startsWith('-')) {
      return { kind: 'unknown', error: 'Missing path to .blend file for inspect command.' };
    }
    let blender: string | undefined;
    const bIdx = argv.indexOf('--blender');
    if (bIdx !== -1 && argv[bIdx + 1]) {
      blender = argv[bIdx + 1];
    }
    return { kind: 'inspect', blendPath, blender };
  }

  // Check for --queue flag
  const qIdx = argv.indexOf('--queue');
  if (qIdx !== -1) {
    const queueFile = argv[qIdx + 1];
    if (!queueFile || queueFile.startsWith('-')) {
      return { kind: 'unknown', error: 'Missing file path for --queue option.' };
    }

    let blender: string | undefined;
    const bIdx = argv.indexOf('--blender');
    if (bIdx !== -1 && argv[bIdx + 1]) {
      blender = argv[bIdx + 1];
    }

    let postAction: PostAction | undefined;
    const pIdx = argv.indexOf('--post-action');
    if (pIdx !== -1 && argv[pIdx + 1]) {
      postAction = argv[pIdx + 1] as PostAction;
    }

    let preset: string | undefined;
    const prIdx = argv.indexOf('--preset');
    if (prIdx !== -1 && argv[prIdx + 1]) {
      preset = argv[prIdx + 1];
    }

    const resume = argv.includes('--resume');
    const dryRun = argv.includes('--dry-run');

    return {
      kind: 'queue',
      queueFile,
      blender,
      postAction,
      resume,
      preset,
      dryRun,
    };
  }

  return { kind: 'unknown', error: `Unrecognized command or option: ${first}` };
}
