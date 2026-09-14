# Lead re-derivation — the unverified vacuity leads (Task 8)

The 2026-09-12 test audit flagged these leads by *reading*, not by mutation, and its
own report says so explicitly: "its findings are leads, not facts." Each one below
was re-derived by mutating the source behaviour the test's name claims to guard and
observing whether the test actually noticed. C1 is confirm-only per the brief (Task 7
already fixed and mutation-verified it).

Note on count: the brief's task title says "six" leads; the brief's own list contains
eight entries (P1, P3, P5, C1, S1, S2, S3, G1). C1 is explicitly "already fixed —
confirm and skip," leaving **seven** requiring re-derivation, not six. This is a
pre-existing discrepancy in the brief, not something resolved here; all eight items
were still worked per the brief's literal per-item instructions.

Verdict tally: **4 CONFIRMED** (P1, P3, P5, G1) — all four fixed and mutation-verified.
**3 FALSE** (S1, S2, S3) — all three genuinely discriminate; nothing changed.
**1 confirmed-by-reading, not by fresh mutation** (C1, per the brief's own instruction).

---

## P1 — `tests/Browser/Geometry/GalleryGeometryTest.php` SPEC-PERF-10 (zero-CLS)

**Verdict: CONFIRMED (vacuous) — fixed.**

The guarded claim: bones introduce zero Cumulative Layout Shift. The test relies
entirely on the browser's own `PerformanceObserver({type:"layout-shift"})` metric.

**Mutation:** `js/src/style.css` `.gw-concealed { visibility: hidden; }` →
`.gw-concealed { display: none; }` (a real, textbook cause of CLS in general — the
host's box collapses instead of merely losing paint).

**Command:** `npm run build && vendor/bin/pest tests/Browser/Geometry/GalleryGeometryTest.php`

**Observed:** SPEC-PERF-10 (the CLS assertion) **stayed green across all 3 layouts**
even though 4 sibling tests in the same file correctly broke (SPEC-SYN geometry ×3,
SPEC-MORPH-03's `visibility` check) — proving the mutation was real and took effect.
`expect($cls)->toBe(0)` simply never saw anything.

**Follow-up diagnostic** (temporary test file, deleted before commit, not part of the
evidence itself but supporting it): instrumented a raw dump of every layout-shift
entry (`value`, `hadRecentInput`) for `/gallery/card-grid`'s refresh interaction under
the same `display:none` mutation. Result: `entries: []` — **zero entries at all**,
not merely entries excluded by the `hadRecentInput` filter. The browser's own metric
cannot see a regression here regardless of implementation, on this fixture.

**Fix:** added a direct geometric assertion alongside the existing CLS check — sample
the host's own `getBoundingClientRect()` every animation frame throughout the
interaction and assert the largest deviation from its click-time rect is ≤2px. This
encodes the actual mechanism (`visibility: hidden` preserves the box) directly,
independent of whether the browser chooses to report a shift.

**Fix verification:**
- Clean (unmutated): 7 passed, 19 assertions.
- Mutated (`display:none` re-applied): `Failed asserting that 1712 is equal to 2 or
  is less than 2.` at the new `hostDelta` assertion — decisively caught.
- Reverted, rebuilt, re-confirmed clean: 7 passed, 19 assertions.

---

## P3 — `tests/Feature/Console/InspectCommandTest.php` (`expectsOutputToContain`)

**Verdict: CONFIRMED (vacuous) — fixed.**

The audit's suspicion: assertions might be satisfied by always-registered sibling
fixtures rather than the probe under test. `tests/TestCase.php` registers the probe
**plus 14 other fixtures** for every test, including five `LegacyWidget{One..Five}`
components that all inherit `#[Ghost(except: ['refreshBadge'])]` from
`LegacyBaseComponent` — an identical `except` value to the probe's own.

**Mutation:** `src/Support/ConfigResolver.php`'s `resolveWithProvenance()` — forced
the `'class'` precedence level (the concrete class's own declared `#[Ghost]` args) to
always be `[]`, i.e. completely broke `InspectProbeComponent`'s own
`except: ['refreshBadge']` resolution, while leaving the `'inherited'` level (what the
Legacy widgets use) untouched.

**Command:** `vendor/bin/pest tests/Feature/Console/InspectCommandTest.php`

**Observed:** test still **PASSED** (1 passed, 6 assertions) — `refreshBadge` was
still found somewhere in the full command output, supplied by the always-registered
Legacy widgets, not by the probe's own (now-broken) resolution.

**Fix:** added an anchored assertion — capture the full command output via
`Artisan::call()`/`Artisan::output()`, slice out only `inspect-probe`'s own printed
block (`Component: inspect-probe` up to the next `Component:` line), and assert
`refreshBadge` appears **inside that block specifically**.

**Fix verification:**
- Clean (unmutated): 1 passed, 8 assertions.
- Mutated (`'class' => []` re-applied): `Failed asserting that 'Component:
  inspect-probe\n  Class: InspectProbeComponent\n  mode: synthesize (default)\n...
  (10 more lines)' contains "refreshBadge".` at the new anchored assertion —
  decisively caught.
- Reverted, re-confirmed clean: 1 passed, 8 assertions.

---

## P5 — `tests/Browser/Geometry/RobustnessGeometryTest.php` SPEC-SYN-11 (repeat sampling)

**Verdict: CONFIRMED (vacuous on the position-only check) — fixed.**

The guarded claim: cloned/unsampled repeat-list rows "match real geometry down to the
last (cloned) row," not just an approximated position.

**Mutation attempt 1 (inert — recorded for honesty):** `js/src/synthesizer/emit.js`
zeroed the pitch-translation `dy` used for cloned bones. Test still passed. Reading
the code afterward explained why: for text-type repeat items (this fixture's rows),
`emit()` always prefers a **real per-row measurement** (`extraTextRects`) over
pitch-translation; pitch is only a fallback when no real measurement exists. `dy` was
dead for this fixture — this mutation didn't test what I intended, so it doesn't
count as evidence either way.

**Mutation attempt 2 (decisive):** forced the real-measurement branch off entirely
(`if (real)` → `if (false && real)`), so every cloned row falls through to pure
pitch/template translation.

**Command:** `npm run build && vendor/bin/pest tests/Browser/Geometry/RobustnessGeometryTest.php`

**Observed:** test still **PASSED** (6 passed, 12 assertions) — `matched` (last row's
bone within 2px of the real row's top/left) stayed true. Rows are uniform height (a
precondition for repeat-sampling to trigger at all), so pitch-translated *position*
is geometrically indistinguishable from real per-row measurement here. Position alone
cannot tell "used the real measurement" apart from "just translated the template."

**Fix:** added a `widthMatched` assertion. The fixture's rows are `"Row 1"`..`"Row
12"` — different text lengths — so a cloned bone using the template's own width
("Row 3", the last *sampled* row) instead of its own real width ("Row 12") is
detectably wrong. First attempt at this fix measured the real row via
`element.getBoundingClientRect()` on the `<li>` — this **failed even on clean,
unmutated source** (`Failed asserting that 0 matches expected 36`-style: actually a
width mismatch), which turned out to be a bug in my own probe, not the runtime: a
`<li>` is block-level and stretches to the full `<ul>` width regardless of text
content, so it can never discriminate row lengths. Corrected to measure the row's own
**text node** via `Range.getClientRects()` — the same technique the runtime itself
uses (`measureTextLines`/`measureShallowTextBones`) — which does vary with content.

**Fix verification:**
- Clean (unmutated, corrected probe): 6 passed, 13 assertions.
- Mutated (real-measurement branch disabled): `Failed asserting that false is true.`
  at the new `widthMatched` assertion, while `matched` (position) still passed —
  decisively caught, and shows exactly why a width-blind check couldn't.
- Reverted, rebuilt, re-confirmed clean: 6 passed, 13 assertions.

---

## C1 — the charset drift alarm (confirm-only, per the brief)

**Verdict: confirmed already fixed by Task 7 — no fresh mutation performed, per the
brief's explicit instruction ("already fixed by Task 7; confirm and skip").**

Located the alarm: `tests/Unit/Support/LearnedTreeTest.php:115` —
`expect($copies)->toBe(1, 'the component-name charset must have exactly one
definition in js/src/; import it, do not re-spell it');`, counting
`substr_count()` occurrences of the shared pattern body across every file in
`js/src/`, matching Task 7's commit message (`5a70e5b`) exactly: "the alarm asserts
the number of definitions in js/src/ rather than the value of one of them."

Task 7's own commit message already records its own mutation verification: "re-adding
a second copy (under an unrelated name, anywhere in js/src/) fails the alarm -
'Failed asserting that 2 is identical to 1.' Removing it passes again." I did not
repeat that mutation myself — this verdict rests on reading the current source (the
assertion is exactly what Task 7's commit claims) plus re-running the existing test.

**Command:** `vendor/bin/pest tests/Unit/Support/LearnedTreeTest.php`

**Observed:** 20 passed, 1 skipped (the known `de_DE.UTF-8` locale skip) — including
"it keeps LearnedTree::NAME_PATTERN in sync with store.js (Ruling A)," which contains
the `$copies` assertion.

**This lead was resolved by reading + re-running, not by a fresh mutation of my own —
flagged explicitly per the task's self-review requirement.**

---

## S1 — `tests/Browser/Timing/SilenceTest.php` (SPEC-API-20 silence)

**Verdict: FALSE — not vacuous. No change.**

**Mutation:** `js/src/bridge/v4.js`'s `isSync` check —
`actionNames.length === 0 || actionNames.every((name) => name === '$set' || name === '$commit')`
→ `actionNames.length === 0` (drop the `$set`/`$commit` recognition this file's own
header comment describes as a real gap it found and fixed).

**Command:** `npm run build && vendor/bin/pest tests/Browser/Timing/SilenceTest.php`

**Observed:** **both** tests failed —
`it does not activate any host for a sync-only message with no action calls
(SPEC-API-20)`: `Failed asserting that true is false.` at `expect($data['everFrozen'])
->toBeFalse();`, and the same failure for the wire:model.live test. Both assertions
genuinely depend on the mutated line.

**Reverted, rebuilt, re-confirmed clean:** 2 passed, 2 assertions.

---

## S2 — `tests/Browser/Learning/LazySkeletonTest.php:150-164` (bone geometry)

**Verdict: FALSE — not vacuous. No change.**

The audit's original claim was "checks bone count only." Reading the current file
first showed this: the lines the audit cited already contain `firstLeft`/`lastTop`/
`width`/`height` `toEqualWithDelta` checks, not just a bone-count check — the file's
own comments cite a prior "review Finding 2" that appears to have already fixed
exactly this. Re-derived by mutation anyway, per the brief, rather than trusting that
reading.

**Mutation:** `js/src/renderer.js`'s `paintBones()` — hardcoded every bone's
`el.style.top` to `'0px'`, discarding each bone's real vertical position (count and
horizontal position untouched).

**Command:** `npm run build && vendor/bin/pest tests/Browser/Learning/LazySkeletonTest.php`

**Observed:** `it paints a learned skeleton into a lazy placeholder before any
content exists (SPEC-LRN-02, M7 DoD)` failed: `Failed asserting that 0 matches
expected 36.` at `expect($early['lastTop'])->toEqualWithDelta($expected['lastTop'],
1.0);` — exactly the line the file's own comment predicts would catch this class of
regression ("the first bone's y is ~0 by construction... The last row is not").

**Reverted, rebuilt, re-confirmed clean:** 3 passed, 23 assertions.

---

## S3 — `tests/Feature/Learning/LazyPlaceholderTest.php:21-25`

**Verdict: FALSE — not vacuous. No change. (Includes a corrected initial hypothesis — see below.)**

Test: "does not tag a lazy component that never opted in via `#[Ghost(lazy: true)]`,"
using `Livewire::test(DemoTable::class, ['lazy' => true])` — `DemoTable` has no
`#[Lazy]` attribute and no `#[Ghost]` at all.

**Initial (wrong) hypothesis from reading:** Livewire's own
`SupportLazyLoading::mount()` only enters the lazy/placeholder path when the
component class carries `#[Lazy]`, so I initially expected this test not to exercise
`shouldTagLazyPlaceholder()`'s gate at all (a vacuous "passes for an unrelated
reason"). This was reached by reading `vendor/livewire/livewire/src/Features/
SupportLazyLoading/SupportLazyLoading.php` starting partway into `mount()` and
missed an earlier line.

**Mutation (run anyway, per protocol):** `src/GhostwireServiceProvider.php`'s
`shouldTagLazyPlaceholder()` — inverted the resolved-`lazy` condition (`if (!
resolve(...)['lazy'])` → `if (resolve(...)['lazy'])`).

**Command:** `vendor/bin/pest tests/Feature/Learning/LazyPlaceholderTest.php`

**Observed:** all it takes to see the hypothesis was wrong: **the DemoTable test
failed too**, alongside the LazyOrdersTable test —
`Expecting '<div wire:key="...">...</div>' not to contain 'data-ghost-lazy'.` at
`expect($html)->not->toContain('data-ghost-lazy');`. Re-reading
`SupportLazyLoading.php` from its actual start revealed the real mechanism: line 54,
`if (isset($params['lazy']) && $params['lazy']) $shouldBeLazy = true;` — the
`['lazy' => true]` test param drives the lazy/placeholder mount path directly,
independent of the `#[Lazy]` attribute. So `shouldTagLazyPlaceholder()`'s gate *is*
reached for `DemoTable`, and inverting it does make the (unmutated-source-correct)
"never tag" case start tagging — caught correctly.

This is exactly the scenario the task brief warns about: a lead resolved by reading
alone would have been wrong here. The mutation is what actually settled it.

**Reverted, re-confirmed clean:** 3 passed, 4 assertions.

---

## G1 — `tests/Browser/Accessibility/AriaLiveA11yTest.php` (SPEC-A11Y-04 header claim)

**Verdict: CONFIRMED (the header over-claims coverage) — fixed by adding the missing assertion.**

**Check (per the brief, not a source mutation):**
`grep -n 'aria-live\|announce\|role="status"' tests/Browser/Accessibility/AriaLiveA11yTest.php`
→ **no matches**. The file's own header comment claims SPEC-A11Y-04 browser coverage;
nothing in it touches the announcement region. `js/src/renderer.js` does implement
one (`ensureLiveRegion()`: `aria-live="polite"`, `role="status"`, `.gw-sr-only`;
`announce()` called from `markBusy()`/`clearBusy()` with `"Loading"`/`"Content
updated"`).

Per the brief: "prefer adding the assertion; deleting a coverage claim to make it
true is the cheaper lie." Added the assertion.

**Fix:** new test `SPEC-A11Y-04: the live region announces Loading then Content
updated` — drives the same `#refresh-btn` interaction the sibling aria-busy tests in
this file already use, observes `[role="status"][aria-live="polite"]`'s text
transitioning from `"Loading"` to `"Content updated"`.

**Fix verification:**
- Clean (unmutated): 9 passed, 21 assertions (all pre-existing tests in the file
  unaffected).
- **Mutation:** `js/src/renderer.js`'s `announce()` — made it an unconditional
  no-op (`return;` as the first line). Re-ran:
  `Failed asserting that false is true.` at
  `expect($data['hasRegion'])->toBeTrue();` — the new test failed; **all 8 other
  tests in the file stayed green**, confirming the mutation was scoped correctly to
  only the announcement mechanism.
- Reverted, rebuilt, re-confirmed clean: 9 passed, 21 assertions.

---

## Files changed (fixes only — all mutations reverted before commit)

- `tests/Browser/Geometry/GalleryGeometryTest.php` (P1)
- `tests/Feature/Console/InspectCommandTest.php` (P3)
- `tests/Browser/Geometry/RobustnessGeometryTest.php` (P5)
- `tests/Browser/Accessibility/AriaLiveA11yTest.php` (G1)

No `src/` or `js/src/` file has any diff from `HEAD` — confirmed with
`git diff --stat` after every revert, and again for the whole tree before commit.
`resources/dist/*` also has no diff (every `npm run build` after a revert reproduced
the committed artifact byte-for-byte per `git diff`).
