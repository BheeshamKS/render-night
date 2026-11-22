// Render Night - LRU Frame RAM Cache with Memory Budget
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct DecodedFrame {
    pub frame: i32,
    pub width: u32,
    pub height: u32,
    pub rgba: Arc<Vec<u8>>,
    pub byte_size: usize,
    pub is_proxy: bool,
    pub decode_duration_ms: f64,
}

impl DecodedFrame {
    pub fn new(
        frame: i32,
        width: u32,
        height: u32,
        rgba: Vec<u8>,
        is_proxy: bool,
        decode_duration_ms: f64,
    ) -> Self {
        let byte_size = rgba.len();
        Self {
            frame,
            width,
            height,
            rgba: Arc::new(rgba),
            byte_size,
            is_proxy,
            decode_duration_ms,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FrameCache {
    frames: HashMap<i32, DecodedFrame>,
    lru_order: VecDeque<i32>,
    budget_bytes: usize,
    current_bytes: usize,
    pub hits: u64,
    pub misses: u64,
    total_decode_time_ms: f64,
    total_decoded_count: u64,
}

impl FrameCache {
    pub fn new(budget_bytes: usize) -> Self {
        Self {
            frames: HashMap::new(),
            lru_order: VecDeque::new(),
            budget_bytes: budget_bytes.max(1024),
            current_bytes: 0,
            hits: 0,
            misses: 0,
            total_decode_time_ms: 0.0,
            total_decoded_count: 0,
        }
    }

    pub fn default_budget() -> usize {
        // Default 4 GB RAM budget
        4 * 1024 * 1024 * 1024
    }

    pub fn contains(&self, frame: i32) -> bool {
        self.frames.contains_key(&frame)
    }

    pub fn get(&mut self, frame: i32) -> Option<DecodedFrame> {
        if let Some(decoded) = self.frames.get(&frame).cloned() {
            self.hits += 1;
            // Move to back of LRU queue (most recently used)
            if let Some(pos) = self.lru_order.iter().position(|&f| f == frame) {
                self.lru_order.remove(pos);
            }
            self.lru_order.push_back(frame);
            Some(decoded)
        } else {
            self.misses += 1;
            None
        }
    }

    pub fn insert(&mut self, decoded: DecodedFrame) {
        let frame_num = decoded.frame;
        let bytes = decoded.byte_size;

        self.total_decode_time_ms += decoded.decode_duration_ms;
        self.total_decoded_count += 1;

        // If replacing existing frame
        if let Some(old) = self.frames.remove(&frame_num) {
            self.current_bytes = self.current_bytes.saturating_sub(old.byte_size);
            if let Some(pos) = self.lru_order.iter().position(|&f| f == frame_num) {
                self.lru_order.remove(pos);
            }
        }

        // Evict until within budget
        while self.current_bytes + bytes > self.budget_bytes && !self.lru_order.is_empty() {
            if let Some(evict_frame) = self.lru_order.pop_front() {
                if let Some(evicted) = self.frames.remove(&evict_frame) {
                    self.current_bytes = self.current_bytes.saturating_sub(evicted.byte_size);
                }
            }
        }

        self.current_bytes += bytes;
        self.frames.insert(frame_num, decoded);
        self.lru_order.push_back(frame_num);
    }

    pub fn clear(&mut self) {
        self.frames.clear();
        self.lru_order.clear();
        self.current_bytes = 0;
    }

    pub fn set_budget_bytes(&mut self, budget: usize) {
        self.budget_bytes = budget.max(1024);
        while self.current_bytes > self.budget_bytes && !self.lru_order.is_empty() {
            if let Some(evict_frame) = self.lru_order.pop_front() {
                if let Some(evicted) = self.frames.remove(&evict_frame) {
                    self.current_bytes = self.current_bytes.saturating_sub(evicted.byte_size);
                }
            }
        }
    }

    pub fn cached_frames(&self) -> Vec<i32> {
        let mut keys: Vec<i32> = self.frames.keys().copied().collect();
        keys.sort_unstable();
        keys
    }

    pub fn current_usage_mb(&self) -> f64 {
        self.current_bytes as f64 / (1024.0 * 1024.0)
    }

    pub fn budget_mb(&self) -> f64 {
        self.budget_bytes as f64 / (1024.0 * 1024.0)
    }

    pub fn hit_rate_pct(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            (self.hits as f64 / total as f64) * 100.0
        }
    }

    pub fn average_decode_ms(&self) -> f64 {
        if self.total_decoded_count == 0 {
            0.0
        } else {
            self.total_decode_time_ms / self.total_decoded_count as f64
        }
    }
}
