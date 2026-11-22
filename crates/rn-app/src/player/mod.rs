// Render Night - Realtime Sequence Player Subsystem
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod clock;
pub mod decoder;
pub mod lru_cache;
pub mod proxy;
pub mod ring_buffer;
pub mod watcher;

use std::path::{Path, PathBuf};
use std::result::Result as StdResult;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use clock::PlaybackClock;
use decoder::FrameDecoder;
use lru_cache::{DecodedFrame, FrameCache};
use proxy::ProxyManager;
use ring_buffer::{ReadAheadConfig, ReadAheadRingBuffer};
use watcher::SequenceWatcher;

#[derive(Debug, Clone)]
pub struct DecodeRequest {
    pub epoch: u64,
    pub frame: i32,
    pub path: PathBuf,
    pub target_dimensions: Option<(u32, u32)>,
}

pub type DecodeResult = (u64, StdResult<DecodedFrame, String>);
pub type DecodeResultReceiver = Arc<Mutex<std::sync::mpsc::Receiver<DecodeResult>>>;

pub struct DecodePool {
    task_tx: std::sync::mpsc::Sender<DecodeRequest>,
    result_rx: DecodeResultReceiver,
    pub epoch: Arc<AtomicU64>,
}

impl std::fmt::Debug for DecodePool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DecodePool")
            .field("epoch", &self.epoch.load(Ordering::Relaxed))
            .finish()
    }
}

impl Clone for DecodePool {
    fn clone(&self) -> Self {
        Self {
            task_tx: self.task_tx.clone(),
            result_rx: Arc::clone(&self.result_rx),
            epoch: Arc::clone(&self.epoch),
        }
    }
}

impl DecodePool {
    pub fn new(num_workers: usize) -> Self {
        let (task_tx, task_rx) = std::sync::mpsc::channel::<DecodeRequest>();
        let (result_tx, result_rx) =
            std::sync::mpsc::channel::<(u64, StdResult<DecodedFrame, String>)>();

        let task_rx = Arc::new(Mutex::new(task_rx));
        let epoch = Arc::new(AtomicU64::new(1));

        let workers = num_workers.max(1);
        for i in 0..workers {
            let task_rx = Arc::clone(&task_rx);
            let result_tx = result_tx.clone();
            let epoch = Arc::clone(&epoch);

            let _ = std::thread::Builder::new()
                .name(format!("rn-decoder-{}", i))
                .spawn(move || {
                    loop {
                        let req = {
                            let lock = task_rx.lock().unwrap();
                            match lock.recv() {
                                Ok(req) => req,
                                Err(_) => break, // Channel closed
                            }
                        };

                        if req.epoch < epoch.load(Ordering::Relaxed) {
                            continue; // Stale request, drop immediately
                        }

                        let res =
                            FrameDecoder::decode_file(&req.path, req.frame, req.target_dimensions);

                        if req.epoch == epoch.load(Ordering::Relaxed) {
                            let _ = result_tx.send((req.epoch, res));
                        }
                    }
                });
        }

        Self {
            task_tx,
            result_rx: Arc::new(Mutex::new(result_rx)),
            epoch,
        }
    }

    pub fn dispatch(&self, frame: i32, path: PathBuf, target_dimensions: Option<(u32, u32)>) {
        let req = DecodeRequest {
            epoch: self.epoch.load(Ordering::Relaxed),
            frame,
            path,
            target_dimensions,
        };
        let _ = self.task_tx.send(req);
    }

    pub fn cancel_stale(&self) {
        self.epoch.fetch_add(1, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone)]
pub struct PerformanceHudStats {
    pub target_fps: f64,
    pub measured_fps: f64,
    pub dropped_frames: u64,
    pub drop_rate_pct: f64,
    pub cached_count: usize,
    pub ram_usage_mb: f64,
    pub budget_mb: f64,
    pub avg_decode_ms: f64,
    pub last_scrub_latency_ms: f64,
    pub is_proxy_active: bool,
}

#[derive(Debug, Clone)]
pub struct SequencePlayer {
    pub clock: PlaybackClock,
    pub cache: FrameCache,
    pub ring_buffer: ReadAheadRingBuffer,
    pub decode_pool: DecodePool,
    pub proxy_mgr: ProxyManager,
    pub watcher: SequenceWatcher,

    pub sequence_dir: Option<PathBuf>,
    pub file_pattern: String,
    pub missing_frames: Vec<i32>,

    pub zoom_level: f32, // 1.0 = 100%, 0.0 = fit
    pub pan_offset: (f32, f32),
    pub show_hud: bool,
    pub checkerboard_alpha: bool,
    pub current_frame_data: Option<DecodedFrame>,
    pub last_scrub_latency_ms: f64,
}

impl Default for SequencePlayer {
    fn default() -> Self {
        Self::new(1, 250, 24.0)
    }
}

impl SequencePlayer {
    pub fn new(start_frame: i32, end_frame: i32, fps: f64) -> Self {
        Self {
            clock: PlaybackClock::new(start_frame, end_frame, fps),
            cache: FrameCache::new(FrameCache::default_budget()),
            ring_buffer: ReadAheadRingBuffer::new(ReadAheadConfig::default()),
            decode_pool: DecodePool::new(4),
            proxy_mgr: ProxyManager::new(),
            watcher: SequenceWatcher::new(),
            sequence_dir: None,
            file_pattern: "frame_####.png".to_string(),
            missing_frames: Vec::new(),
            zoom_level: 0.0, // Fit
            pan_offset: (0.0, 0.0),
            show_hud: true,
            checkerboard_alpha: true,
            current_frame_data: None,
            last_scrub_latency_ms: 0.0,
        }
    }

    /// Load or open a sequence from directory
    pub fn load_sequence(&mut self, dir: &Path, pattern: &str, start: i32, end: i32, fps: f64) {
        self.sequence_dir = Some(dir.to_path_buf());
        self.file_pattern = pattern.to_string();
        self.clock = PlaybackClock::new(start, end, fps);
        self.cache.clear();
        self.decode_pool.cancel_stale();
        self.ring_buffer.cancel_stale();
        self.watcher.start_watching(dir).ok();

        // Check for missing frames
        self.missing_frames.clear();
        for f in start..=end {
            let path = self.resolve_frame_path(f);
            if !path.exists() {
                self.missing_frames.push(f);
            }
        }

        // Decode first frame immediately
        self.seek_and_load(start);
    }

    pub fn resolve_frame_path(&self, frame: i32) -> PathBuf {
        let Some(ref dir) = self.sequence_dir else {
            return PathBuf::from(format!("frame_{:04}.png", frame));
        };

        let file_name = if self.file_pattern.contains("####") {
            self.file_pattern.replace("####", &format!("{:04}", frame))
        } else {
            format!("frame_{:04}.png", frame)
        };

        dir.join(file_name)
    }

    /// Poll completed off-thread decode results
    pub fn poll_completed_decodes(&mut self) {
        if let Ok(rx) = self.decode_pool.result_rx.try_lock() {
            let cur_epoch = self.decode_pool.epoch.load(Ordering::Relaxed);
            while let Ok((epoch, res)) = rx.try_recv() {
                if epoch == cur_epoch {
                    if let Ok(decoded) = res {
                        let frame = decoded.frame;
                        self.cache.insert(decoded.clone());
                        self.ring_buffer.mark_completed(frame);
                        if frame == self.clock.current_frame {
                            self.current_frame_data = Some(decoded);
                        }
                    }
                }
            }
        }
    }

    /// Primary clock tick invoked on display refresh turn
    pub fn tick(&mut self, now: Instant) {
        // Drain any finished off-thread decodes first
        self.poll_completed_decodes();

        // Poll live folder watcher
        let new_files = self.watcher.poll_new_files();
        if !new_files.is_empty() {
            // Re-evaluate missing frames when render is actively outputting
            let seq_dir = self.sequence_dir.clone();
            let pat = self.file_pattern.clone();
            self.missing_frames.retain(|&f| {
                let path = if let Some(ref dir) = seq_dir {
                    if pat.contains("####") {
                        dir.join(pat.replace("####", &format!("{:04}", f)))
                    } else {
                        dir.join(format!("frame_{:04}.png", f))
                    }
                } else {
                    PathBuf::from(format!("frame_{:04}.png", f))
                };
                !path.exists()
            });
        }

        let is_ready = self.cache.contains(self.clock.current_frame);
        let (current_frame, changed) = self.clock.update(now, is_ready);

        if changed {
            if let Some(cached) = self.cache.get(current_frame) {
                self.current_frame_data = Some(cached);
            } else {
                // Synchronous decode fallback if frame not yet in ring buffer
                let path = self.resolve_frame_path(current_frame);
                if let Ok(decoded) = FrameDecoder::decode_file(&path, current_frame, None) {
                    self.cache.insert(decoded.clone());
                    self.current_frame_data = Some(decoded);
                }
            }
        }

        // Update read-ahead ring buffer priorities with effective in/out range
        let cached = self.cache.cached_frames();
        self.ring_buffer.update_priority(
            current_frame,
            self.clock.effective_start(),
            self.clock.effective_end(),
            self.clock.fps,
            self.clock.is_playing,
            self.clock.shuttle_speed >= 0,
            &cached,
        );

        // Dispatch next frames to off-thread decode pool
        while let Some(next_frame) = self.ring_buffer.pop_next_to_decode() {
            let path = self.resolve_frame_path(next_frame);
            self.decode_pool.dispatch(next_frame, path, None);
        }

        // Check if any dispatched frames finished during tick
        self.poll_completed_decodes();

        // Automated proxy trigger evaluation
        let is_exr = self.file_pattern.to_lowercase().ends_with(".exr");
        if self
            .proxy_mgr
            .should_trigger_proxy(now, self.clock.drop_rate_pct(), is_exr)
        {
            if let Some(ref dir) = self.sequence_dir {
                let cache_key = ProxyManager::compute_cache_key(
                    dir,
                    self.clock.start_frame,
                    self.clock.end_frame,
                    0,
                );
                let proxy_path = dir.join(cache_key);
                let input_pat = dir.join(&self.file_pattern).to_string_lossy().to_string();
                self.proxy_mgr
                    .spawn_proxy_generation(
                        &input_pat,
                        self.clock.start_frame,
                        self.clock.fps,
                        &proxy_path,
                    )
                    .ok();
            }
        }
    }

    /// Immediate scrubbing to a target frame with latency measurement
    pub fn seek_and_load(&mut self, target_frame: i32) {
        let t0 = Instant::now();
        self.clock.seek(target_frame);
        self.decode_pool.cancel_stale();
        self.ring_buffer.cancel_stale();

        if let Some(cached) = self.cache.get(target_frame) {
            self.current_frame_data = Some(cached);
        } else {
            let path = self.resolve_frame_path(target_frame);
            if let Ok(decoded) = FrameDecoder::decode_file(&path, target_frame, None) {
                self.cache.insert(decoded.clone());
                self.current_frame_data = Some(decoded);
            }
        }

        self.last_scrub_latency_ms = (Instant::now() - t0).as_secs_f64() * 1000.0;
    }

    pub fn handle_key(&mut self, key: &str, shift: bool, alt: bool) {
        match key {
            "Space" => self.clock.toggle_play(),
            "ArrowRight" => {
                let step = if shift { 10 } else { 1 };
                self.seek_and_load(self.clock.current_frame + step);
            }
            "ArrowLeft" => {
                let step = if shift { 10 } else { 1 };
                self.seek_and_load(self.clock.current_frame - step);
            }
            "j" | "J" => self.clock.shuttle_reverse(),
            "k" | "K" => self.clock.pause(),
            "l" | "L" => self.clock.shuttle_forward(),
            "i" | "I" => self.clock.set_in_marker(self.clock.current_frame),
            "o" | "O" => self.clock.set_out_marker(self.clock.current_frame),
            "x" | "X" if alt => self.clock.clear_markers(),
            "f" | "F" => {
                self.zoom_level = 0.0; // Fit
                self.pan_offset = (0.0, 0.0);
            }
            "1" => {
                self.zoom_level = 1.0; // 100% 1:1
                self.pan_offset = (0.0, 0.0);
            }
            "s" | "S" => self.show_hud = !self.show_hud,
            _ => {}
        }
    }

    pub fn get_hud_stats(&self) -> PerformanceHudStats {
        PerformanceHudStats {
            target_fps: self.clock.fps
                * self.clock.speed_multiplier
                * (self.clock.shuttle_speed as f64).abs(),
            measured_fps: self.clock.measured_fps(),
            dropped_frames: self.clock.dropped_frames,
            drop_rate_pct: self.clock.drop_rate_pct(),
            cached_count: self.cache.cached_frames().len(),
            ram_usage_mb: self.cache.current_usage_mb(),
            budget_mb: self.cache.budget_mb(),
            avg_decode_ms: self.cache.average_decode_ms(),
            last_scrub_latency_ms: self.last_scrub_latency_ms,
            is_proxy_active: self.proxy_mgr.is_ready(),
        }
    }
}
