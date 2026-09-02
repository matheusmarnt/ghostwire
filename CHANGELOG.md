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
- Morph coexistence: Ghost Layer nodes are protected via `morph.updating` `skip()`, never inserted into the reconciled subtree (SPEC-MORPH-01..06).
- PoC A12: Livewire 3 polling-commit detection via `wire:poll` DOM heuristic, defaulting to silence on uncertainty.
- Browser test suite (Pest 4 + Playwright) covering morph coexistence, timing, and silence, run against both Livewire lines in CI.
