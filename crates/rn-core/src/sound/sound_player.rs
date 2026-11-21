// Render Night - Deterministic Audio Synthesis & Sound Player
// SPDX-License-Identifier: GPL-3.0-or-later

use rodio::buffer::SamplesBuffer;
use rodio::{OutputStream, Sink};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use tracing::{debug, error, info};

pub const SAMPLE_RATE: u32 = 44100;
pub const DURATION_SECS: f32 = 1.2;
pub const TARGET_DBFS: f32 = -1.0; // -1 dBFS peak

/// Generates the deterministic "to-DUNG" PCM sample buffer.
/// - Component 1 ("to"): Low thump ~135 Hz with fast exponential decay.
/// - Component 2 ("DUNG"): Resonant inharmonic bell/wood-block hit ~440 Hz + inharmonic overtones with ~1s decay.
/// - Normalized to exactly -1 dBFS (~0.891 amplitude).
pub fn synthesize_todung_samples() -> Vec<f32> {
    let total_samples = (SAMPLE_RATE as f32 * DURATION_SECS) as usize;
    let mut raw_samples = Vec::with_capacity(total_samples);

    let t2_start = 0.075; // 75 ms offset for the "DUNG" hit

    for i in 0..total_samples {
        let t = i as f32 / SAMPLE_RATE as f32;

        // Component 1: "to" thump (135 Hz, fast decay ~0.04s)
        let s1 = if t < 0.25 {
            let env1 = (-t / 0.04).exp();
            (2.0 * PI * 135.0 * t).sin() * env1
        } else {
            0.0
        };

        // Component 2: "DUNG" bell/wood hit (440 Hz + inharmonics 616 Hz, 1056 Hz, decay ~0.8s)
        let s2 = if t >= t2_start {
            let tau = t - t2_start;
            let attack = (1.0 - (-tau / 0.005).exp()).max(0.0);
            let decay = 0.65 * (-tau / 0.25).exp() + 0.35 * (-tau / 0.85).exp();
            let env2 = attack * decay;

            let fundamental = (2.0 * PI * 440.0 * tau).sin();
            let partial1 = 0.42 * (2.0 * PI * 616.0 * tau).sin();
            let partial2 = 0.18 * (2.0 * PI * 1056.0 * tau).sin();

            (fundamental + partial1 + partial2) * env2
        } else {
            0.0
        };

        raw_samples.push(s1 + s2);
    }

    // Normalization to -1 dBFS
    let peak = raw_samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    let target_amp = 10.0f32.powf(TARGET_DBFS / 20.0); // ~0.89125

    if peak > 0.0 {
        let scale = target_amp / peak;
        for s in &mut raw_samples {
            *s *= scale;
        }
    }

    raw_samples
}

pub struct SoundPlayer {
    enabled: Arc<AtomicBool>,
    volume: Arc<AtomicU32>, // 0-100
    cached_samples: Arc<Vec<f32>>,
}

impl Default for SoundPlayer {
    fn default() -> Self {
        Self::new(true, 100)
    }
}

impl SoundPlayer {
    pub fn new(enabled: bool, volume: u32) -> Self {
        let samples = synthesize_todung_samples();
        Self {
            enabled: Arc::new(AtomicBool::new(enabled)),
            volume: Arc::new(AtomicU32::new(volume.min(100))),
            cached_samples: Arc::new(samples),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn set_volume(&self, volume: u32) {
        self.volume.store(volume.min(100), Ordering::SeqCst);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    pub fn volume(&self) -> u32 {
        self.volume.load(Ordering::SeqCst)
    }

    /// Plays the finish sound asynchronously (works in background / headless window).
    pub fn play_finish_sound(&self) {
        if !self.enabled.load(Ordering::SeqCst) {
            debug!("Sound playback skipped: sound is disabled");
            return;
        }

        let vol_percent = self.volume.load(Ordering::SeqCst);
        if vol_percent == 0 {
            return;
        }

        let samples = self.cached_samples.clone();
        let volume_factor = vol_percent as f32 / 100.0;

        thread::Builder::new()
            .name("rn-sound-player".to_string())
            .spawn(move || {
                match OutputStream::try_default() {
                    Ok((_stream, stream_handle)) => match Sink::try_new(&stream_handle) {
                        Ok(sink) => {
                            sink.set_volume(volume_factor);
                            let buffer = SamplesBuffer::new(1, SAMPLE_RATE, (*samples).clone());
                            sink.append(buffer);
                            sink.sleep_until_end();
                            debug!("Finish sound playback completed");
                        }
                        Err(e) => {
                            error!("Failed to create audio sink: {}", e);
                        }
                    },
                    Err(e) => {
                        // In some headless environments (CI without soundcard), audio is unavailable
                        info!("Audio output device unavailable: {}", e);
                    }
                }
            })
            .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synthesize_todung_normalization_and_duration() {
        let samples = synthesize_todung_samples();
        let expected_len = (SAMPLE_RATE as f32 * DURATION_SECS) as usize;
        assert_eq!(samples.len(), expected_len);

        let peak = samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
        let target_amp = 10.0f32.powf(TARGET_DBFS / 20.0);
        // Assert peak amplitude matches -1 dBFS within float precision
        assert!(
            (peak - target_amp).abs() < 1e-4,
            "Peak {} != target {}",
            peak,
            target_amp
        );
    }

    #[test]
    fn test_sound_player_config() {
        let player = SoundPlayer::new(true, 80);
        assert!(player.is_enabled());
        assert_eq!(player.volume(), 80);

        player.set_volume(50);
        assert_eq!(player.volume(), 50);

        player.set_enabled(false);
        assert!(!player.is_enabled());
    }
}
