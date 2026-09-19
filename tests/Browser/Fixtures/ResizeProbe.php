<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Component;

// Issue #21 fixture for tests/Browser/Geometry/ResizeRepositionTest.php. The
// hold is deliberately long: it keeps the skeleton visible across a viewport
// resize with no message in flight, so the resize path is the ONLY thing that
// can move the Ghost Layer during the assertion window (onPostPaint, the one
// other caller that repositions it, has already run and cannot run again).
//
// Two config choices below were forced by real bugs found live while building
// this fixture (Task 3, 2026-09-19 plan) — both pre-existing, both unrelated
// to #21 itself, both out of this task's scope (js/src is off-limits):
//
// 1. `hold: 4000` is declared via #[Ghost(...)], not a wire:ghost.hold.4000ms
//    modifier. Confirmed live: Livewire's own directive parser
//    (vendor/livewire/livewire/dist/livewire.esm.js extractDirective:
//    `name.split('.')`) splits "hold.4000ms" into TWO modifier tokens, "hold"
//    and "4000ms" — neither matches parseModifiers' TIMED_MODIFIER_PATTERN
//    (js/src/index.js), which expects them combined as one token. So the
//    wire:ghost.hold.Nms / .delay.Nms modifier form is dead code in the
//    shipped runtime (the skeleton tore down at ~500ms, the 300ms package
//    default, instead of holding to 4000ms). #[Ghost(...)]'s data-ghost
//    transport reaches the same `hold` config correctly (already covered by
//    tests/Unit/Support/ConfigResolverTest.php and
//    tests/Feature/Precedence/PrecedenceMatrixTest.php).
//
// 2. `rows: 3` is required for the resize-triggered re-synthesis to produce
//    ANY bones at all, for a much deeper reason: .gw-concealed sets
//    `visibility: hidden` on the host, which every descendant — including
//    this fixture's <p> rows — computes as `visibility: hidden` too (CSS
//    inheritance; confirmed live via getComputedStyle on a live page).
//    js/src/synthesizer/emit.js's isVisible() filters out any candidate whose
//    computed visibility is 'hidden' (SPEC-SYN-12), so a re-synthesis that
//    runs WHILE the host is concealed — i.e. any resize during any skeleton's
//    normal visible lifetime, not just a long hold — always measures zero
//    visible candidates. emit() then returns null, and js/src/index.js's
//    onResize handler treats that as "degrade": it tears the layer down
//    entirely (renderer.removeLayer + freeze) instead of ever reaching the
//    repositionLayer call Task 1 added — that call sits on the `if
//    (boneTree)` branch, which this always-null path never takes. Confirmed
//    with `rows` unset: the real (all-<p>) skeleton mounts fine at show time
//    (synthesized BEFORE concealment is applied), then is fully torn down
//    within ~100ms of any resize while still concealed, on the CURRENT
//    (post-Task-1) bundle. No existing browser test ever caught this because
//    this fixture's is the first to call $page->resize() at all, and
//    js/tests/resize-reposition.test.js's jsdom harness never loads the real
//    ghostwire.css, so .gw-concealed's `visibility: hidden` never actually
//    applies there either — the unit test's mocked getComputedStyle always
//    reports 'visible', masking the bug.
//    `rows: 3` sidesteps this without touching js/src: emit.js's
//    SPEC-SYN-17 empty-host fallback (`rowsHint > 0`) returns synthetic rows
//    sized from the host's freshly-read rect regardless of any candidate's
//    visibility, so boneTree is non-null, the reposition/renderBones branch
//    runs, and the test genuinely exercises Task 1's fix. This is a real,
//    separate, still-open bug worth its own follow-up issue — see the Task 3
//    report (.superpowers/sdd/2026-09-19-fix-issues-18-21/task-3-report.md)
//    for the full repro.
#[Ghost(hold: 4000, rows: 3)]
class ResizeProbe extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay, same as every other fixture
        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::resize-probe');
    }
}
