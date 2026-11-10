PRODUCT: Render Night is a fast local render queue for Blender with a Blender-native look. It never opens Blender's GUI to inspect or render, and NEVER modifies or saves the user's original .blend (the runner must never call save).

NON-GOALS: desktop/Discord/Telegram notifications, auto-update, network/cloud rendering, splitting one job across multiple Blender instances, Blender add-on. The only notification is a sound.

ARCHITECTURE
- UI is thin. All logic lives in src/core and emits typed events. Electron main and the CLI both consume core.
- All JSON contracts (inspect output, override payload, runner events, queue-state file) have zod schemas in src/core/schemas and a doc in docs/protocol.md. Change the schema before changing code.
- Overrides are stored as a DIFF against file defaults ({rnaPath: value}), never as full values.
- Blender stdout is parsed natively (Fra:, Mem:, Time:, Remaining:, Sample x/y, Saved:). The runner emits only structured lines prefixed RN_EVENT followed by a JSON object, for frame boundaries, device report, applied/skipped overrides and errors. No NR_MEM/NR_SAMPLE/NR_TIME markers.
- Every property set in Python is in try/except and reported back as applied or skipped-with-reason.
- Compatibility: Blender 3.6 LTS, 4.2 LTS and latest 4.x/5.x. Handle BLENDER_EEVEE vs BLENDER_EEVEE_NEXT. All dropdown options (engines, formats, codecs, view transforms, looks, devices) come from the inspected file's RNA enum items, never hardcoded.

QUALITY
- No stubs or fake features. If something cannot be done, document it in docs/KNOWN_LIMITATIONS.md and tell me.
- State assumptions at the end of each phase.
- Unit tests for the range parser and stdout parser; use tools/mock-blender for anything that would need a real render.
- Tests, lint and typecheck must pass before every commit.

GIT RULES
- Local repo config: user.name "BheeshamKS", user.email "bheeshamkumarsajnani3@gmail.com". Never use any other author. No Co-authored-by trailers.
- Branch main. After EACH completed feature (not each phase): run tests, then git add, commit with a Conventional Commit message (feat(queue): ..., fix(runner): ...) and git push. Never force-push.
- Tag v0.1.0-alpha.N when I ask for a release.