<?php

// tests/Browser/Performance/ComplexityTest.php
//
// The ruling that reinterpreted the original wall-clock thresholds
// structurally, so a future auditor can trace what changed and why:
//   Sub-quadratic complexity — fixtures of 100/200/400/800 nodes; ratio
//   between reads below 2.5 — enforced here as the same fixtures, same
//   doublings, same 2.5 threshold, applied to layout-read counts instead
//   of times.
//   No long task — nothing above 50ms attributable to synthesis —
//   enforced here in its structural form: work is bounded by the
//   candidate cap (reads at 800 nodes equal reads at 400), so no host can
//   make a synthesis arbitrarily long; the adaptive freeze remains the
//   user-facing guard against a genuinely slow synthesis.
//   Authority: controller ruling R2 of 2026-09-19, recorded in the
//   maintainers' local plan (gitignored, not shipped), per
//   issue #18's analysis that median-of-3/5/7 wall-clock samples all still
//   flaked.
//
// Both tests below enforce this as structural invariants (
// "o orçamento deixou de ser cronométrico"). The measured quantity is the
// number of layout reads (getBoundingClientRect / getComputedStyle /
// Range.getClientRects) the runtime performs in the synchronous show burst —
// the operations that dominate synthesis cost — counted by wrapping the
// browser's own prototypes from the page's main world before the click (see
// gwShowBurstProbeJs() in tests/Pest.php). The count is a deterministic
// function of the fixture DOM, so it cannot drift with GC pauses, engine
// warm-up or runner load — which is exactly what made the previous
// wall-clock version of this file (median-of-7 of
// window.__ghostwireLastSynthesisMs) fail at random under full-suite load
// (issue #18).
//
// The wall-clock signal itself is not gone: js/src/synthesizer/index.js still
// records window.__ghostwireLastSynthesisMs (it feeds the adaptive
// freeze and is useful under a profiler). It is just no longer a CI gate.
//
// Against the /gallery/node-count?nodes=N fixture (unique per-item classes,
// so repeat sampling never engages) the expected shape is: reads grow
// ~linearly up to the 300-candidate cap and are then flat —
// 400 and 800 nodes cost exactly the same, because walk.js stops collecting
// at the cap and measure.js only ever sees collected candidates.

test('layout reads per show cycle grow sub-quadratically with host node count', function () {
    $reads = [];
    foreach ([100, 200, 400, 800] as $count) {
        $reads[$count] = gwShowBurst("/gallery/node-count?nodes={$count}")['reads'];
    }

    foreach ([[100, 200], [200, 400], [400, 800]] as [$from, $to]) {
        $ratio = $reads[$to] / $reads[$from];
        expect($ratio)->toBeLessThan(2.5, "doubling {$from} -> {$to} nodes multiplied layout reads by {$ratio} ({$reads[$from]} -> {$reads[$to]})");
    }
});

test('synthesis work is bounded by the candidate cap — 800 nodes cost exactly what 400 nodes cost', function () {
    $at400 = gwShowBurst('/gallery/node-count?nodes=400')['reads'];
    $at800 = gwShowBurst('/gallery/node-count?nodes=800')['reads'];

    // Capture floor: 300 capped candidates (walk.js MAX_CANDIDATES)
    // x 3 reads each (getComputedStyle + getBoundingClientRect + Range.getClientRects
    // for a text candidate) is the minimum a burst that actually contains synthesis
    // can measure. Those 3 reads per text candidate are an ASSUMPTION about the
    // current measure.js, not a spec bound: an optimisation that legitimately drops
    // one read per candidate must lower this floor deliberately, in the same commit,
    // rather than leave a gate that fails on an improvement.
    // Guards against silent degradation if an async boundary is ever
    // introduced between synthesize() and attachLayer(): the flush would then fire
    // with inShow still false, discard the pre-boundary reads, and the equality
    // below would hold vacuously on a smaller-but-still-bounded number.
    expect($at800)->toBeGreaterThanOrEqual(3 * 300, "burst captured only {$at800} reads for 800 nodes — below the 900-read floor a real synthesis must clear; the equality below would be vacuous otherwise");

    expect($at800)->toBe($at400, "past the 300-candidate cap the per-cycle work must stop growing: 400 nodes -> {$at400} reads, 800 nodes -> {$at800}");
});
