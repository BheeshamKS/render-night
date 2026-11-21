// Render Night - Sound Module
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod sound_player;

pub use sound_player::{
    synthesize_todung_samples, SoundPlayer, DURATION_SECS, SAMPLE_RATE, TARGET_DBFS,
};
