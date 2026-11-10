# Protocol Specification

All JSON contracts and communication formats for Render Night.

## 1. Inspect Output (`InspectOutput`)
Produced by `resources/python/inspect_blend.py`. Validated via `inspectOutputSchema` in `src/core/schemas/inspect.ts`.

## 2. Runner Events (`RunnerEvent`)
Emitted by `resources/python/render_runner.py` prefixed with `RN_EVENT `. Validated via `runnerEventSchema` in `src/core/schemas/runner-event.ts`.
