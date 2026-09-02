# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) strictly from v1.0.0 onward (SPEC-PKG-11).

## [Unreleased]

### Added

- Repository foundation — composer.json, governance docs, CI workflows (M0).
- Dual Livewire 3.6+/4.x bridge selected by runtime feature detection (SPEC-INT-20).
- Ghost Layer portal, state machine (idle/pending/visible/settling), and `freeze` mode.
- `wire:ghost` directive with `.freeze`, `.off`, `.ignore`, `.keep`, `.delay.<n>ms`, `.hold.<n>ms`, `.rows.<n>` modifiers.
- Morph safety: Ghost Layer mounts to `document.body`, outside any component's reconciled tree. Guarded by dual `morph.updating` and `morph.removing` skip() handlers (SPEC-MORPH-01..06).
- Freeze hold enforcement: `Livewire.hook('morphed')` reapplies `gw-frozen` class during hold window, preventing Livewire's attribute diffing from stripping it prematurely (SPEC-TIME-02).
- Silence-by-default: Livewire 3 polling detection via `wire:poll` heuristic (DOM shape recognition), Livewire 4 keystroke sync via `wire:model.live` action shape recognition, and v4 `wire:poll` action detection prevent false-positive activations (SPEC-API-20/21).
- Real skeleton synthesis (`synthesize` mode, the `wire:ghost` default): a host's DOM subtree is walked, classified into Bone Types (text/heading/media/avatar/icon/control/container), batch-measured with reads/writes strictly separated, and emitted as a Bone Tree positioned in host-relative coordinates — replacing M1's empty portal with real skeleton bones (SPEC-SYN-01/10/12/16/17, SPEC-RND-01/02). Nested `wire:ghost` hosts (any modifier) are walk boundaries. Non-axis-aligned hosts/descendants (rotation/skew, conservatively including `matrix3d` and unrecognized transforms) degrade the affected bone, or the whole host to `freeze`, rather than rendering a misplaced bone (SPEC-SYN-16). An empty host degrades to `freeze` unless `.rows.<n>` supplies a placeholder-row hint (SPEC-SYN-17).
- Bone rendering: `renderBones()` paints the Bone Tree into the existing Ghost Layer portal, replicating the host's own border-radius and overflow-clipping once at mount time (SPEC-RND-02).
- Host concealment (SPEC-MORPH-03): while bones are shown in `synthesize` mode, the host's own content is now actually hidden and non-interactive (`visibility: hidden; pointer-events: none` via `.gw-concealed`) instead of staying visible/clickable underneath the bones — `freeze` mode is unaffected and keeps its own dimming via `.gw-frozen`. `.keep`-marked hosts get an unconditional `.gw-kept` override (`visibility: visible; pointer-events: auto`) applied at attach time, so a kept host stays visible/interactive even nested inside a concealed ancestor.
- Signature-based memoization (SPEC-SYN-20/21): a Bone Tree is cached per host, keyed by a structural signature (tagName/BoneType/className/depth — never text content), and invalidated by a `ResizeObserver` once the host's width drifts ≥4px (comparing border-box to border-box, avoiding a permanent content-box/border-box mismatch). An invalidated, currently-visible skeleton is now actually re-synthesized and repainted in place (or degraded to `freeze` if it no longer has content) instead of drifting out of sync until the next show cycle.
- Geometry + zero-CLS Definition-of-Done test suite (Pest 4 + Playwright) covering the three gallery layouts (paginated table, grouped table, card grid): every rendered bone is independently verified to overlap its real source element within a 2px tolerance, and triggering a skeleton introduces zero Cumulative Layout Shift.
- Browser test suite (Pest 4 + Playwright) covering morph safety, freeze timing, silence behavior, synthesis geometry, and host concealment, run against both Livewire versions in CI.

### Fixed

- Skeleton memoization was dead on arrival for any host with padding/border: the cache compared a border-box measurement against the `ResizeObserver`'s default content-box delivery, invalidating itself the instant it was set. The observer now requests `{ box: 'border-box' }` and reads the matching `borderBoxSize` field.
- `isAvatar()` misread a percentage `border-radius` (e.g. `"50%"`) as a pixel value, so any circular avatar larger than 100px rendered as a rounded rectangle instead of a circle.
- `repositionLayer()` re-read and re-applied the host's border-radius/overflow via `getComputedStyle` on every morph, even though neither can change between mount and unmount — this forced-style-recalc now happens once, in `mountLayer()`.

### Scope (deferred, tracked for later milestones)

- Repeat-sampling for repeated siblings, scrollable-content clipping, sticky/fixed viewport geometry, and adaptive freeze triggering (SPEC-SYN-11/13/14/15, SPEC-PERF-07) are M3 — a flat depth cap (12) and candidate-count cap (300) stand in as a raw safety net only.
- Bone animation (shimmer/pulse/wave, `prefers-reduced-motion`) and dark-mode token wiring (SPEC-RND-05/06) are M5 — M2 bones are static filled boxes.
