# E2E Test Infra: Render Night Core Engine & CLI (Rust Port)

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from user requirements (`ORIGINAL_REQUEST.md`) and specifications (`docs/`, `CLAUDE.md`, `legacy/`), independent of internal implementation details in `rn-core` or `rn-cli`.
- **Node-Free Execution**: Complete elimination of Node.js / Electron dependencies for test verification via a native Rust mock Blender (`rn-mock-blender`).
- **Deterministic & Automated**: Every test must be automated via `cargo test` and standalone harnesses.
- **Methodology**: 4-Tier test architecture:
  - **Tier 1 - Feature Coverage**: ≥5 isolated tests per feature equivalence class.
  - **Tier 2 - Boundary & Corner Cases**: ≥5 tests per feature boundary, edge, and error-prone inputs.
  - **Tier 3 - Cross-Feature Combinations**: Pairwise coverage of major feature interactions.
  - **Tier 4 - Real-World Application Scenarios**: Multi-feature end-user workflows, mock Blender failure recoveries, and CLI parity.

---

## Feature Inventory & Test Coverage Matrix

| # | Feature | Requirement Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|-------------------|:------:|:------:|:------:|
| 1 | Custom Range Parser (50-200, steps, singles) | R2.1, golden | 5 | 5 | ✓ |
| 2 | Range Modes Resolution (scene_default, simple, custom, single) | R2.1, golden | 5 | 5 | ✓ |
| 3 | Image vs Video Range Rule (step=1 for video) | R2.1 | 5 | 5 | ✓ |
| 4 | Output Token Expansion ({project}, {scene}, #{1,8}, neg pad) | R2.1, golden | 5 | 5 | ✓ |
| 5 | Missing Frames Filter (skip rendered frames on disk) | R2.1, R2.6 | 5 | 5 | ✓ |
| 6 | Blender Discovery (Windows/mac/Linux, Steam, Flatpak, Snap) | R2.2 | 5 | 5 | ✓ |
| 7 | Version Output Parsing (`blender --version` regex) | R2.2 | 5 | 5 | ✓ |
| 8 | .blend Header Reader (12-byte zero-copy magic, version, endian) | R2.2 | 5 | 5 | ✓ |
| 9 | Version Compatibility Check (forward incompatibility) | R2.2 | 5 | 5 | ✓ |
| 10 | Filesystem Discovery Trait (mockable filesystem) | R2.2 | 5 | 5 | ✓ |
| 11 | Golden Fixtures Infrastructure (`tests/golden/*.json`) | R1, Acceptance | 5 | 5 | ✓ |
| 12 | JSON Schemas (serde structs for QueueState, Job, etc.) | R2.3, golden | 5 | 5 | ✓ |
| 13 | Schemars Schema Generation (checked-in schema) | R2.3 | 5 | 5 | ✓ |
| 14 | Native Stdout Parser (Fra:, Mem:, Time:, Remaining:, Sample) | R2.4, golden | 5 | 5 | ✓ |
| 15 | RN_EVENT Protocol Parser (`RN_EVENT <json>`) | R2.4 | 5 | 5 | ✓ |
| 16 | Override Diff Model (modified keys vs defaults) | R2.5 | 5 | 5 | ✓ |
| 17 | Override Compatibility Filter (engine relevance & skip reports) | R2.5 | 5 | 5 | ✓ |
| 18 | Preset Store (atomic JSON storage, import/export) | R2.5 | 5 | 5 | ✓ |
| 19 | Phase 13 Partial Inspect Output Contract | R2.3, R2.9 | 5 | 5 | ✓ |
| 20 | Runner Supervisor (tokio::process headless runner) | R2.6 | 5 | 5 | ✓ |
| 21 | Control Channel Sentinel (`control.json` pause/stop/continue) | R2.6 | 5 | 5 | ✓ |
| 22 | Crash Recovery Loop (retry -> CPU fallback -> skip frame) | R2.6 | 5 | 5 | ✓ |
| 23 | Rolling Average ETA (10-frame window) | R2.6 | 5 | 5 | ✓ |
| 24 | GPU Utilization Monitor (nvidia-smi / rocm-smi sample) | R2.6 | 5 | 5 | ✓ |
| 25 | Windows Job Object (KILL_ON_JOB_CLOSE zero orphan leak) | R2.7, Acceptance | 5 | 5 | ✓ |
| 26 | Linux Death Signal (PR_SET_PDEATHSIG + process group) | R2.7, Acceptance | 5 | 5 | ✓ |
| 27 | macOS Orphan PID Sweeper (stored PID + start time sweep) | R2.7 | 5 | 5 | ✓ |
| 28 | Priority & Thread Limiting (priority class / nice, -t flag) | R2.7 | 5 | 5 | ✓ |
| 29 | Unclean Shutdown Lock (`unclean-shutdown.lock` tracking PIDs) | R2.8, Acceptance | 5 | 5 | ✓ |
| 30 | Queue Engine Actor (Tokio mpsc/broadcast channels) | R2.8 | 5 | 5 | ✓ |
| 31 | Atomic State Persistence (temp file + rename) | R2.8 | 5 | 5 | ✓ |
| 32 | Schema Version Migrations (sequential migrations) | R2.8 | 5 | 5 | ✓ |
| 33 | Legacy TS Queue Importer (`queue-state.json` import) | R2.8, golden | 5 | 5 | ✓ |
| 34 | Append-Only JSONL History (rotation at 1,000 entries) | R2.8 | 5 | 5 | ✓ |
| 35 | Three Hard Blocks Rule (BLENDER, BLEND, ZERO_FRAMES) | R2.9 | 5 | 5 | ✓ |
| 36 | Asset Relevance Classifier (used vs unused assets) | R2.9 | 5 | 5 | ✓ |
| 37 | Pre-Flight Execution Modes (never_block, ask, strict) | R2.9 | 5 | 5 | ✓ |
| 38 | Warning Suppression (ignoreAllWarnings, codes, ids) | R2.9 | 5 | 5 | ✓ |
| 39 | Basic Mode Fallback (inspection crash recovery) | R2.9 | 5 | 5 | ✓ |
| 40 | System Sleep Prevention (`keepawake` during renders) | R2.10 | 5 | 5 | ✓ |
| 41 | Safe Post-Queue Actions (60s countdown, shutdown/sleep) | R2.10 | 5 | 5 | ✓ |
| 42 | Post-Action Safety Invariants (disarm on crash/kill-9) | R2.10, Acceptance | 5 | 5 | ✓ |
| 43 | Deterministic "to-DUNG" Sound (150-110Hz + 460Hz hit) | R2.11 | 5 | 5 | ✓ |
| 44 | Headless CLI Interface (`--queue`, `inspect`, `list-blenders`) | R2.12 | 5 | 5 | ✓ |
| 45 | CLI Terminal Formatting (overwriting lines, summary table) | R2.12 | 5 | 5 | ✓ |
| 46 | Standard Exit Codes (0 = ok, 1 = error/strict, 2 = syntax) | R2.12 | 5 | 5 | ✓ |
| 47 | Parity Gate Verification (TS vs Rust mock scenario diffs) | R3, Acceptance | 5 | 5 | ✓ |
| 48 | Kill-9 Crash Test (no post-action, resume at frame) | R3, Acceptance | 5 | 5 | ✓ |

---

## Test Architecture

### 1. Mock Blender (`rn-mock-blender`)
Located at `crates/rn-mock-blender` or standalone test binary.
Supports CLI arguments matching real Blender:
- `-b <blend_file>`
- `-P <python_script>` (e.g. `inspect_blend.py`, `render_runner.py`)
- `-s <start> -e <end> -j <step>`
- `-o <output_pattern>`
- `-F <format>`
- `-t <threads>`
- `--version`

Simulates 5 distinct scenarios via environment variable `RN_MOCK_SCENARIO` or arguments:
1. `crash_114`: Renders frames 110..113 normally, crashes at frame 114 with exit code 1.
2. `gpu_oom`: Emits CUDA out-of-memory error on initial frame, succeeds if rerun with CPU/fallback.
3. `slow_control`: Artificial 500ms delay per frame, watches for `control.json` to pause/stop/continue.
4. `missing_assets`: Emits `RN_EVENT` inspect output with missing textures/fonts (some used, some unused).
5. `inspect_failure`: Inspection script exits non-zero, testing Phase 13 Basic Mode recovery.

### 2. Golden Fixtures (`tests/golden/`)
Exported from TypeScript implementation test cases:
- `tests/golden/range_parser_cases.json`
- `tests/golden/token_expander_cases.json`
- `tests/golden/stdout_samples.json`
- `tests/golden/legacy_queue_state.json`
- `tests/golden/schema_fixtures.json`

### 3. Directory Layout
```
tests/
├── golden/                     # Golden test cases exported from TS
│   ├── range_parser_cases.json
│   ├── token_expander_cases.json
│   ├── stdout_samples.json
│   ├── legacy_queue_state.json
│   └── schema_fixtures.json
├── e2e_tier1_features.rs       # Tier 1 isolated feature tests
├── e2e_tier2_boundaries.rs     # Tier 2 boundary and corner case tests
├── e2e_tier3_combinations.rs   # Tier 3 pairwise interaction tests
├── e2e_tier4_scenarios.rs      # Tier 4 full workflow application tests
└── parity/
    ├── diff_harness.rs         # Diff generator for TS vs Rust CLI runs
    └── kill9_chaos.rs          # Process group / kill -9 mid-render resilience test
```

### 4. Pass/Fail Semantics
- Command: `cargo test --test e2e_*`
- Expected: All test assertions pass, zero panics, exit code 0.

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard Batch Render with Missing Frames | F1, F4, F5, F20, F30, F31, F34, F44, F46 | High |
| 2 | Crash at Frame 114 with Auto-Retry & Fallback | F20, F22, F23, F29, F30, F34, F44, F47 | High |
| 3 | GPU OOM Fallback to CPU Rendering | F20, F22, F24, F30, F44, F47 | Medium |
| 4 | Mid-Render Pause, Control File Stop & Resume | F20, F21, F29, F30, F31, F44 | High |
| 5 | Missing Assets Preflight (Never Block vs Strict) | F35, F36, F37, F38, F39, F44, F46 | High |
| 6 | Inspect Script Failure & Basic Mode Fallback | F19, F35, F39, F44, F46, F47 | Medium |
| 7 | Kill-9 Crash Resilience, Orphan Cleanup & Resume | F25, F26, F29, F31, F41, F42, F48 | Critical |
| 8 | Legacy Queue Import & Migration Workflow | F12, F30, F31, F32, F33, F44 | Medium |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 tests per feature (48 features × 5 = 240+ test cases).
- **Tier 2 (Boundary & Corner Cases)**: ≥5 tests per feature boundary/corner condition (240+ test cases).
- **Tier 3 (Cross-Feature Combinations)**: Pairwise matrix covering major interactions (≥48 combined test cases).
- **Tier 4 (Real-World Scenarios)**: 8 realistic end-to-end scenarios covering full workflows, error recovery, and chaos testing.
- **Parity Gate**: Full TS vs Rust CLI comparison on all 5 mock scenarios documented in `docs/rust/parity.md`.
