<?php

// tests/Browser/Performance/ComplexityTest.php
//
// SPEC-PERF-03 / SPEC-PERF-04, enforced as structural invariants (ADR-007:
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
// records window.__ghostwireLastSynthesisMs (it feeds SPEC-PERF-07's adaptive
// freeze and is useful under a profiler). It is just no longer a CI gate.
//
// Against the /gallery/node-count?nodes=N fixture (unique per-item classes,
// so SPEC-SYN-11 sampling never engages) the expected shape is: reads grow
// ~linearly up to SPEC-SYN-13's 300-candidate cap and are then flat —
// 400 and 800 nodes cost exactly the same, because walk.js stops collecting
// at the cap and measure.js only ever sees collected candidates.

test('SPEC-PERF-03: layout reads per show cycle grow sub-quadratically with host node count', function () {
    $reads = [];
    foreach ([100, 200, 400, 800] as $count) {
        $reads[$count] = gwShowBurst("/gallery/node-count?nodes={$count}")['reads'];
    }

    foreach ([[100, 200], [200, 400], [400, 800]] as [$from, $to]) {
        $ratio = $reads[$to] / $reads[$from];
        expect($ratio)->toBeLessThan(2.5, "doubling {$from} -> {$to} nodes multiplied layout reads by {$ratio} ({$reads[$from]} -> {$reads[$to]})");
    }
});

test('SPEC-PERF-04: synthesis work is bounded by the SPEC-SYN-13 candidate cap — 800 nodes cost exactly what 400 nodes cost', function () {
    $at400 = gwShowBurst('/gallery/node-count?nodes=400')['reads'];
    $at800 = gwShowBurst('/gallery/node-count?nodes=800')['reads'];

    expect($at800)->toBe($at400, "past the 300-candidate cap the per-cycle work must stop growing: 400 nodes -> {$at400} reads, 800 nodes -> {$at800}");
});
