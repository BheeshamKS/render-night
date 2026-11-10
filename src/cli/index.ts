#!/usr/bin/env node

/**
 * Render Night CLI - Pure Node entry point that consumes src/core only.
 * ZERO Electron imports.
 */
import { discoverAllBlenders } from '../core/blender/discovery';
import { inspectBlend } from '../core/blender/inspector';
import { parseCliArgs } from './args';
import { resolveBlenderForCli } from './blender-resolver';
import { runCliQueue } from './runner';

import * as fs from 'node:fs';

const VERSION = '0.1.0-alpha.1';

function printHelp(): void {
  console.log(`Night Render CLI v${VERSION}
A fast local render queue for Blender.

Usage:
  night-render --queue <file.json> [options]
  night-render inspect <file.blend> [--blender <path|version|latest>]
  night-render list-blenders

Options:
  --queue <path>             Path to queue.json definition file
  --blender <spec>           Blender executable path, version (e.g. 4.2), or 'latest'
  --post-action <action>     Action after queue completes: none, sleep, hibernate, shutdown, restart, close_app
  --resume                   Resume queue from missing frames only
  --preset <name>            Apply a preset to all jobs
  --dry-run                  Run pre-flight checks and preview queue without rendering
  --help, -h                 Show help
  --version, -v              Show version
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cmd = parseCliArgs(argv);

  switch (cmd.kind) {
    case 'help': {
      printHelp();
      process.exit(0);
      break;
    }

    case 'version': {
      console.log(`Night Render v${VERSION}`);
      process.exit(0);
      break;
    }

    case 'list-blenders': {
      const blenders = await discoverAllBlenders();
      if (blenders.length === 0) {
        console.log('No Blender installations found on system.');
      } else {
        console.log(`Discovered ${blenders.length} Blender installation(s):`);
        for (const b of blenders) {
          console.log(`- Blender ${b.version} (${b.source}): ${b.displayPath}`);
        }
      }
      process.exit(0);
      break;
    }

    case 'inspect': {
      if (!fs.existsSync(cmd.blendPath)) {
        console.error(`Error: File not found: ${cmd.blendPath}`);
        process.exit(2);
      }
      try {
        const resolvedBlender = await resolveBlenderForCli(cmd.blender);
        const result = await inspectBlend(cmd.blendPath, resolvedBlender.executable);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } catch (err: unknown) {
        console.error(`Inspection error: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'queue': {
      const result = await runCliQueue({
        queueFile: cmd.queueFile,
        blender: cmd.blender,
        postAction: cmd.postAction,
        resume: cmd.resume,
        preset: cmd.preset,
        dryRun: cmd.dryRun,
      });
      process.exit(result.exitCode);
      break;
    }

    case 'unknown': {
      console.error(`Error: ${cmd.error}`);
      console.error('Run "night-render --help" for usage information.');
      process.exit(2);
      break;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`Unexpected CLI error: ${(err as Error).message}`);
  process.exit(1);
});
