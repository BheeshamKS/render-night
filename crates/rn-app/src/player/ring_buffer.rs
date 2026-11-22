// Render Night - Read-Ahead Ring Buffer & Priority Frame Queue
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub struct ReadAheadConfig {
    pub read_ahead_seconds: f64,
    pub max_in_flight: usize,
}

impl Default for ReadAheadConfig {
    fn default() -> Self {
        Self {
            read_ahead_seconds: 2.0, // 2 seconds adaptive read-ahead
            max_in_flight: 8,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ReadAheadRingBuffer {
    config: ReadAheadConfig,
    pending_queue: VecDeque<i32>,
    in_flight: Vec<i32>,
    last_requested_playhead: i32,
    last_direction_forward: bool,
}

impl ReadAheadRingBuffer {
    pub fn new(config: ReadAheadConfig) -> Self {
        Self {
            config,
            pending_queue: VecDeque::new(),
            in_flight: Vec::new(),
            last_requested_playhead: -1,
            last_direction_forward: true,
        }
    }

    /// Update priority queue based on current playhead, speed direction, and FPS
    #[allow(clippy::too_many_arguments)]
    pub fn update_priority(
        &mut self,
        current_frame: i32,
        start_frame: i32,
        end_frame: i32,
        fps: f64,
        is_playing: bool,
        is_forward: bool,
        cached_frames: &[i32],
    ) {
        // If playhead jumped significantly (> 2 frames from expected), cancel stale queue
        let expected_next = if self.last_direction_forward {
            self.last_requested_playhead + 1
        } else {
            self.last_requested_playhead - 1
        };

        if (current_frame - expected_next).abs() > 2 {
            self.cancel_stale();
        }

        self.last_requested_playhead = current_frame;
        self.last_direction_forward = is_forward;

        let frame_count = (self.config.read_ahead_seconds * fps).ceil().max(24.0) as i32;
        let mut new_targets = Vec::new();

        if is_playing {
            // Forward or reverse linear read-ahead
            let step = if is_forward { 1 } else { -1 };
            for i in 1..=frame_count {
                let target = current_frame + i * step;
                if target >= start_frame
                    && target <= end_frame
                    && !cached_frames.contains(&target)
                    && !self.in_flight.contains(&target)
                {
                    new_targets.push(target);
                }
            }
        } else {
            // Scrubbing / Paused: Nearest-neighbor outward spiral
            for dist in 0..=frame_count {
                let f_next = current_frame + dist;
                let f_prev = current_frame - dist;

                if f_next <= end_frame
                    && !cached_frames.contains(&f_next)
                    && !self.in_flight.contains(&f_next)
                    && !new_targets.contains(&f_next)
                {
                    new_targets.push(f_next);
                }
                if f_prev >= start_frame
                    && !cached_frames.contains(&f_prev)
                    && !self.in_flight.contains(&f_prev)
                    && !new_targets.contains(&f_prev)
                {
                    new_targets.push(f_prev);
                }
            }
        }

        self.pending_queue = new_targets.into();
    }

    /// Get next frame to decode off-thread
    pub fn pop_next_to_decode(&mut self) -> Option<i32> {
        if self.in_flight.len() >= self.config.max_in_flight {
            return None;
        }

        if let Some(frame) = self.pending_queue.pop_front() {
            self.in_flight.push(frame);
            Some(frame)
        } else {
            None
        }
    }

    /// Mark frame decode completed
    pub fn mark_completed(&mut self, frame: i32) {
        if let Some(pos) = self.in_flight.iter().position(|&f| f == frame) {
            self.in_flight.remove(pos);
        }
    }

    /// Cancel all pending and stale decodes on playhead jumps
    pub fn cancel_stale(&mut self) {
        self.pending_queue.clear();
        self.in_flight.clear();
    }

    pub fn queue_len(&self) -> usize {
        self.pending_queue.len()
    }

    pub fn in_flight_len(&self) -> usize {
        self.in_flight.len()
    }
}
