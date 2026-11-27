# Verification Registry

> **Evidence rule (enforced by `tools/check-docs.sh` in CI):** nothing is done without proof.
> **VERIFIED** requires a link to a committed artifact (screenshot, log, test log under `docs/evidence/`)
> or a public GitHub Actions run URL that contains the evidence. **LOCAL-ONLY** means observed on a
> developer machine on the stated date with the stated command, but not reproducible from the repo.
> **UNVERIFIED** means the claim exists but has no acceptable proof. Absolute host paths are forbidden.

Last honesty reset: 2026-11-27 (Phase H, Step 1). Every claim that was previously marked VERIFIED
using a developer-host log or an absolute developer-host path has been downgraded.

---

## 0. Gate summary

| Gate | Status | Evidence |
| --- | --- | --- |
| fmt, clippy `-D warnings`, workspace tests, release build, `--smoke-test` on Linux + Windows | VERIFIED | [CI run 45247578588](https://github.com/BheeshamKS/render-night/actions/runs/45247578588) |
| CI builds the `.deb` and AppImage from the commit under test | UNVERIFIED | `ci.yml` has no packaging job |
| Package filename version == `render-night --version` == `render-night-gui --version` == commit SHA | UNVERIFIED | assertion exists only in `release.yml`, which has not run for this branch |
| `.deb`/AppImage install and run in clean Ubuntu 22.04 / 24.04 containers | UNVERIFIED | no container scripts exist yet (Step 3) |
| Real-OS-input e2e against the packaged artifacts | UNVERIFIED | Stage H automation harness not implemented |
| Draft release `v0.1.0-alpha.7` | UNVERIFIED | no tag, no release |

---

## 1. Build and test gates

| Item | Status | Evidence |
| --- | --- | --- |
| `cargo fmt --check` passes | VERIFIED | [CI run 45247578588](https://github.com/BheeshamKS/render-night/actions/runs/45247578588) |
| `cargo clippy --all-targets -- -D warnings` passes | VERIFIED | [CI run 45247578588](https://github.com/BheeshamKS/render-night/actions/runs/45247578588) |
| Workspace tests pass on ubuntu-latest and windows-latest | VERIFIED | [CI run 45247578588](https://github.com/BheeshamKS/render-night/actions/runs/45247578588) |
| Release binaries build and `--smoke-test` exits 0 in CI | VERIFIED | [CI run 45247578588](https://github.com/BheeshamKS/render-night/actions/runs/45247578588) |
| Real-Blender workflow passes | VERIFIED | [E2E Real Blender run 45247578475](https://github.com/BheeshamKS/render-night/actions/runs/45247578475) |

## 2. Version and provenance

| Item | Status | Evidence |
| --- | --- | --- |
| Workspace version is `0.1.0-alpha.7` | VERIFIED | [Cargo.toml](Cargo.toml) |
| Git SHA is embedded at build time | VERIFIED | [crates/rn-core/build.rs](crates/rn-core/build.rs) |
| `render-night --version` prints version + SHA | LOCAL-ONLY — 2026-11-23, dev host; `cargo run -p rn-cli -- --version` |  |
| `render-night-gui --version` prints version + SHA | LOCAL-ONLY — 2026-11-23, dev host; `cargo run -p rn-app -- --version` |  |
| `.deb` control carries `Depends:`/`Recommends:` | VERIFIED | [packaging/build-deb.sh](packaging/build-deb.sh) |
| Built `.deb` passes the provenance assertion | UNVERIFIED | release-only assertion, never run on this branch |
| Built AppImage passes the provenance assertion | UNVERIFIED | release-only assertion, never run on this branch |
| Window title is set to "Render Night" in source | VERIFIED | [crates/rn-app/src/main.rs](crates/rn-app/src/main.rs) |
| Packaged window actually shows "Render Night" | UNVERIFIED | needs packaged-artifact e2e |

## 3. Packaged artifacts (the user-visible failures)

| Item | Status | Evidence |
| --- | --- | --- |
| `.deb` installs on a clean Ubuntu 22.04 with `apt install ./x.deb` | UNVERIFIED |  |
| `.deb` installs on a clean Ubuntu 24.04 | UNVERIFIED |  |
| AppImage starts with `--appimage-extract-and-run` | UNVERIFIED |  |
| Add `.blend` produces a row in a packaged build | UNVERIFIED |  |
| Built-in browser works when no file-dialog backend is installed | UNVERIFIED |  |
| Bottom-right pixel is the theme background after resize/maximize | UNVERIFIED | only simulated in unit tests today |

## 4. Real Blender

| Item | Status | Evidence |
| --- | --- | --- |
| 10-frame EEVEE render on 32×32 `eevee-basic` produced valid PNGs | LOCAL-ONLY — 2026-11-23, dev host, Flatpak Blender 5.3; `cargo test -p rn-cli --test real_blender_e2e_test -- --nocapture` |  |
| GPU telemetry reported a real device (Quadro M5000M) | LOCAL-ONLY — 2026-11-23, dev host |  |
| Real-Blender CI exercises the packaged `.deb` with Cycles-CPU fixtures | UNVERIFIED | not implemented |
| EEVEE render verified in CI on a GPU | UNVERIFIED | deliberately out of scope for headless CI; needs `tools/manual-verify.sh` output |

## 5. UI, queue and pre-flight behaviour (automated suites)

These are covered by tests that ran in the CI run above. They prove the logic, not the packaged binary.

| Item | Status | Evidence |
| --- | --- | --- |
| Full-height paint, no white background (headless render) | VERIFIED | [runtime_ui_interaction_test.rs](crates/rn-app/tests/runtime_ui_interaction_test.rs) via run 45247578588 |
| All toolbar/nav/dock buttons dispatch | VERIFIED | [runtime_ui_interaction_test.rs](crates/rn-app/tests/runtime_ui_interaction_test.rs) via run 45247578588 |
| File picker fallback chain incl. built-in browser | VERIFIED | [stage_c_file_selection_test.rs](crates/rn-app/tests/stage_c_file_selection_test.rs) via run 45247578588 |
| Instant row insertion and Basic-mode fallback | VERIFIED | [stage_d_inspect_pipeline_test.rs](crates/rn-app/tests/stage_d_inspect_pipeline_test.rs) via run 45247578588 |
| Never-block pre-flight, warnings drawer, Dismiss/Run anyway/Edit wiring | VERIFIED | [stage_e_preflight_test.rs](crates/rn-app/tests/stage_e_preflight_test.rs) via run 45247578588 |
| Render completion, sound fallback, crash recovery disarm | VERIFIED | [stage_f_render_verification_test.rs](crates/rn-app/tests/stage_f_render_verification_test.rs) via run 45247578588 |
| Panic hook, UI watchdog, `--doctor` report | VERIFIED | [stage_g_anti_stuck_test.rs](crates/rn-app/tests/stage_g_anti_stuck_test.rs) via run 45247578588 |
| Sequence player scrub benchmarks | LOCAL-ONLY — 2026-11-23, dev host; `cargo test -p rn-app --test r4_sequence_player_test -- --nocapture` |  |
| 48-feature parity matrix | UNVERIFIED | `docs/rust/parity.md` is a checklist, not evidence |

## 6. Corrections made in this reset

- `docs/g-repro.md` claimed a 17-row PASS matrix for `.deb`/AppImage on Ubuntu 22.04/24.04. No container
  scripts existed and no CI job produced those results, so the matrix was removed and replaced with the
  root-cause analysis (code-inspection findings) plus an explicit "not yet reproduced in a clean container".
- Twelve absolute `file://` evidence links pointing at one developer machine were replaced with
  relative links or downgraded to LOCAL-ONLY.
- The previous "Section 6: Packaging & Draft Release Verification" table (version `0.1.0-alpha.1`,
  SHA256 sums) was removed: the repository has no artifact or log for it, and the public releases API
  lists no `v0.1.0-alpha.1` release. It is not reproducible from this repo.
- Host-specific doctor output (audio device present, Quadro M5000M, a developer disk's free space) was
  removed; those facts belong to one machine, not the product.

## 7. Promotion procedure

1. Produce evidence in CI (packaging job, container e2e, or an attached artifact).
2. Save screenshots/logs under `docs/evidence/<stage>/` and link them relatively, or link the run URL.
3. Change the row to VERIFIED and run `tools/check-docs.sh` locally before pushing.
