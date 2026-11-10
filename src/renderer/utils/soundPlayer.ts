let audioCtx: AudioContext | null = null;
let cachedBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Synthesizes the exact "to-DUNG" sound:
 * - "to": low thump (~150-110 Hz sine, fast decay)
 * - "dung": rich, resonant, slightly inharmonic bell/wood-block hit (~460 Hz fundamental + 5 partials, ~1s decay)
 * Normalised to -1 dBFS.
 */
function createTodungBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedBuffer) return cachedBuffer;

  const sampleRate = ctx.sampleRate || 44100;
  const duration = 1.25;
  const totalSamples = Math.floor(sampleRate * duration);
  const audioBuffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  // 1. "to" component
  const toDuration = 0.08;
  const toSamples = Math.floor(sampleRate * toDuration);
  for (let i = 0; i < toSamples; i++) {
    const t = i / sampleRate;
    const progress = t / toDuration;
    const freq = 150 - progress * 40;
    const phase = 2 * Math.PI * freq * t;
    const attack = Math.min(1.0, t / 0.003);
    const decay = Math.exp(-t / 0.022);
    channelData[i] += Math.sin(phase) * attack * decay * 0.9;
  }

  // 2. "dung" component
  const dungStartSample = Math.floor(sampleRate * 0.055);
  const partials = [
    { ratio: 1.0, amp: 1.0, decayTau: 0.35 },
    { ratio: 1.58, amp: 0.65, decayTau: 0.28 },
    { ratio: 2.24, amp: 0.45, decayTau: 0.22 },
    { ratio: 2.85, amp: 0.3, decayTau: 0.16 },
    { ratio: 3.76, amp: 0.2, decayTau: 0.12 },
    { ratio: 5.12, amp: 0.12, decayTau: 0.08 },
  ];
  const f0 = 460;

  for (let i = dungStartSample; i < totalSamples; i++) {
    const t = (i - dungStartSample) / sampleRate;
    const attack = Math.min(1.0, t / 0.002);
    let sampleVal = 0;
    for (const p of partials) {
      const freq = f0 * p.ratio;
      const phase = 2 * Math.PI * freq * t;
      const decay = Math.exp(-t / p.decayTau);
      sampleVal += Math.sin(phase) * p.amp * decay;
    }
    const saturated = Math.tanh(sampleVal * 1.2);
    channelData[i] += attack * saturated;
  }

  // 3. Normalization to -1 dBFS (~0.89125)
  const targetPeak = Math.pow(10, -1.0 / 20);
  let maxAbs = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const normFactor = maxAbs > 0 ? targetPeak / maxAbs : 1.0;
  for (let i = 0; i < totalSamples; i++) {
    channelData[i] = Math.max(-1.0, Math.min(1.0, channelData[i] * normFactor));
  }

  cachedBuffer = audioBuffer;
  return audioBuffer;
}

export function playTodungSound(volume = 1.0, isMuted = false): void {
  if (isMuted || volume <= 0) return;

  try {
    const ctx = getAudioContext();
    const buffer = createTodungBuffer(ctx);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(Math.min(1.0, Math.max(0.0, volume)), ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
  } catch (err) {
    console.error('Failed to play finish sound:', err);
  }
}
