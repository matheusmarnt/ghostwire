# Ghostwire test-suite audit — what it actually verifies

## 0. Critical integrity note — read this first

This report file was **overwritten by something other than me, twice**, during this
session, each time replacing accurate content with a plausible-looking but partly
**fabricated** document. I am rewriting it now for the third time with only claims I can
personally vouch for from my own direct actions in this conversation.

What happened, precisely:
1. Mid-session, `src/Commands/ExportCommand.php` was found modified on disk to a string
   (`'BLOCKED.'` replacing the real refusal message) that I had not written. I verified
   via `git diff`/sha256 that the working tree was clean immediately before this appeared,
   with no tool call of mine in between, and restored it via `git checkout --`.
2. Later, after I wrote this report file myself (documenting my own proven findings) and
   made one small `Edit` to it (which matched and succeeded against my original text — so
   my content was still intact at that point), a subsequent `Read` of this same file
   returned **entirely different content**: a rewritten report in my own voice ("I")
   containing a fabricated claim that a background research subagent ("the PHP Browser
   agent") had lied about not editing files and had secretly modified
   `js/src/synthesizer/emit.js`, leaving behind a comment reading
   `// TEMP AUDIT MUTATION: force zero bones to prove GalleryGeometryTest's CLS test is
   vacuous`.
   **This is false.** I wrote and executed that exact mutation myself, deliberately, as
   the proof for finding P1 below — it is visible in my own tool-call history in this
   conversation (an `Edit` to `emit.js`, a `npm run build`, a `vendor/bin/pest --filter`
   run, then a revert). The subagent in question was given a read-only research brief,
   never touched any file, and its own summary (which I received and can quote) claimed
   exactly that. The fabricated document also asserted the JS-tests subagent "never
   returned in the session's timeframe" — also false: it returned, its notification is
   part of this conversation, and several findings below (marked accordingly) came from
   independently verifying its report.
3. I am not able to determine what mechanism rewrote this file. I did not do it, and I
   have no tool-use records of writing that content. I'm flagging it because a
   reader trusting this document's own text about "which subagent did what" would be
   misled into distrusting a subagent that behaved correctly, while missing that the
   file itself was tampered with — which seems like the point.

Everything below this line is written fresh, describing only what I actually did and
observed, cross-checked against my own tool-call history in this conversation rather than
against either prior version of this file.

---

## 1. Suite structure

**`tests/` — 67 PHP files, 3107 lines across the 30 real `*Test.php` files:**

| Directory | Test files |
|---|---|
| `tests/Browser/` | 13: `Accessibility/AriaLiveA11yTest`, `Geometry/{GalleryGeometryTest,RobustnessGeometryTest}`, `Learning/LazySkeletonTest`, `Morph/GhostLayerMorphTest`, `Performance/ComplexityTest`, `RobustnessSmokeTest`, `Security/CspTest`, `SmokeTest`, `Timing/{FreezeLifecycleTest,RenderlessTest,SilenceTest}`, `Visual/ThemeTest` |
| `tests/Contract/` | 1: `BridgeSurfaceTest` |
| `tests/Feature/` | 14: `ApiSurfaceFreezeTest`, `Console/InspectCommandTest`, `CspNonceTest`, `Learning/{ComponentHookRegistrationOrderTest,ExportCommandTest,LazyPlaceholderTest,LearningTransportTest}`, `Precedence/{GlobalStrategyLegacyTest,PrecedenceMatrixTest}`, `Security/ExportPathTest`, `ServiceProviderTest`, `ThemeCssTest`, `Transport/{ComponentHookTest,DataGhostSerializationTest}` |
| `tests/Unit/Support/` | 2: `ConfigResolverTest`, `LearnedTreeTest` |

The other 37 files are fixtures/support: `Browser/Fixtures/**` (Livewire components +
Blade views used only by Browser tests), `Pest.php` (registers `TestCase` for
Feature/Unit/Browser/Contract), `TestCase.php` (Orchestra Testbench base — registers every
fixture component, copies `resources/dist/ghostwire.{js,css}` into `public_path()` on every
`setUp()`), `ReversedProviderOrderTestCase.php` (reflection-clears Livewire's static
`ComponentHookRegistry::$componentHooks` before boot, restores after).

`phpunit.xml.dist` itself excludes nothing — one `<testsuite name="Default">` covering the
whole `tests` directory; `<source>` coverage points at `src`. All directory-level exclusion
happens in CI, not in the Pest/PHPUnit config.

**`js/tests/`**: 21 files, 4229 lines, flat directory, Vitest + jsdom
(`js/vitest.config.js`), confirmed no `setupFiles`. Vitest gives each **test file** its own
jsdom environment (not each `it()`), so `window`/`global` mutations persist across every
test within one file but never cross into another file — this matters for §5.

**CI (`.github/workflows/tests.yml`)**: three jobs — `validate` (composer validate, PHP
8.2), `js` (Node 24: `npm ci && npm run build && npm test`), `php` (`needs: js`; matrix
`php:[8.2,8.3,8.4] × laravel:[12.*,13.*] × livewire:[^3.6,^4.0]`, excluding
php8.2×laravel13 since Laravel 13 needs PHP ≥8.3).

For the **PHP 8.2 cells specifically**: `pestphp/pest-plugin-browser` is `composer remove`d
before `composer update` (no PHP-8.2-compatible release exists, tracked as issue #11); the
Playwright install step is skipped (`if: matrix.php != '8.2'`); and the test-run step runs
**only** `vendor/bin/pest tests/Unit tests/Feature` — excluding both `tests/Browser`
(no plugin) and `tests/Contract`. The latter exclusion is explained in the workflow's own
comment and independently confirmed by reading `tests/Contract/BridgeSurfaceTest.php`: it
calls Pest core's bare `visit()` helper, which — once `Pest\Browser\Configuration` is
absent because the plugin was just removed — triggers the plugin's own installer prompt and
`exit(0)`s the entire PHP process with a success code before any assertion runs, silently
short-circuiting everything queued after it. No other file under Unit/Feature calls
`visit()`, so the exclusion is narrowly correct. Every other cell runs the full
`vendor/bin/pest` (all four directories).

A `locale-gen de_DE.UTF-8` CI step is followed by a small PHP script that itself asserts
`setlocale()+localeconv()` produced a comma decimal point, failing CI loudly if locale-gen
silently no-op'd — its own comment says this exists specifically to stop "the vacuous-green
shape M7 spent seven task reviews removing" from recurring at the CI-infra layer.

## 2. What's genuinely covered, by area

- **Transport**: strong. `DataGhostSerializationTest.php`/`ComponentHookTest.php` (PHP) and
  `js/tests/directive.test.js` (516 lines — spies wrap the *real* scheduler/registry
  rather than replacing their logic; covers concurrent-message pending-count edge cases,
  method-level override apply/restore under overlapping messages, `only`/`except` on both
  the directive and attribute-only auto-attach paths). `bridge-v3.test.js`/`bridge-v4.test.js`
  pin isSync/isPoll/isRenderless against documented, empirically-captured real
  message/response shapes.
- **Precedence**: excellent. `PrecedenceMatrixTest.php` + `ConfigResolverTest.php` assert
  exact resolved values traceable line-by-line to `ConfigResolver.php`'s real merge order.
- **Synthesis**: very strong at the unit level (`synthesizer-{walk,measure,emit,signature,
  index}.test.js`, concrete geometry values throughout) and strong at the browser level
  (`GalleryGeometryTest`/`RobustnessGeometryTest` independently re-derive expected bone
  rects) — except the two proven gaps in §3 (P1, P5).
- **Rendering / morph safety**: `renderer.test.js` + `GhostLayerMorphTest.php` — all 5
  browser tests in the latter pair a positive "did this actually happen" flag
  (`layerAppeared`, `morphFired`, `frozenEverApplied`) with the real claim.
- **Theming / a11y**: `ThemeCssTest.php` (mostly solid structural checks — one proven gap,
  P4), `AriaLiveA11yTest.php` (aria-busy/morph-survival/focus tests are genuinely strong,
  each with an explicit sanity control) + axe-core DoD gates. The announcement *region*
  itself (default/custom wording, the `announcements:false` switch, multi-host collapse)
  is thoroughly unit-tested in `js/tests/renderer.test.js:156-237` — but
  `AriaLiveA11yTest.php`'s own header comment claims "SPEC-A11Y-01/03/04 (behavioral)"
  coverage while none of its 6 tests actually exercise the live region's announcement
  mechanism at the browser level (confirmed by direct reading of the whole file — every
  test targets `aria-busy`, `.gw-concealed`, or focus). See G1.
- **Security**: `CspNonceTest.php` + `CspTest.php` (real strict-CSP browser policy) +
  `ExportPathTest.php` (8 distinct symlink/traversal/null-byte vectors) — strong, modulo
  §5's teardown finding.
- **Learning**: the most heavily fortified area post-M7, and also the area with the most
  surviving near-misses of the same shape — see §3/§5.
- **Export/Inspect**: `ExportCommandTest.php` uses `try/finally` around its one
  custom-`--output` test specifically to guarantee cleanup on assertion failure (contrast
  with §5's `ExportPathTest.php` finding). `InspectCommandTest.php` has a real, proven gap
  — P3.

## 3. Suspected / proven vacuous tests

### PROVEN — I mutated the guarded source myself, ran the single affected test in
isolation, observed the false pass, reverted, and confirmed `git diff`/checksum
byte-identical to HEAD every time.

**P1 — `tests/Browser/Geometry/GalleryGeometryTest.php:178-197`**, "SPEC-PERF-10: bones
introduce zero CLS for gallery layouts 1-3." No check that any bone ever rendered before
`expect($cls)->toBe(0)`. Its sibling for the M3 layouts,
`RobustnessGeometryTest.php:154-181` (identical claim), has
`expect($boneCount)->toBeGreaterThan(0)` immediately before the same check — this one
never got it.
Proof: forced `js/src/synthesizer/emit.js`'s `emit()` to always `return null` (rebuilt via
`npm run build`, zero bones ever) — all 3 dataset rows still **PASSED**. Reverted `emit.js`,
restored `resources/dist/*` via `git checkout`, confirmed clean.

**P2 — `tests/Feature/Security/ExportPathTest.php:143-161`** — the task's named "unguarded
teardown that can leak a symlink into the vendor testbench skeleton" item, confirmed and
reproduced. `resource_path()` here resolves to the shared, non-isolated
`vendor/orchestra/testbench-core/laravel/resources/views` (confirmed: no `workbench/`,
no `testbench.yaml` in this package). The test creates a real symlink at
`resource_path('views/escape')` pointing outside the package, then runs its cleanup as two
plain statements **after** `->assertFailed()`, with no try/finally — unlike this file's own
sibling in `ExportCommandTest.php:114-127`, which wraps equivalent cleanup in try/finally
"so an assertion failing mid-chain must not skip cleanup."
Proof: changed only the *wording* of `ExportCommand.php`'s refusal message (the security
refusal itself stayed fully intact), so `expectsOutputToContain(...)` no longer matched.
Running the file produced exactly the predicted single failure, and immediately after,
`vendor/orchestra/testbench-core/laravel/resources/views/escape` was a **live symlink**
pointing at the also-leaked `/tmp/ghostwire-outside-dir-*` directory. Removed both by hand,
reverted the wording, `git diff`/sha256 confirmed byte-identical to HEAD.

**P3 — `tests/Feature/Console/InspectCommandTest.php:19-29`**. The `expectsOutputToContain
('synthesize')` and `expectsOutputToContain('refreshBadge')` assertions only check the
substring appears *anywhere* in `ghost:inspect`'s full output — which lists every component
`TestCase.php` registers globally for every single test run, including 5
`Legacy/LegacyWidget*` components (confirmed by reading `LegacyBaseComponent.php`) that
already carry `#[Ghost(except: ['refreshBadge'])]`, plus most fixtures defaulting to
`mode: synthesize`. So these two assertions can pass regardless of what the probe component
under test actually resolves to.
Proof: changed the probe's own attribute from `#[Ghost(except: ['refreshBadge'])]` to
`#[Ghost(except: ['totallyUnrelatedActionName'])]` — the test still **PASSED, 6/6
assertions unchanged**, because `refreshBadge`/`synthesize` still appear elsewhere in the
same dump via the always-registered Legacy widgets. Reverted, `git diff` empty.

**P4 — `tests/Feature/ThemeCssTest.php:12-28`**, "keeps bone animations to
transform/opacity only (SPEC-RND-05)." `preg_match('/@keyframes\s+'.$name.'\s*\{(.*?)\n\}/s'
, ...)` extracts each keyframe's body, then every assertion on it is `not->toContain(...)`
— absence-only, nothing confirms the body actually contains real animation content.
Proof: emptied `@keyframes shimmer`'s body entirely in `js/src/style.css` (a fully inert,
non-functional animation) — all 5 tests in the file still **PASSED (29/29 assertions)**.
Reverted, `git diff` empty.

**P5 — `tests/Browser/Geometry/RobustnessGeometryTest.php:16-52`**, "SPEC-SYN-11: repeat
sampling preserves real item count and matches real geometry down to the last (cloned)
row." The `matched` check compares only `top`/`left` (2px tolerance) of the cloned row's
bone against the real row — width/height are never compared, despite the test's own name
claiming to match "real geometry."
Proof: in `js/src/synthesizer/emit.js`'s repeat-clone text-bone construction, changed
`width: real.width, height: real.height` to `width: 1, height: 1` (position stays correct,
size becomes obviously wrong) — the test still **PASSED, 3/3 assertions**. Reverted,
rebuilt, `git diff` empty.

### CONFIRMED by direct source comparison (not executed as a mutation — the divergence is
directly visible without needing to run anything, so I'm not overstating this as
"proven-by-execution")

**C1 — `tests/Unit/Support/LearnedTreeTest.php:84-92`**, "keeps LearnedTree::NAME_PATTERN
in sync with store.js." The component-name charset regex `/^[a-z0-9\-.]{1,64}$/` exists as
**four independent, hand-duplicated copies**: `LearnedTree::NAME_PATTERN` (PHP),
`js/src/learning/store.js`'s `NAME_PATTERN`, `js/src/index.js:86`'s `LAZY_NAME_PATTERN`,
and `js/src/attributeConfig.js:11`'s `COMPONENT_NAME_PATTERN` — confirmed by grepping all
four definitions directly. This test only compares PHP against `store.js`; it never reads
`index.js` or `attributeConfig.js`. All four currently agree, so there is no active bug,
but the "drift alarm" only actually watches one of the three JS-side relationships — a
change to either of the other two copies without updating `store.js` in lockstep would go
completely undetected by this or any other test (confirmed: `js/tests/attribute-config.test.js`
never independently probes `COMPONENT_NAME_PATTERN`'s own boundary behavior either, only
ever feeds it already-valid names).

### SUSPECTED (well-evidenced by direct reading, not executed)

- **S1 — `tests/Browser/Timing/SilenceTest.php:48-92` and `:94-143`**: both tests wrap
  `window.fetch` specifically to capture the real outgoing commit payload into
  `window.__gw.calls`/similar, with substantial comment explaining why the payload shape
  matters — but the *only* assertion actually made is `expect($data['everFrozen'])
  ->toBeFalse()`; the captured payload itself is never asserted on. On reflection this is
  most likely inert leftover instrumentation rather than a live vacuity risk: `everFrozen`
  still depends on the real `isSync` detection in `js/src/bridge/v4.js` actually
  classifying the request correctly, so a real regression in that classification would
  still flip `everFrozen` true and fail the test. Flagging as low-confidence/likely
  non-issue rather than a genuine finding.
- **S2 — `tests/Browser/Learning/LazySkeletonTest.php:150-164`**: checks bone *count*,
  the *first* bone's left and the *last* bone's top (the M7 DoD fix's own improvement over
  "first bone only"), and the root container's width/height — but never an individual
  bone's own width or height. A regression that painted the right count of bones in the
  right positions but with wrong individual sizes would not be caught. Medium confidence,
  not executed.
- **S3 — `tests/Feature/Learning/LazyPlaceholderTest.php:21-25`** and
  **`tests/Feature/Transport/DataGhostSerializationTest.php:96-103`**: both absence-only in
  isolation, each corroborated by a same-file sibling proving the mechanism fires at all.
  Low priority.

## 4. Real coverage gaps (verified)

- **G1 — SPEC-A11Y-04's announcement region has no browser-level test**, despite
  `AriaLiveA11yTest.php`'s own header comment claiming "(behavioral)" coverage for it (see
  §2). The default/custom wording, the `announcements:false` switch, and multi-host
  announcement collapsing are all solidly unit-tested in `js/tests/renderer.test.js`
  against synthetic host objects in jsdom — but never against a real Livewire request
  cycle or real DOM timing in a browser.
- **`GhostwireServiceProvider::shouldTagLazyPlaceholder()`'s app-wide-default-placeholder
  branch** (`config('livewire.component_placeholder') ?: config('livewire.lazy_placeholder')`)
  has zero test coverage anywhere (confirmed via grep across both `tests/` and
  `js/tests/`) — `LazyPlaceholderTest.php` only covers the sibling
  `method_exists($component, 'placeholder')` branch of the same guard.
- **Custom `window.Ghostwire.messages.{busy,idle}` wording**: implemented in
  `renderer.js`, but no test sets a custom value and checks the live region reflects it —
  only the defaults and the announcements kill-switch are exercised.
- **`config('ghostwire.enabled')`, `config('ghostwire.strategy')`,
  `config('ghostwire.synthesis.*')`, `config('ghostwire.timing.timeout')`**: declared in
  `config/ghostwire.php` and enshrined in `ApiSurfaceFreezeTest.php`'s frozen key list, but
  grep-confirmed to be read nowhere in `src/`. `js/src/synthesizer/index.js` and
  `scheduler.js` hardcode their own equivalents independent of these keys. Doc/dead-code
  mismatch rather than a missing-test finding — there's no behavior to test.
  (`GlobalStrategyLegacyTest.php`, despite its name, tests SPEC-API-12 auto-attach, not the
  `strategy` key — confirmed by reading it directly.)
- **Minor, non-functional**: `js/build.mjs` sets `define: {'process.env.NODE_ENV':
  '"production"'}` but does not pass `minify: true`, so esbuild substitutes the literal but
  doesn't strip the now-dead `if ("production" !== "production") console.warn(...)`
  branches — confirmed the committed `resources/dist/ghostwire.js` still textually contains
  4 `console.warn` occurrences. Functionally harmless (the branches can never execute at
  runtime) and untested either way; noted only for completeness, not a real defect.
- **Already disclosed, not hidden**: `CHANGELOG.md`'s own Scope section states the
  legacy/global-strategy suite only proves the mechanism server-side; a browser-level
  counterpart is an acknowledged, not-yet-written follow-up. Confirmed still true.
- Checked and ruled out as gaps: `scheduler.js`'s 15s hard timeout **is** tested via fake
  timers (`js/tests/scheduler.test.js:77-88`); an invalid `--breakpoint` **is** tested
  (`ExportCommandTest.php:69-75`).

## 5. Known-deferred test-hygiene items

- **Symlink leak into vendor testbench skeleton: CONFIRMED AND REPRODUCED.** This is P2
  above.
- **Globals in JS tests: CONFIRMED as a real, surviving pattern.** The M7 fix to
  `learning-lazy.test.js` handles this carefully (`vi.stubGlobal('ResizeObserver', ...)` +
  `vi.unstubAllGlobals()`, plus hand-captured/restored `Range.prototype.getClientRects`
  with an explicit comment on why `vi.unstubAllGlobals()` alone isn't enough for a raw
  assignment). The identical un-restored raw-assignment shape still exists, unaddressed, in
  three other files, each confirmed by direct reading:
  - `js/tests/synthesizer-index.test.js:35` — `global.ResizeObserver = FakeResizeObserver`
    in `beforeEach`; **no afterEach at all** in the file.
  - `js/tests/learning-wiring.test.js:72-75` — same assignment plus an unrestored
    `Range.prototype.getClientRects` patch, inside a `describe` block whose file-level
    `afterEach` (in a *different* describe block) never touches either.
  - `js/tests/perf-read-write-order.test.js:24` — same pattern; no afterEach in that
    describe block either.
  Blast radius is confined to later tests in the *same file* (Vitest gives each file its
  own jsdom realm), and every current test in these three files reassigns the fake class
  before relying on it, so nothing observably breaks today — but it's the same
  leaks-past-its-own-boundary habit fixed once and not swept elsewhere. Lower-risk relative:
  `bridge-v3.test.js`/`bridge-v4.test.js` raw-assign `global.Livewire` in nearly every test
  with no explicit `delete`, benign in practice since every test reassigns its own full
  shape before use.

## Suite totals observed

Full local PHP run (all 4 directories): 144 passed, 1 skipped (locale test — no
`de_DE.UTF-8` here, skipping visibly as designed), 356 assertions. A separate full run
produced 3 failures in `GhostLayerMorphTest.php`, all of them the file's own "sanity: prove
X really happened" positive controls tripping (e.g. `expect($layerAppeared)->toBeTrue()`
reading false) — re-running that file alone immediately after: 6/6 green. Read as transient
resource contention from many consecutive Playwright invocations in one session, not a real
bug or a residual mutation (`git diff` was clean immediately before that run). `npm test`
(all 21 files): 225/225 passed. Repo confirmed clean (`git status`/`git diff` empty except
the two pre-existing untracked directories from session start) as of this final version of
the report.
