#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);

// 1. Version request
if (args.includes('--version')) {
  console.log(`Blender 4.2.0 LTS (sub 0)
    build date: 2024-07-16
    build time: 06:19:15
    build commit date: 2024-07-16
    build commit time: 06:19
    build hash: a51f305417fb
    build platform: Linux`);
  process.exit(0);
}

// 2. Headless inspect request: -b <file> ... -P <script> -- <out.json>
const dashDashIdx = args.indexOf('--');
if (dashDashIdx !== -1 && dashDashIdx < args.length - 1) {
  const outFile = args[dashDashIdx + 1];
  const bIdx = args.indexOf('-b');
  const blendFile = bIdx !== -1 ? args[bIdx + 1] : 'test.blend';

  if (blendFile.includes('fail') || blendFile.includes('corrupt')) {
    console.error('Fra:1\nError: Blender cannot read corrupted blend file!');
    process.exit(1);
  }

  // Load fixture inspect JSON
  const fixturePath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../tests/fixtures/inspect-sample.json'
  );
  let fixtureData = {};
  if (fs.existsSync(fixturePath)) {
    fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }
  fixtureData.blendPath = blendFile;

  fs.writeFileSync(outFile, JSON.stringify(fixtureData, null, 2), 'utf8');
  console.log(`Blender quit`);
  process.exit(0);
}

console.log('Mock Blender: unrecognized arguments', args);
process.exit(0);
