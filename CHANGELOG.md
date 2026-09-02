# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) strictly from v1.0.0 onward (SPEC-PKG-11).

## [Unreleased]

### Added

- Repository foundation — composer.json, governance docs, CI workflows (M0).
- Dual Livewire 3.6+/4.x bridge selected by runtime feature detection (SPEC-INT-20).
- Ghost Layer portal, state machine (idle/pending/visible/settling), and `freeze` mode.
- `wire:ghost` directive with `.freeze`, `.off`, `.ignore`, `.keep`, `.delay.<n>ms`, `.hold.<n>ms`, `.rows.<n>` modifiers (synthesis-independent; bones land in M2).
- Morph safety: Ghost Layer mounts to `document.body`, outside any component's reconciled tree. Guarded by dual `morph.updating` and `morph.removing` skip() handlers (SPEC-MORPH-01..06).
- Freeze hold enforcement: `Livewire.hook('morphed')` reapplies `gw-frozen` class during hold window, preventing Livewire's attribute diffing from stripping it prematurely (SPEC-TIME-02).
- Silence-by-default: Livewire 3 polling detection via `wire:poll` heuristic (DOM shape recognition), Livewire 4 keystroke sync via `wire:model.live` action shape recognition, and v4 `wire:poll` action detection prevent false-positive activations (SPEC-API-20/21).
- Browser test suite (Pest 4 + Playwright) covering morph safety, freeze timing, and silence behavior, run against both Livewire versions in CI.
