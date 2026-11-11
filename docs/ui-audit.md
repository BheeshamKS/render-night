# Render Night: UI Usability Audit & Visual Analysis

*Audit conducted across Playwright screenshots at 1100x700, 1280x800, and 1920x1080 for all 12 core application states.*

---

## 1. Executive Summary

Render Night is functionally robust under the hood, but its visual presentation is that of an early prototype rather than a professional Blender-native creative workstation tool. The interface currently uses inline expansion drawers that cause massive layout reflows, unstyled native HTML form controls, inconsistent typography, non-standard click targets, and lacks a master-detail workflow.

---

## 2. Usability Problems Ranked

### Category 1: BROKEN (Functional Ergonomics & Layout Failures)

1. **Inline Job Expansion Reflows (Broken Master-Detail)**
   - *State*: `06-properties-editor-open`
   - *Issue*: Opening job properties expands an accordion drawer directly inside the list. In a queue of 10+ jobs, this pushes all other cards off-screen and causes aggressive scroll jumps. It is impossible to compare settings between two jobs or view the queue while tweaking parameters.
   - *Resolution*: Replace inline drawer with a right-hand resizable Blender-style Properties panel with vertical tab strip (Render, Output, Job) and draggable splitters.

2. **No Multi-Selection or Batch Actions (Missing Bulk Workflow)**
   - *State*: `03-queued-jobs`
   - *Issue*: Users cannot shift-click or ctrl/cmd-click multiple jobs. Applying overrides or removing multiple jobs requires tedious individual actions per card.
   - *Resolution*: Implement multi-select with shift/cmd click, select all (`Cmd/Ctrl+A`), right-click context menu, and a sticky contextual floating bulk bar.

3. **Virtualization Missing for Large Queues**
   - *State*: `03-queued-jobs`
   - *Issue*: Rendering 50+ jobs creates 50+ complex DOM subtrees with re-renders propagating across all rows on every frame progress event.
   - *Resolution*: Virtualize the list, throttle queue progress dispatch to ~5 Hz, and use per-row Zustand selector hooks.

4. **Console Tab Lacks Error Highlighting & Log Virtualization**
   - *State*: `05-failed-job-crash-log`
   - *Issue*: Raw logs are dumped into an unformatted container. Crash stacks and stderr lines are not highlighted in red, making diagnosis slow. No log filtering or auto-scroll toggle.
   - *Resolution*: Build a virtualized monospace console with regex-based red error line highlighting, filter search box, auto-scroll toggle, and 1-click copy/open folder.

---

### Category 2: CONFUSING (Information Hierarchy & Mental Models)

1. **Navigation Structure is Scattered (Modal Popups vs First-Class Views)**
   - *States*: `07-history-tab`, `08-sequence-tools-tab`, `09-settings`
   - *Issue*: History and Settings open as transient modal overlays while Sequence Tools is an awkward tab switch. Users have no persistent sense of place or top-level hierarchy.
   - *Resolution*: Build a persistent left nav rail (Queue, History, Sequence Tools, Settings) with icons, labels, tooltips, and active state indicators.

2. **Queue Control State Ambiguity (Start vs Running)**
   - *State*: `04-job-rendering`
   - *Issue*: The Start button doesn't clearly morph into a Pause/Stop control. Users struggle to identify how to pause vs cleanly stop a running queue.
   - *Resolution*: Morph the Start button into a distinct Blender-style Pause / Stop segmented control while running.

3. **Post-Queue Action Visibility**
   - *State*: `12-shutdown-countdown`, `01-empty-queue`
   - *Issue*: The post-queue action selector is treated as a secondary dropdown rather than an explicit commitment before starting the queue.
   - *Resolution*: Prominently display "When finished: [ Do nothing | Sleep | Shutdown ]" directly in the center toolbar group.

4. **Frame Range & Device Status Hidden Inside Cards**
   - *States*: `03-queued-jobs`, `04-job-rendering`
   - *Issue*: Crucial information (whether a job is rendering on RTX 3080 OptiX vs CPU, and total frame count "1-250 · 250 f") requires scanning multiple lines or opening drawers.
   - *Resolution*: Display dedicated device badges (`GPU · RTX 3080 · OptiX` or `CPU`) and compact frame-range chips directly on the 56-64px job row.

---

### Category 3: UGLY (Aesthetics, Density & Blender Consistency)

1. **Unstyled HTML Controls (No Blender DNA)**
   - *States*: `06-properties-editor-open`, `09-settings`
   - *Issue*: Standard browser `<input type="number">` and `<select>` dropdowns look completely out of place against Blender dark mode. No drag-to-scrub number inputs, no modified property indicators, no segmented buttons.
   - *Resolution*: Implement custom Blender-native number scrubbers (drag to scrub, Shift fine, Ctrl snap, click to type, blue accent bar on change), searchable custom dropdowns, and segmented toggles.

2. **DropZone is Sparse & Generic**
   - *State*: `01-empty-queue`
   - *Issue*: Empty queue shows a plain dashed box with minimal visual polish.
   - *Resolution*: Create a rich Blender-like empty state with prominent drop target, detected Blender versions list with paths/tags, and preset quick-start tips.

3. **Inconsistent Typography & Spacing Hierarchy**
   - *States*: All screenshots (1100x700, 1280x800, 1920x1080)
   - *Issue*: Base font sizes vary between 14px and 11px arbitrarily. Margins and paddings don't adhere to a 4px grid. Font fallback to system-ui causes cross-platform rendering variance.
   - *Resolution*: Enforce bundled Inter font for all UI text, JetBrains Mono for numbers/code/logs, 12-13px base size, strict 4px grid, and WCAG AA contrast against `#181818` / `#282828`.

4. **Dock & Title Bar Lack Native Feel**
   - *States*: All screenshots
   - *Issue*: Window title bar is default OS style. Bottom monitor dock lacks frame sparkline, frame thumbnail preview, and collapse toggle.
   - *Resolution*: Implement nativeTheme dark with `titleBarOverlay` on Windows and `hiddenInset` on macOS; add collapsible monitor dock with frame sparkline and interactive thumbnail.

---

## 3. Implementation Roadmap

- [x] **Step 1**: Capture initial screenshots and document UI Usability Audit (`docs/ui-audit.md`).
- [ ] **Step 2**: Layout Architecture: Master-detail layout with left nav rail, top 48px toolbar, resizable Properties panel, and collapsible Monitor dock.
- [ ] **Step 3**: Job Row: 56-64px scannable row with status chips, preview thumbnail, compact selects, frame chip, device badge, and multi-select.
- [ ] **Step 4**: Blender-Native Custom Controls: Number scrubbers, searchable dropdowns, segmented toggles, collapsible panels, and `/components` showcase.
- [ ] **Step 5**: Monitor Dock & Console: Sparkline, frame preview, virtualized monospace console with error filtering and override log tabs.
- [ ] **Step 6**: Polish: Empty state, tooltips, keyboard shortcuts, structured settings tabs, WCAG AA compliance, and final comparative screenshots.
