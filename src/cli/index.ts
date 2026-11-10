#!/usr/bin/env node

/**
 * Render Night CLI - Pure Node entry point that consumes src/core only.
 * ZERO Electron imports.
 */
import { discoverAllBlenders } from '../core/blender/discovery';
import { readBlendHeader } from '../core/blender/header-reader';
import { inspectBlend } from '../core/blender/inspector';
import { expandTokens } from '../core/render/token-expander';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'discover': {
      console.log('Discovering installed Blender versions...');
      const blenders = await discoverAllBlenders();
      if (blenders.length === 0) {
        console.log('No Blender installations found.');
      } else {
        console.log(`Found ${blenders.length} Blender installation(s):`);
        for (const b of blenders) {
          console.log(`- Blender ${b.version} (${b.source}): ${b.displayPath}`);
        }
      }
      break;
    }

    case 'header': {
      const blendPath = args[1];
      if (!blendPath) {
        console.error('Usage: render-night header <file.blend>');
        process.exit(1);
      }
      try {
        const header = await readBlendHeader(blendPath);
        console.log(`Blend Header for ${blendPath}:`);
        console.log(`- Version: ${header.version}`);
        console.log(`- Pointer size: ${header.is64Bit ? '64-bit' : '32-bit'}`);
        console.log(`- Endianness: ${header.littleEndian ? 'Little-endian' : 'Big-endian'}`);
      } catch (err) {
        console.error(`Error reading header: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'inspect': {
      const blendPath = args[1];
      if (!blendPath) {
        console.error('Usage: render-night inspect <file.blend> [blenderExecutable]');
        process.exit(1);
      }
      const blenderCmd = args[2] || 'blender';
      console.log(`Inspecting ${blendPath} with ${blenderCmd}...`);
      try {
        const result = await inspectBlend(blendPath, blenderCmd);
        console.log(`Blender version: ${result.blenderVersion}`);
        console.log(`Saved with: ${result.savedWithVersion}`);
        console.log(`Active scene: ${result.activeScene}`);
        console.log(`Scenes (${result.scenes.length}):`);
        for (const s of result.scenes) {
          console.log(
            `  * ${s.name} [frames ${s.frameStart}-${s.frameEnd}, ${s.resolutionX}x${s.resolutionY} @ ${s.fps}fps]`,
          );
          console.log(`    Active Camera: ${s.activeCamera || 'None'}`);
          console.log(`    Cameras: ${s.cameras.join(', ') || 'None'}`);
        }
      } catch (err) {
        console.error(`Inspection failed: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'expand': {
      const template = args[1];
      if (!template) {
        console.error(
          'Usage: render-night expand <template> --project <p> --scene <s> --camera <c> --frame <f>',
        );
        process.exit(1);
      }
      const getArg = (flag: string) => {
        const idx = args.indexOf(flag);
        return idx !== -1 && idx < args.length - 1 ? args[idx + 1] : '';
      };
      const project = getArg('--project') || 'Project';
      const scene = getArg('--scene') || 'Scene';
      const camera = getArg('--camera') || 'Camera';
      const frameStr = getArg('--frame');
      const frame = frameStr ? Number.parseInt(frameStr, 10) : undefined;

      const expanded = expandTokens(template, { project, scene, camera, frame });
      console.log(expanded);
      break;
    }

    case 'help':
    default: {
      console.log(`Render Night CLI (pure Node engine)
Usage:
  render-night discover                     Find installed Blender instances
  render-night header <file.blend>          Read .blend header version bytes
  render-night inspect <file.blend>         Run headless inspection of a .blend file
  render-night expand <template> [options]  Expand output path tokens`);
      break;
    }
  }
}

if (
  process.argv[1]?.endsWith('src/cli/index.ts') ||
  process.argv[1]?.endsWith('src/cli/index.js')
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
