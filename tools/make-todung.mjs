#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

// Output target
const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../resources/sounds');
const outFile = path.join(outDir, 'todung.wav');

fs.mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 1.25;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SECONDS);

const buffer = new Float64Array(TOTAL_SAMPLES);

// 1. "to" component:
// Starts at t = 0s, lasts ~0.08s
// Low sine pitch glide: 150 Hz -> 110 Hz
// Fast decay envelope (tau ~ 0.02s)
const TO_DURATION = 0.08;
const TO_SAMPLES = Math.floor(SAMPLE_RATE * TO_DURATION);
for (let i = 0; i < TO_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  const progress = t / TO_DURATION;
  const freq = 150 - progress * 40; // 150 Hz -> 110 Hz
  const phase = 2 * Math.PI * freq * t;
  const attack = Math.min(1.0, t / 0.003); // 3ms attack
  const decay = Math.exp(-t / 0.022); // fast decay
  const amp = attack * decay * 0.9;
  buffer[i] += Math.sin(phase) * amp;
}

// 2. "dung" component:
// Starts at t = 0.055s (subtle seamless cross-fade with the tail of "to")
// Resonant, slightly inharmonic struck bell / wood-block hit
// Fundamental ~460 Hz + inharmonic overtones
const DUNG_START_TIME = 0.055;
const DUNG_START_SAMPLE = Math.floor(SAMPLE_RATE * DUNG_START_TIME);
const partials = [
  { ratio: 1.0, amp: 1.0, decayTau: 0.35 }, // fundamental (460 Hz)
  { ratio: 1.58, amp: 0.65, decayTau: 0.28 }, // resonant second
  { ratio: 2.24, amp: 0.45, decayTau: 0.22 }, // bell inharmonic
  { ratio: 2.85, amp: 0.3, decayTau: 0.16 }, // strike overtone
  { ratio: 3.76, amp: 0.2, decayTau: 0.12 }, // upper ring
  { ratio: 5.12, amp: 0.12, decayTau: 0.08 }, // transient ping
];

const F0 = 460; // ~460 Hz fundamental

for (let i = DUNG_START_SAMPLE; i < TOTAL_SAMPLES; i++) {
  const t = (i - DUNG_START_SAMPLE) / SAMPLE_RATE;
  const attack = Math.min(1.0, t / 0.002); // 2ms crisp strike attack

  let sampleVal = 0;
  for (const p of partials) {
    const freq = F0 * p.ratio;
    const phase = 2 * Math.PI * freq * t;
    const decay = Math.exp(-t / p.decayTau);
    sampleVal += Math.sin(phase) * p.amp * decay;
  }

  // Slight saturation/warmth
  const saturated = Math.tanh(sampleVal * 1.2);
  buffer[i] += attack * saturated;
}

// 3. Normalization to -1 dBFS
// -1 dBFS = 10^(-1/20) = ~0.89125
const TARGET_PEAK_DB = -1.0;
const TARGET_PEAK_AMPLITUDE = Math.pow(10, TARGET_PEAK_DB / 20); // ~0.89125

let maxAbs = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const abs = Math.abs(buffer[i]);
  if (abs > maxAbs) maxAbs = abs;
}

const normFactor = maxAbs > 0 ? TARGET_PEAK_AMPLITUDE / maxAbs : 1.0;

// 4. Encode to 16-bit PCM WAV
const numChannels = 1;
const bytesPerSample = 2;
const blockAlign = numChannels * bytesPerSample;
const byteRate = SAMPLE_RATE * blockAlign;
const dataSize = TOTAL_SAMPLES * blockAlign;
const headerSize = 44;
const totalSize = headerSize + dataSize;

const wavBuffer = Buffer.alloc(totalSize);

// RIFF chunk descriptor
wavBuffer.write('RIFF', 0);
wavBuffer.writeUInt32LE(totalSize - 8, 4);
wavBuffer.write('WAVE', 8);

// "fmt " sub-chunk
wavBuffer.write('fmt ', 12);
wavBuffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
wavBuffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
wavBuffer.writeUInt16LE(numChannels, 22);
wavBuffer.writeUInt32LE(SAMPLE_RATE, 24);
wavBuffer.writeUInt32LE(byteRate, 28);
wavBuffer.writeUInt16LE(blockAlign, 32);
wavBuffer.writeUInt16LE(bytesPerSample * 8, 34); // bits per sample (16)

// "data" sub-chunk
wavBuffer.write('data', 36);
wavBuffer.writeUInt32LE(dataSize, 40);

// Write 16-bit PCM samples
let offset = 44;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const normalized = buffer[i] * normFactor;
  const clamped = Math.max(-1.0, Math.min(1.0, normalized));
  const intVal = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  wavBuffer.writeInt16LE(intVal, offset);
  offset += 2;
}

fs.writeFileSync(outFile, wavBuffer);
console.log(
  `Generated todung.wav: ${outFile} (${wavBuffer.length} bytes, duration: ${DURATION_SECONDS}s, peak: ${TARGET_PEAK_DB} dBFS)`,
);
