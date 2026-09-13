## Current State — audited 2026-09-12 against `main` @ `ae342e8`

**This section is the result of a four-way audit run directly against the code, not a
summary of the milestone history below.** The per-milestone entries in "Implemented
Features" were each written at merge time and never re-verified; M7's final review proved
that at least some of them describe intent rather than behaviour. Where this section and a
milestone entry disagree, **this section wins** — and the disagreement is itself the finding.

### Release state

Unreleased. **Zero git tags**, `.release-please-manifest.json` at `0.0.0`, and per the user
(2026-09-12) **zero downloads and zero users**. No backwards-compatibility, migration or
deprecation reasoning applies to anything in this package yet.

`main` is at `ae342e8` (M7 merge, PR #17). No milestone worktrees exist; M8 is cancelled.

### Support matrix (`composer.json`)

PHP `^8.2` · `illuminate/support ^12.0|^13.0` · `livewire/livewire ^3.6|^4.0`.
Dev: pint, orchestra/testbench `^10|^11`, pest `^3|^4`, pest-plugin-browser `^4`,
pest-plugin-laravel. **`pest-plugin-browser` has no PHP 8.2-compatible release**, so the CI
8.2 cell removes it and skips `tests/Browser` *and* `tests/Contract`.

### What actually ships

**PHP — 8 classes in `src/`:**
| Class | What it really does |
|---|---|
| `Attributes/Ghost` | Plain attribute, 9 promoted properties, zero logic. |
| `Support/ConfigResolver` | Resolves the `#[Ghost]` precedence chain (method → class → ancestors → traits → package default). Singleton. |
| `Support/LearnedTree` | Re-validates untrusted learned-tree JSON server-side and renders static Blade. |
| `Support/ViewportBands` | Six-name breakpoint allowlist for `ghost:export`. |
| `Livewire/GhostComponentHook` | The runtime: builds and stamps the `data-ghost` payload on **every** component render. |
| `Commands/ExportCommand` | `ghost:export`. |
| `Commands/InspectCommand` | `ghost:inspect`. |
| `GhostwireServiceProvider` | Wires everything. `Livewire::componentHook()` must stay in `register()` — see M7 bug 2. |

**JS — 15 modules in `js/src/`**, all reachable from `index.js`, no orphans:
`index.js` (boot/orchestrator) · `bridge/{index,v3,v4}.js` (Livewire 3/4 detection and adapters)
· `registry.js` · `scheduler.js` · `renderer.js` (all DOM writes) · `attributeConfig.js`
(`data-ghost` validation) · `synthesizer/{index,walk,measure,emit,signature}.js` ·
`learning/{store,bands}.js`.

**Artifacts:** `resources/dist/ghostwire.js` + `.css`, both **verified sha256-identical to an
independent rebuild** with the project's own esbuild. Reproducible; CI enforces this
(`security.yml` → `dist-reproducible`).

### Config — 13 leaf keys, **7 live, 6 dead**

Verified three independent ways (two auditors plus a direct grep of every `config()` call in
`src/`). The complete set of `ghostwire.*` reads in production code is exactly:
`mode`, `timing.delay`, `timing.hold`, `silence.poll`, `silence.sync`, `learning.enabled`,
`learning.store`.

| Key | State |
|---|---|
| `mode`, `timing.delay`, `timing.hold`, `silence.poll`, `silence.sync`, `learning.enabled`, `learning.store` | **live** |
| `enabled` (`GHOSTWIRE_ENABLED`) | **DEAD** |
| `strategy` | **DEAD** |
| `timing.timeout` | **DEAD** (real value hardcoded in `js/src/scheduler.js`) |
| `synthesis.max_depth` / `max_bones` / `repeat_sample_size` | **DEAD** (hardcoded in `js/src/synthesizer/`) |

**The two that matter to a user:**
1. **`enabled` is a kill switch that kills nothing.** Nothing reads it; `GhostComponentHook`
   has no gate at all. Setting `GHOSTWIRE_ENABLED=false` does not disable the package.
2. **`strategy` is inert, and its documented default is the opposite of the real behaviour.**
   The published file carries a comment explaining `'opt-in'` vs `'global'` and defaults to
   `'opt-in'`. In reality `GhostComponentHook` stamps `data-ghost` on every Livewire component
   root unconditionally, and the client auto-attaches a ghost host to any component whose
   `mode` is not `off` — default `synthesize`. **Behaviour is always "global".** This
   contradicts the package's own stated core premise.

Neither key can reach the browser: they appear nowhere in `js/src/`, and there is no
`data-ghost` compact key that could carry them (`m/o/x/d/h/r/p/s/l/g/n` plus `a`).

**Why the `synthesis.*` and `timing.timeout` keys are dead is a design decision, not an
oversight** — and that is the sharper framing. `js/src/attributeConfig.js` states that these
are deliberately "fixed literals, not `config()`-driven values… so the browser's fallback
here is always correct even when a deployment customizes `config/ghostwire.php`". The
architecture intentionally removed those knobs on both sides. The published config file was
never updated to match. The bug is the advertisement, not the implementation.

**All six dead keys are frozen as public API shape by `tests/Feature/ApiSurfaceFreezeTest.php`**
— the same trap that kept `learning.quota_kb` alive for seven milestones. An API-surface
freeze test pins the *shape* of config; it can never tell you whether anything reads it.

### Security posture — verified, holds

Swept against **both source and the shipped bundle**: zero `eval`, zero `new Function`, zero
`innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, no dynamic selector built from
stored data, and **no network primitive of any kind** (`fetch`, `XMLHttpRequest`,
`sendBeacon`, WebSocket). The only network-adjacent code is `exportLearned()`, which is a
`Blob` plus an `<a download>` local file save.

Learning is genuinely opt-in and non-production: `learning.enabled` defaults to `false` **and**
`GhostComponentHook::learningEnabled()` additionally refuses whenever `app()->isProduction()`,
whatever the config says. A client cannot turn it on for itself. Note this refuses only
*production* — `local`, `staging`, `testing` and `qa` all collect.

`ghost:export` refuses rather than sanitises: component-name charset
`/^[a-z0-9\-.]{1,64}$/D` (one shared constant across all three PHP sites as of M7), canonical
path resolution refused outside `resources/views`, and outright refusal for a symlink (live or
dangling) or an existing directory regardless of `--force`.

### Known behaviours a reader would not guess

- **`learning/store.js`'s `get()` writes to `localStorage` on every successful read** — it
  re-serialises the whole envelope and does a synchronous `setItem` purely to refresh LRU
  recency, on the critical path before lazy content renders.
- **No schema-version migration exists.** Bumping `SCHEMA_VERSION` silently discards every
  learned tree.
- **The slow-synthesis freeze (SPEC-PERF-07) is monotonic per host** — once a host degrades it
  never recovers without teardown.
- **The `'block'` bone type is never produced by `classify()`** — only by the depth/count
  safety caps.
- **`ConfigResolver::resolve()`'s `$method` parameter is never non-null in production.** Both
  call sites pass the class alone, and the code says so at `GhostComponentHook.php:63`. Real
  per-action overrides ship through a separate `methodOverrides()` / `"a"`-key path.
- **`mode`'s value is never validated** — the constraint is phpdoc-only.
- **`learning.store` is a one-value enum**: `'local'`, or learning is silently off.
- Class-level `only` combined with method-level `except` throws `InvalidArgumentException` at
  render time (mutual exclusion is checked after the merge).

### CI gates

`tests.yml` → `validate`, `js`, `php` (10-cell matrix: PHP 8.2/8.3/8.4 × Laravel 12/13 ×
Livewire 3.6/4.0, minus the invalid 8.2×13 cell).
`lint.yml` → `pint`, `changelog`. `security.yml` → `composer-audit`, `dist-reproducible`
(also scheduled). `deploy-docs.yml`, `release-please.yml`.

**`perf.yml` contains a single job literally named `placeholder` and runs only on
`workflow_dispatch`.** There is no performance gate. This confirms from the CI side the item
deferred since M3 — the renderer-side bone mount/render cost has no gate of its own.

A CI-only step generates `de_DE.UTF-8` and asserts in PHP that the decimal separator really
became a comma, so `LearnedTreeTest`'s locale-independence check runs for real in CI instead
of skipping (see M7 bug 7).

### Test suite — what it actually verifies

**Shape:** 67 PHP test files + 21 JS test files. Full local run: `vendor/bin/pest` 148 passed
/ 360 assertions; `npm test` 225 passed across 21 files; `pint --test` clean. CI runs the same
plus `GHOSTWIRE_LEARNING=true`, which must stay green both ways — see below.

`phpunit.xml.dist` declares a single `Default` suite over `tests`, so nothing hides behind a
group filter. **The CI PHP 8.2 cell skips `tests/Browser` AND `tests/Contract`** — the first
because `pest-plugin-browser` has no 8.2-compatible release, the second because
`BridgeSurfaceTest` calls Pest's bare `visit()` helper which, with the plugin absent, runs an
installer prompt and then `exit(0)`s the whole process with a SUCCESS code, silently
short-circuiting everything after it.

**`GHOSTWIRE_LEARNING=true vendor/bin/pest` is a real regression gate, not a nicety.** It is
the only reason M7's biggest bug was caught, after seven task reviews and two re-reviews had
missed it. It is green both ways as of `ae342e8` (148/360 identically). Keep it that way: a
red one is useless as a detector, because nobody can tell a new breakage from the known
failures.

**Known vacuous tests — tests that pass without exercising what they are named for.** M7
found and fixed nine. A follow-up audit reports more still present. Two I verified myself:

- `tests/Feature/ThemeCssTest.php:12-28` — named *"keeps bone animations to transform/opacity
  only (SPEC-RND-05)"*. It asserts the keyframe block exists, then asserts six forbidden
  properties are absent — but **never asserts `transform` or `opacity` are present**. An empty
  `@keyframes shimmer { }` passes every assertion while animating nothing. Absence-only, with
  a precondition that proves the keyframe *exists* rather than that it *animates*. One-line
  fix: assert the body contains `transform` or `opacity`.
- **The component-name charset has one PHP definition and three independent JS copies, and
  the drift alarm watches only one of them.** PHP is now a single shared constant
  (`LearnedTree::NAME_PATTERN`, with `/D`) across all three PHP sites since M7. JS has three
  hand-written copies that share nothing: `js/src/index.js:86` (`LAZY_NAME_PATTERN`),
  `js/src/attributeConfig.js:11` (`COMPONENT_NAME_PATTERN`), `js/src/learning/store.js:23`
  (`NAME_PATTERN`). `LearnedTreeTest`'s sync check compares **only** `store.js` against PHP,
  so the other two can drift undetected. A fourth spelling lives in prose at
  `ExportCommand.php:27`'s error message, with the characters in a different order.

Also reported by that audit but **not independently verified here** — treat as leads, not
facts, and re-derive before acting: `InspectCommandTest.php:19-29` (assertions possibly
satisfied by always-registered sibling fixtures rather than the probe under test), a CSS-token
freeze test, a symlink-leak hygiene item, a zero-CLS check, a repeat-sampling test, and
`AriaLiveA11yTest.php` claiming SPEC-A11Y-04 browser coverage in its header while no test in
it touches the announcement region.

**The one vacuity pattern worth internalising above the rest**, because it defeated a guard
written specifically to prevent vacuity: `LearnedTreeTest`'s locale check asserted that
`setlocale()` *returned* a locale name. glibc returns the requested name even when that locale
was never generated, leaving `decimal_point` at `'.'` — so the test passed against `%.2f` and
`%.2F` alike and could never fail for its own bug. **A guard needs the same scrutiny as the
assertions it protects: check whether the world changed, never whether an API reported that it
did.** Same class as the real product bug M7 found in `ghost:export`, where a failed
`file_put_contents()` reported success.

### Honest gaps — real work not done

- **`perf.yml` is an empty placeholder job on `workflow_dispatch`.** There is no performance
  gate at all, confirming from the CI side the item deferred since M3.
- **Four `console.warn` call sites can never fire in the shipped bundle.** Precisely:
  esbuild's `define` folds `process.env.NODE_ENV !== 'production'` to literal `false`, so no
  warning is reachable at runtime — but `build.mjs` sets no `minify`, so the dead
  `if (false) console.warn(...)` branches **still ship as inert text** in
  `resources/dist/ghostwire.js`. "Cannot fire" is true; "stripped from the bundle" is false.
  This defeats the user-facing feedback SPEC-INT-20, SPEC-SEC-02 and FR-61 call for, and makes
  every unit test asserting a warning vacuous *relative to the artifact*. Recommended fix:
  transport a dev flag via `data-ghost` — the server already knows the environment per request.
  No documentation currently promises a warning the bundle cannot emit, except
  `docs-site/.../compat.mdx:10`.
- **Six dead config keys** (above) and **`CHANGELOG.md` self-contradictions**: it states
  method-level `#[Ghost]` "does not yet reach the runtime" in one place while marking the same
  issue closed in another, and lists issues #6/#7 as open while marking them fixed elsewhere.
- **Conflicting security SLAs**: `SECURITY.md` says 5 business days, `security.mdx` says under
  72 hours.
- Two JS charset copies outside drift coverage (above).
- Minor test hygiene: unguarded teardown in a few tests can leak a symlink into the shared
  `vendor/orchestra/testbench-core` skeleton, or a file into temp, on an already-failing
  assertion.
