<?php

// tests/Browser/Performance/RenderBudgetTest.php
//
// Proves the read-before-write, zero-forced-reflow guarantee at the browser
// level, plus the renderer-side mount/render cost budget deferred since M3
// (issue #5, then #18) — all structural, measured by gwShowBurst()
// in tests/Pest.php.
//
// The render path is renderer.js's prepareLayer() (reads border-radius/
// overflow and the host rect, applied to a still-detached element) and
// attachLayer() (the ONLY tree write of the mount), followed by
// renderBones() (one createElement + appendChild per bone into the now-live
// layer). Its cost is structurally bounded when, and only when:
//   (a) no layout read follows the cycle's first write to a connected node
//       (the host's aria-busy) — a read there is a forced synchronous reflow
//       against a freshly-dirtied layout, and the runtime's
//       own read-before-write rule is what keeps it at zero;
//   (b) the number of bones — and so of DOM insertions — is bounded by the
//       candidate cap for a host of any size;
//   (c) exactly one layer is mounted per cycle (a double mount was the shape
//       of the M3-era onPostPaint reflow bug, issue #6).
// The jsdom tests in js/tests/perf-read-write-order.test.js prove (a) at the
// function level; this proves it against the real built runtime, in a real
// browser, on both Livewire lines, for every M3 gallery layout shape (repeat
// sampling, scroll clipping, card grid) and the capped node-count fixture.

test('the show burst performs zero layout reads after its first DOM write', function (string $route) {
    $burst = gwShowBurst($route);

    expect($burst['readsAfterFirstWrite'])->toBe(0, "{$route}: {$burst['readsAfterFirstWrite']} layout read(s) landed after the burst's first DOM write — a forced reflow in the show cycle");
})->with([
    'node count, cap engaged' => ['/gallery/node-count?nodes=800'],
    'repeat list' => ['/gallery/repeat-list'],
    'scrollable kanban' => ['/gallery/scrollable-kanban'],
    'card grid' => ['/gallery/card-grid'],
]);

test('render budget: bones per cycle are bounded by the candidate cap, and exactly one layer mounts', function () {
    $burst = gwShowBurst('/gallery/node-count?nodes=800');

    expect($burst['bones'])->toBeGreaterThan(0)
        ->and($burst['bones'])->toBeLessThanOrEqual(301) // (candidate cap x text lines per candidate) + 1 block bone; node-count's items are single-line, so 300 x 1 + 1 = 301 here — not a fixture-independent structural bound
        ->and($burst['layerAppends'])->toBe(1);
});
