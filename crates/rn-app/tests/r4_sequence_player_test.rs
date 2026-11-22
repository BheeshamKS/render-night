// Render Night - Phase R4 Sequence Player Verification Suite
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::Path;
use std::time::{Duration, Instant};

use rn_app::player::clock::{LoopMode, PlaybackClock, PlaybackMode};
use rn_app::player::decoder::FrameDecoder;
use rn_app::player::lru_cache::{DecodedFrame, FrameCache};
use rn_app::player::proxy::ProxyManager;
use rn_app::player::ring_buffer::{ReadAheadConfig, ReadAheadRingBuffer};
use rn_app::player::SequencePlayer;

#[test]
fn test_clock_math_monotonic_and_modes() {
    let mut clock = PlaybackClock::new(1, 100, 24.0);
    assert_eq!(clock.current_frame, 1);
    assert!(!clock.is_playing);

    clock.play();
    assert!(clock.is_playing);

    let t0 = Instant::now();

    // After 0.5s at 24 fps = 12 frames elapsed -> frame should be 1 + 12 = 13
    let (f, changed) = clock.update(t0 + Duration::from_millis(500), true);
    assert!(changed);
    assert_eq!(f, 13);

    // After 1.0s at 24 fps = 24 frames elapsed -> frame should be 1 + 24 = 25
    let (f2, _) = clock.update(t0 + Duration::from_millis(1000), true);
    assert_eq!(f2, 25);

    // Test EveryFrame mode (pauses clock if frame not ready)
    clock.mode = PlaybackMode::EveryFrame;
    let (f3, changed3) = clock.update(t0 + Duration::from_millis(2000), false);
    assert!(!changed3);
    assert_eq!(
        f3, 25,
        "Clock must not advance in EveryFrame mode if frame is not ready"
    );

    // Advance when ready
    let (f4, changed4) = clock.update(t0 + Duration::from_millis(2000), true);
    assert!(changed4);
    assert_eq!(f4, 26);
}

#[test]
fn test_shuttle_controls_and_in_out_markers() {
    let mut clock = PlaybackClock::new(1, 200, 24.0);

    // Shuttle Forward: 1x -> 2x -> 4x -> 8x
    assert_eq!(clock.shuttle_speed, 1);
    clock.shuttle_forward();
    assert_eq!(clock.shuttle_speed, 2);
    clock.shuttle_forward();
    assert_eq!(clock.shuttle_speed, 4);
    clock.shuttle_forward();
    assert_eq!(clock.shuttle_speed, 8);
    clock.shuttle_forward();
    assert_eq!(clock.shuttle_speed, 8, "Capped at 8x");

    // Shuttle Reverse: -1x -> -2x -> -4x -> -8x
    clock.set_shuttle(-1);
    assert_eq!(clock.shuttle_speed, -1);
    clock.shuttle_reverse();
    assert_eq!(clock.shuttle_speed, -2);
    clock.shuttle_reverse();
    assert_eq!(clock.shuttle_speed, -4);
    clock.shuttle_reverse();
    assert_eq!(clock.shuttle_speed, -8);

    // In / Out range markers
    clock.seek(50);
    clock.set_in_marker(50);
    assert_eq!(clock.effective_start(), 50);

    clock.seek(150);
    clock.set_out_marker(150);
    assert_eq!(clock.effective_end(), 150);

    // Clear markers
    clock.clear_markers();
    assert_eq!(clock.effective_start(), 1);
    assert_eq!(clock.effective_end(), 200);

    // Ping-pong loop mode
    clock.loop_mode = LoopMode::PingPong;
    clock.set_shuttle(1);
    clock.seek(199);
    let t0 = Instant::now();
    let (f_end, _) = clock.update(t0 + Duration::from_millis(100), true);
    assert_eq!(f_end, 200);
}

#[test]
fn test_lru_cache_memory_budget_and_eviction() {
    // 10 MB budget for testing
    let budget = 10 * 1024 * 1024;
    let mut cache = FrameCache::new(budget);

    // Frame of 1000x1000 RGBA = 4,000,000 bytes (~3.81 MB)
    let make_frame = |f: i32| -> DecodedFrame {
        let rgba = vec![0u8; 4_000_000];
        DecodedFrame::new(f, 1000, 1000, rgba, false, 2.5)
    };

    // Insert Frame 1 and Frame 2 (~7.62 MB total <= 10 MB)
    cache.insert(make_frame(1));
    cache.insert(make_frame(2));
    assert!(cache.contains(1));
    assert!(cache.contains(2));
    assert_eq!(cache.cached_frames().len(), 2);

    // Insert Frame 3 (~11.44 MB > 10 MB budget)
    // Frame 1 should be evicted (least recently used)
    cache.insert(make_frame(3));
    assert!(
        !cache.contains(1),
        "Frame 1 must be evicted to stay within memory budget"
    );
    assert!(cache.contains(2));
    assert!(cache.contains(3));

    // Access Frame 2 to mark it recently used
    let f2 = cache.get(2);
    assert!(f2.is_some());

    // Insert Frame 4 -> Frame 3 should now be evicted before Frame 2!
    cache.insert(make_frame(4));
    assert!(
        !cache.contains(3),
        "Frame 3 must be evicted instead of recently accessed Frame 2"
    );
    assert!(cache.contains(2));
    assert!(cache.contains(4));

    // Hit rate verification
    assert_eq!(cache.hits, 1);
    let miss = cache.get(999);
    assert!(miss.is_none());
    assert_eq!(cache.misses, 1);
    assert_eq!(cache.hit_rate_pct(), 50.0);
}

#[test]
fn test_read_ahead_priority_and_scrub_cancellation() {
    let mut ring = ReadAheadRingBuffer::new(ReadAheadConfig {
        read_ahead_seconds: 1.0, // 24 frames ahead at 24fps
        max_in_flight: 4,
    });

    let cached = vec![1];

    // Priority when playing forward from frame 1
    ring.update_priority(1, 1, 100, 24.0, true, true, &cached);
    assert!(ring.queue_len() > 0);
    assert_eq!(ring.pop_next_to_decode(), Some(2));
    assert_eq!(ring.pop_next_to_decode(), Some(3));

    // Simulate playhead jump (scrubbing from 3 to 50)
    // Must immediately cancel stale items for frames 4..25
    ring.update_priority(50, 1, 100, 24.0, false, true, &[]);
    assert_eq!(
        ring.pop_next_to_decode(),
        Some(50),
        "Nearest playhead frame 50 must be prioritized immediately on scrub"
    );
}

#[test]
fn test_proxy_manager_triggers_and_cache_key() {
    let mut proxy = ProxyManager::new();
    let now = Instant::now();

    // Heavy EXR trigger: immediate
    assert!(proxy.should_trigger_proxy(now, 0.0, true));

    // Normal footage with 2% drop rate: should NOT trigger
    let mut proxy2 = ProxyManager::new();
    assert!(!proxy2.should_trigger_proxy(now, 2.0, false));

    // High drop rate (8%) for < 2.0 seconds: should NOT trigger yet
    assert!(!proxy2.should_trigger_proxy(now, 8.0, false));
    assert!(!proxy2.should_trigger_proxy(now + Duration::from_millis(1500), 8.0, false));

    // High drop rate (> 5%) for >= 2.0 seconds: MUST trigger
    assert!(proxy2.should_trigger_proxy(now + Duration::from_millis(2100), 8.0, false));

    // Deterministic cache key test
    let dir = Path::new("/renders/shot_01");
    let key1 = ProxyManager::compute_cache_key(dir, 1, 250, 1732300000);
    let key2 = ProxyManager::compute_cache_key(dir, 1, 250, 1732300000);
    let key3 = ProxyManager::compute_cache_key(dir, 1, 250, 1732305000);
    assert_eq!(key1, key2);
    assert_ne!(key1, key3);

    // ffmpeg CLI args validation
    let out_file = Path::new("/renders/shot_01/proxy.mp4");
    let args = ProxyManager::build_ffmpeg_args("/renders/shot_01/f_%04d.exr", 1, 24.0, out_file);
    assert!(args.contains(&"-g".to_string()));
    assert!(
        args.contains(&"1".to_string()),
        "GOP 1 intra-frame must be configured"
    );
    assert!(
        args.iter().any(|a| a.contains("tonemap=")),
        "sRGB tone-mapping filter must be configured"
    );
}

#[test]
fn test_downscale_algorithm() {
    // 4x4 RGBA downscaled to 2x2
    let mut src = Vec::new();
    for _ in 0..16 {
        src.extend_from_slice(&[200, 100, 50, 255]);
    }

    let (w, h, out) = FrameDecoder::downscale_rgba(4, 4, &src, 2, 2);
    assert_eq!(w, 2);
    assert_eq!(h, 2);
    assert_eq!(out.len(), 16);
    assert_eq!(out[0], 200);
    assert_eq!(out[1], 100);
    assert_eq!(out[2], 50);
    assert_eq!(out[3], 255);
}

#[test]
fn test_benchmarks_zero_dropped_frames_and_sub_100ms_scrub() {
    let mut player = SequencePlayer::new(1, 250, 24.0);

    // Pre-seed cache with 250 simulated 1080p decoded frames
    let frame_rgba = vec![128u8; 1920 * 1080 * 4];
    for f in 1..=250 {
        let dec = DecodedFrame::new(f, 1920, 1080, frame_rgba.clone(), false, 1.2);
        player.cache.insert(dec);
    }

    // Benchmark 1: Realtime playback over 250 frames at 24 fps
    player.clock.play();
    let start_time = Instant::now();
    let frame_duration = Duration::from_micros((1_000_000.0 / 24.0) as u64);

    for i in 0..250 {
        let now = start_time + frame_duration * i;
        player.tick(now);
    }

    assert_eq!(
        player.clock.dropped_frames, 0,
        "Zero dropped frames required for cached 1080p 24fps sequence playback"
    );

    // Benchmark 2: Scrub Latency < 100 ms
    let mut total_scrub_ms = 0.0;
    let scrub_targets = [1, 50, 120, 240, 15, 88, 200, 30, 180, 5];

    for &target in &scrub_targets {
        let t0 = Instant::now();
        player.seek_and_load(target);
        let elapsed_ms = (Instant::now() - t0).as_secs_f64() * 1000.0;
        assert!(
            elapsed_ms < 100.0,
            "Scrub latency to frame {} must be under 100 ms (actual: {:.2} ms)",
            target,
            elapsed_ms
        );
        total_scrub_ms += elapsed_ms;
    }

    let avg_scrub = total_scrub_ms / scrub_targets.len() as f64;
    assert!(
        avg_scrub < 10.0,
        "Average cached scrub latency must be well under 10 ms (actual: {:.2} ms)",
        avg_scrub
    );

    // Benchmark 3: Performance HUD statistics
    let stats = player.get_hud_stats();
    assert_eq!(stats.dropped_frames, 0);
    assert_eq!(stats.drop_rate_pct, 0.0);
    assert!(stats.cached_count > 0);
    assert!(stats.ram_usage_mb > 0.0);
}
