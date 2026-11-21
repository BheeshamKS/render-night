# Project: Render Night Core Engine & CLI (Rust Port)

## Architecture
Render Night is a headless batch render manager for Blender, ported from legacy TypeScript/Node to production-grade Rust.
The system consists of two primary crates:
1. `crates/rn-core`: Pure library containing all core domain logic, data models, Blender discovery, headless execution supervisor, process lifetime isolation, actor queue engine, pre-flight safety validation, power/sleep control, and audio synthesis. No UI, no Electron, and no Node.js dependencies.
2. `crates/rn-cli`: Command-line executable `render-night` (package name `rn-cli`) built with `clap`, subscribing to `rn-core`'s typed event channels and providing commands: `--queue`, `inspect`, and `list-blenders`.

### Architecture Data Flow
```
User / Automation / Scripts
         │
         ▼
 ┌───────────────┐
 │ crates/rn-cli │ (clap CLI, terminal formatting, exit codes 0/1/2)
 └───────┬───────┘
         │ Tokio Channels (Commands & Broadcast Events)
         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                      crates/rn-core                         │
 │                                                             │
 │  ┌─────────────────┐   ┌────────────────┐   ┌────────────┐  │
 │  │   QueueEngine   │──▶│   Preflight    │──▶│ Supervisor │  │
 │  │     (Actor)     │   │   (Checker)    │   │ (Process)  │  │
 │  └────────┬────────┘   └────────────────┘   └─────┬──────┘  │
 │           │                                       │         │
 │   ┌───────┴────────┐                     ┌────────┴───────┐ │
 │   │  Persistence   │                     │Process Lifetime│ │
 │   │(Atomic / JSONL)│                     │(JobObj/PDEATH) │ │
 │   └────────────────┘                     └────────┬───────┘ │
 └───────────────────────────────────────────────────┼─────────┘
                                                     ▼
                                            Blender Subprocess
                                       (inspect_blend / render_runner)
```

---

## Feature Inventory
Every feature identified during survey is assigned to a milestone below.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Custom Range Parser | Comma-separated expressions, deduplication, sorting | M1 | Survey |
| 2 | Range Modes Resolution | scene_default, simple, custom, single_still | M1 | Survey |
| 3 | Image vs Video Range Rule | Sequential step=1 check for video containers | M1 | Survey |
| 4 | Output Token Expansion | {project}, {scene}, {camera}, #{1,8} with negative pad | M1 | Survey |
| 5 | Missing Frames Filter | Compares expected paths on disk, skips rendered frames | M1 | Survey |
| 6 | Blender Discovery | Cross-platform discovery (Windows, macOS, Linux, Steam, Flatpak, Snap) | M1 | Survey |
| 7 | Version Output Parsing | Regex parsing of `blender --version` | M1 | Survey |
| 8 | .blend Header Reader | 12-byte zero-copy magic, pointer size, endianness, version | M1 | Survey |
| 9 | Version Compatibility Check | Forward incompatibility warning only on newer major/minor | M1 | Survey |
| 10 | Filesystem Discovery Trait | Abstract filesystem trait allowing mock discovery | M1 | Survey |
| 11 | Golden Fixtures Infrastructure | Golden JSON fixtures in `tests/golden/*.json` | M1 | Survey |
| 12 | JSON Schemas (serde) | Strongly typed structs for QueueState, Job, InspectOutput, etc. | M2 | Survey |
| 13 | Schemars Schema Generation | Checked-in JSON schema generation shared with Python contract | M2 | Survey |
| 14 | Native Stdout Parser | Fra:, Mem:, Peak:, Time:, Remaining:, Sample, Saved: | M2 | Survey |
| 15 | RN_EVENT Protocol Parser | Discriminated union parser for `RN_EVENT <json>` lines | M2 | Survey |
| 16 | Override Diff Model | Deep comparison against defaults, stores modified keys only | M2 | Survey |
| 17 | Override Compatibility Filter | Engine relevance filtering and skip reports | M2 | Survey |
| 18 | Preset Store | Reusable render presets with atomic JSON storage | M2 | Survey |
| 19 | Phase 13 Partial Inspect | Contract for partial inspect error recovery & Basic Mode | M2 | Survey |
| 20 | Runner Supervisor | tokio::process headless runner execution | M3 | Survey |
| 21 | Control Channel Sentinel | Polling `control.json` between frames (continue, pause, stop) | M3 | Survey |
| 22 | Crash Recovery Loop | Retry -> CPU fallback -> skip frame -> consecutive crash abort | M3 | Survey |
| 23 | Rolling Average ETA | Window of last 10 completed frame times | M3 | Survey |
| 24 | GPU Utilization Monitor | Best-effort query via nvidia-smi / rocm-smi | M3 | Survey |
| 25 | Windows Job Object | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE for zero orphan leaks | M3 | Survey |
| 26 | Linux Death Signal | Dedicated thread with PR_SET_PDEATHSIG(SIGKILL) + process group | M3 | Survey |
| 27 | macOS Orphan PID Sweeper | Stored PID + launch time sweep | M3 | Survey |
| 28 | Priority & Thread Limiting | Process priority / nice and -t threads flag | M3 | Survey |
| 29 | Unclean Shutdown Lock | `unclean-shutdown.lock` tracking active PID & worker PIDs | M4 | Survey |
| 30 | Queue Engine Actor | Tokio actor with mpsc commands and broadcast events | M4 | Survey |
| 31 | Atomic State Persistence | Temp file + flush + atomic rename for queue state | M4 | Survey |
| 32 | Schema Version Migrations | Sequential migration functions for queue state | M4 | Survey |
| 33 | Legacy TS Queue Importer | Transparent import of old TypeScript `queue-state.json` | M4 | Survey |
| 34 | Append-Only JSONL History | Append-only history with rotation after 1,000 entries | M4 | Survey |
| 35 | Three Hard Blocks Rule | BLENDER_NOT_FOUND, BLEND_NOT_FOUND, ZERO_FRAMES_TO_RENDER | M5 | Survey |
| 36 | Asset Relevance Classifier | Used vs unused vs unknown asset reachability in scene tree | M5 | Survey |
| 37 | Pre-Flight Execution Modes | `never_block` (default), `ask`, `strict` | M5 | Survey |
| 38 | Warning Suppression | Granular ignoreAllWarnings, ignoredWarningCodes, ignoredWarningIds | M5 | Survey |
| 39 | Basic Mode Fallback | Inspection crash keeps job queued in Basic Mode without overrides | M5 | Survey |
| 40 | System Sleep Prevention | `keepawake` ref-counted sleep inhibitor during renders | M5 | Survey |
| 41 | Safe Post-Queue Actions | Shutdown/reboot/sleep/hibernate with 60s cancel countdown | M5 | Survey |
| 42 | Post-Action Safety Invariants | Disarmed on crash, restore, kill-9, or manual cancellation | M5 | Survey |
| 43 | Deterministic "to-DUNG" Sound | 150-110Hz thump + 460Hz bell hit with 6 inharmonic partials | M5 | Survey |
| 44 | Headless CLI Interface | `render-night --queue`, `inspect`, `list-blenders` via `clap` | M6 | Survey |
| 45 | CLI Terminal Formatting | Overwriting progress lines, bell `\x07`, ASCII summary table | M6 | Survey |
| 46 | Standard Exit Codes | Exit code 0 (success), 1 (render/strict failure), 2 (bad args/syntax) | M6 | Survey |
| 47 | Parity Gate Verification | Diffing TS vs Rust queue-state and history on mock scenarios | M7 | Survey |
| 48 | Kill-9 Crash Test | Validates orphan kill, lock detection, disarmed post-action, resume | M7 | Survey |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation: Golden Fixtures, Range Parser, Token Expander & Blender Discovery | Subsystems 1 & 2: `tests/golden/*.json`, custom range parsing & deduplication, step support, image vs video rule, token expander with negative frame pad, missing frames filter, Blender discovery behind filesystem trait, 12-byte `.blend` header parser, semver comparison. `proptest` generative range tests. Outputs: `crates/rn-core/src/ranges/`, `crates/rn-core/src/blender/`, `tests/golden/*.json`. Gate: PASS (48 tests). | none | DONE |
| M2 | Protocol Contracts: Schemas, Stdout/RN_EVENT Parser & Override Diff Model | Subsystems 3, 4, 5: Serde structs with `schemars` JSON schema generation checked-in, native stdout parser (`Fra:`, `Mem:`, etc.), `RN_EVENT` line parser, override diff calculation against defaults, engine compatibility filter, preset store with JSON import/export, Phase 13 partial inspect schema contract. | M1 | IN_PROGRESS |
| M3 | Process Engine: Runner Supervisor & OS Process Lifetime Isolation | Subsystems 6 & 7: Headless Blender execution via `tokio::process`, control file sentinel (`control.json`), per-frame execution loop, crash recovery (retry -> CPU fallback -> skip frame), consecutive crash abort limit, rolling average ETA, GPU telemetry sampling (`nvidia-smi`/`rocm-smi`), Windows Job Object (`KILL_ON_JOB_CLOSE`), Linux `PR_SET_PDEATHSIG` spawning thread + process group, macOS orphan PID sweep, priority/nice limits. | M2 | PLANNED |
| M4 | Queue System: Actor Engine, Atomic Persistence & JSONL History | Subsystem 8: Actor-based queue engine with Tokio mpsc/broadcast channels, atomic file persistence (temp + rename), `schemaVersion` sequential migrations, legacy TypeScript `queue-state.json` importer, `unclean-shutdown.lock` session tracking, resume calculation from first missing frame, append-only JSONL history with rotation at 1,000 entries. | M3 | PLANNED |
| M5 | Pre-Flight & System Control: Preflight Safety, Sleep Blocker, Post-Actions & Sound | Subsystems 9, 10, 11: Pre-flight validator implementing the exact 3 hard blocks (`BLENDER_NOT_FOUND`, `BLEND_NOT_FOUND`, `ZERO_FRAMES_TO_RENDER`), never-block default policy, asset reachability classification (`used` vs `unused`), warning suppression, Basic Mode fallback, `keepawake` sleep blocker, safe post-queue actions (shutdown, restart, sleep, hibernate) with 60s countdown, hard disarm safety rule on crashes/restores, deterministic "to-DUNG" audio synthesis using `rodio` (-1 dBFS peak). | M4 | PLANNED |
| M6 | CLI Engine: Standalone CLI Interface | Subsystem 12: `crates/rn-cli` with `clap` implementing `render-night --queue <file>`, `render-night inspect <file>`, and `render-night list-blenders`. Real-time terminal progress reporting, ASCII summary table, bell `\x07`, standard exit codes (0 = success, 1 = failure/blocked, 2 = bad args/syntax). | M5 | PLANNED |
| M7 | Final Milestone: Parity Gate & Chaos Hardening | R3 Parity Gate: Running TS CLI and Rust CLI against all 5 `rn-mock-blender` scenarios (Crash 114, GPU OOM, Slow/Control, Missing Assets, Inspect Failure), diffing history and queue-state, generating `docs/rust/parity.md`. Automated Kill-9 mid-render crash simulation test verifying zero orphans, disarmed post-action, and `--resume` continuation from exact missing frame. Phase 2 adversarial testing. | M6 | PLANNED |

---

## Interface Contracts

### 1. `rn-core::ranges` ↔ `rn-core::schemas`
```rust
pub struct ResolvedFrameRange {
    pub frames: Vec<i32>,
    pub is_continuous: bool,
    pub summary: String,
}

pub fn parse_custom_range(expr: &str) -> Result<Vec<i32>, RangeParseError>;
pub fn resolve_frame_range(config: &FrameRangeConfig, scene_start: i32, scene_end: i32, scene_step: i32) -> Result<ResolvedFrameRange, RangeParseError>;
pub fn is_format_video(format: &str) -> bool;
pub fn expand_tokens(template: &str, ctx: &TokenContext) -> String;
pub fn filter_missing_frames(frames: &[i32], output_pattern: &str, output_dir: &Path) -> (Vec<i32>, Vec<i32>);
```

### 2. `rn-core::blender` ↔ Filesystem Trait & Headers
```rust
pub trait BlenderFs: Send + Sync {
    fn exists(&self, path: &Path) -> bool;
    fn is_executable(&self, path: &Path) -> bool;
    fn read_header(&self, path: &Path) -> std::io::Result<[u8; 12]>;
}

pub struct BlendHeaderInfo {
    pub version: String,
    pub major: u32,
    pub minor: u32,
    pub is_64_bit: bool,
    pub little_endian: bool,
}

pub fn parse_blend_header(bytes: &[u8; 12]) -> Result<BlendHeaderInfo, HeaderReadError>;
pub fn is_blend_version_newer(saved_major: u32, saved_minor: u32, target_major: u32, target_minor: u32) -> bool;
```

### 3. `rn-core::render` ↔ Stdout & Runner Events
```rust
pub enum ParsedLine {
    Event(RunnerEvent),
    Progress(StdoutProgress),
    Saved(PathBuf),
    Text(String),
}

pub fn parse_stdout_line(line: &str) -> Result<ParsedLine, StdoutParseError>;
```

### 4. `rn-core::queue` ↔ `rn-cli` Actor Interface
```rust
pub enum QueueCommand {
    Start,
    Pause,
    Resume,
    Stop,
    GetState(oneshot::Sender<QueueState>),
}

pub enum QueueEvent {
    StateChanged(QueueState),
    JobStarted { job_id: String },
    FrameStarted { job_id: String, frame: i32, frame_index: usize, total_frames: usize },
    FrameDone { job_id: String, frame: i32, time_seconds: f64, peak_memory: Option<String> },
    FrameFailed { job_id: String, frame: i32, error: String },
    JobCompleted { job_id: String, result: JobResult },
    Log { job_id: Option<String>, level: LogLevel, message: String },
    PostActionCountdown { action: PostAction, seconds_remaining: u32 },
}

pub struct QueueEngineHandle {
    pub command_tx: mpsc::Sender<QueueCommand>,
    pub event_rx: broadcast::Receiver<QueueEvent>,
}
```

---

## Code Layout

```
crates/
├── rn-core/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── error.rs
│       ├── schemas/          # Serde data models & schemars contracts
│       ├── ranges/           # Frame range syntax, expansion, token resolver
│       ├── blender/          # Discovery, discovery trait, header parsing, inspector
│       ├── overrides/        # Override diff model, validation, engine filtering
│       ├── presets/          # Preset store with JSON import/export
│       ├── render/           # Native stdout parser, RN_EVENT parser, supervisor
│       ├── process/          # OS process lifetime (Job Object, PDEATHSIG, sweep)
│       ├── persistence/      # Atomic file persistence, migrations, TS importer
│       ├── history/          # JSONL append-only history store
│       ├── preflight/        # 3 hard blocks, asset relevance, Basic Mode
│       ├── power/            # keepawake sleep blocker
│       ├── post_actions/     # Safe post-actions with 60s countdown
│       ├── sound/            # Deterministic to-DUNG audio synthesis with rodio
│       └── queue/            # Tokio actor engine & channel coordinator
├── rn-cli/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── args.rs
│       └── commands/
└── rn-mock-blender/          # Native mock Blender for fast, Node-free testing
    ├── Cargo.toml
    └── src/main.rs
tests/
├── golden/                   # Exported golden fixtures (*.json)
└── parity/                   # Parity diff harnesses and Kill-9 chaos tests
```
