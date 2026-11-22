// Render Night - Realtime Clock-Driven Playback Engine
// SPDX-License-Identifier: GPL-3.0-or-later

use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackMode {
    Realtime,
    EveryFrame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopMode {
    Loop,
    Once,
    PingPong,
}

#[derive(Debug, Clone)]
pub struct PlaybackClock {
    pub start_frame: i32,
    pub end_frame: i32,
    pub current_frame: i32,
    pub fps: f64,
    pub speed_multiplier: f64,
    pub shuttle_speed: i32, // -8, -4, -2, -1, 0, 1, 2, 4, 8
    pub is_playing: bool,
    pub mode: PlaybackMode,
    pub loop_mode: LoopMode,
    pub in_marker: Option<i32>,
    pub out_marker: Option<i32>,

    // Clock state
    t0: Instant,
    anchor_frame: f64,
    pub dropped_frames: u64,
    pub total_presented_frames: u64,
    pub playback_start_frames: u64,
    pub last_frame_time: Instant,
    is_ping_pong_reverse: bool,
}

impl PlaybackClock {
    pub fn new(start_frame: i32, end_frame: i32, fps: f64) -> Self {
        let now = Instant::now();
        Self {
            start_frame,
            end_frame: end_frame.max(start_frame),
            current_frame: start_frame,
            fps: if fps > 0.0 { fps } else { 24.0 },
            speed_multiplier: 1.0,
            shuttle_speed: 1,
            is_playing: false,
            mode: PlaybackMode::Realtime,
            loop_mode: LoopMode::Loop,
            in_marker: None,
            out_marker: None,
            t0: now,
            anchor_frame: start_frame as f64,
            dropped_frames: 0,
            total_presented_frames: 0,
            playback_start_frames: 0,
            last_frame_time: now,
            is_ping_pong_reverse: false,
        }
    }

    pub fn effective_start(&self) -> i32 {
        self.in_marker.unwrap_or(self.start_frame)
    }

    pub fn effective_end(&self) -> i32 {
        self.out_marker.unwrap_or(self.end_frame)
    }

    pub fn play(&mut self) {
        if !self.is_playing {
            self.is_playing = true;
            self.t0 = Instant::now();
            self.anchor_frame = self.current_frame as f64;
            self.playback_start_frames = self.total_presented_frames;
            self.last_frame_time = self.t0;
        }
    }

    pub fn pause(&mut self) {
        if self.is_playing {
            self.is_playing = false;
            self.anchor_frame = self.current_frame as f64;
        }
    }

    pub fn toggle_play(&mut self) {
        if self.is_playing {
            self.pause();
        } else {
            self.play();
        }
    }

    pub fn seek(&mut self, target_frame: i32) {
        let eff_start = self.effective_start();
        let eff_end = self.effective_end();
        let clamped = target_frame.clamp(eff_start, eff_end);
        self.current_frame = clamped;
        self.anchor_frame = clamped as f64;
        self.t0 = Instant::now();
    }

    pub fn step(&mut self, delta: i32) {
        self.pause();
        self.seek(self.current_frame + delta);
    }

    pub fn set_shuttle(&mut self, speed: i32) {
        self.shuttle_speed = speed.clamp(-8, 8);
        if self.shuttle_speed == 0 {
            self.pause();
        } else {
            self.play();
        }
    }

    pub fn shuttle_forward(&mut self) {
        let new_speed = match self.shuttle_speed {
            s if s < 0 => 1,
            0 => 1,
            1 => 2,
            2 => 4,
            4 => 8,
            _ => 8,
        };
        self.set_shuttle(new_speed);
    }

    pub fn shuttle_reverse(&mut self) {
        let new_speed = match self.shuttle_speed {
            s if s > 0 => -1,
            0 => -1,
            -1 => -2,
            -2 => -4,
            -4 => -8,
            _ => -8,
        };
        self.set_shuttle(new_speed);
    }

    /// Advance clock based on monotonic elapsed time.
    /// In Realtime mode, drops frames if wall clock advanced further than 1 frame.
    /// In EveryFrame mode, only advances when caller indicates frame was decoded.
    pub fn update(&mut self, now: Instant, frame_is_ready: bool) -> (i32, bool) {
        if !self.is_playing {
            return (self.current_frame, false);
        }

        let eff_start = self.effective_start();
        let eff_end = self.effective_end();
        let range_len = (eff_end - eff_start + 1).max(1) as f64;

        let effective_speed = self.speed_multiplier * (self.shuttle_speed as f64);

        match self.mode {
            PlaybackMode::Realtime => {
                let elapsed_secs = (now - self.t0).as_secs_f64();
                let delta_frames = elapsed_secs * self.fps * effective_speed;
                let raw_next = self.anchor_frame + delta_frames;

                let next_frame = self.wrap_or_clamp_frame(raw_next, eff_start, eff_end, range_len);
                let frame_changed = next_frame != self.current_frame;

                if frame_changed {
                    let skipped = if self.loop_mode == LoopMode::Loop {
                        if effective_speed >= 0.0 {
                            let delta =
                                (next_frame - self.current_frame).rem_euclid(range_len as i32);
                            if delta > 1 {
                                delta - 1
                            } else {
                                0
                            }
                        } else {
                            let delta =
                                (self.current_frame - next_frame).rem_euclid(range_len as i32);
                            if delta > 1 {
                                delta - 1
                            } else {
                                0
                            }
                        }
                    } else {
                        let delta = (next_frame - self.current_frame).abs();
                        if delta > 1 {
                            delta - 1
                        } else {
                            0
                        }
                    };

                    if skipped > 0 {
                        self.dropped_frames += skipped as u64;
                    }
                    self.total_presented_frames += 1;
                    self.current_frame = next_frame;
                    self.last_frame_time = now;
                }

                (self.current_frame, frame_changed)
            }
            PlaybackMode::EveryFrame => {
                if !frame_is_ready {
                    // Clock pauses until frame decode is finished
                    self.t0 = now;
                    self.anchor_frame = self.current_frame as f64;
                    return (self.current_frame, false);
                }

                let step_dir = if effective_speed >= 0.0 { 1 } else { -1 };
                let raw_next = (self.current_frame + step_dir) as f64;
                let next_frame = self.wrap_or_clamp_frame(raw_next, eff_start, eff_end, range_len);
                let frame_changed = next_frame != self.current_frame;

                if frame_changed {
                    self.total_presented_frames += 1;
                    self.current_frame = next_frame;
                    self.anchor_frame = next_frame as f64;
                    self.t0 = now;
                    self.last_frame_time = now;
                }

                (self.current_frame, frame_changed)
            }
        }
    }

    fn wrap_or_clamp_frame(&mut self, raw: f64, start: i32, end: i32, len: f64) -> i32 {
        match self.loop_mode {
            LoopMode::Loop => {
                let offset = (raw - start as f64).rem_euclid(len);
                start + offset.floor() as i32
            }
            LoopMode::Once => {
                if raw >= end as f64 {
                    self.pause();
                    end
                } else if raw <= start as f64 {
                    self.pause();
                    start
                } else {
                    raw.floor() as i32
                }
            }
            LoopMode::PingPong => {
                if raw >= end as f64 {
                    self.is_ping_pong_reverse = true;
                    self.shuttle_speed = -self.shuttle_speed.abs();
                    self.t0 = Instant::now();
                    self.anchor_frame = end as f64;
                    end
                } else if raw <= start as f64 {
                    self.is_ping_pong_reverse = false;
                    self.shuttle_speed = self.shuttle_speed.abs();
                    self.t0 = Instant::now();
                    self.anchor_frame = start as f64;
                    start
                } else {
                    raw.floor() as i32
                }
            }
        }
    }

    pub fn set_in_marker(&mut self, frame: i32) {
        self.in_marker = Some(frame.clamp(self.start_frame, self.effective_end()));
    }

    pub fn set_out_marker(&mut self, frame: i32) {
        self.out_marker = Some(frame.clamp(self.effective_start(), self.end_frame));
    }

    pub fn clear_markers(&mut self) {
        self.in_marker = None;
        self.out_marker = None;
    }

    pub fn drop_rate_pct(&self) -> f64 {
        let total = self.total_presented_frames + self.dropped_frames;
        if total == 0 {
            0.0
        } else {
            (self.dropped_frames as f64 / total as f64) * 100.0
        }
    }

    pub fn measured_fps(&self) -> f64 {
        let elapsed = (Instant::now() - self.t0).as_secs_f64();
        let presented_since_t0 = self
            .total_presented_frames
            .saturating_sub(self.playback_start_frames);
        if elapsed > 0.05 && presented_since_t0 > 0 {
            presented_since_t0 as f64 / elapsed
        } else {
            self.fps * self.speed_multiplier * (self.shuttle_speed as f64).abs()
        }
    }
}
