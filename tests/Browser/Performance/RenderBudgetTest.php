<?php

// tests/Browser/Performance/RenderBudgetTest.php
//
// SPEC-PERF-01/02 at the browser level, plus the renderer-side mount/render
// cost budget deferred since M3 (issue #5, then #18) — all structural
// (ADR-007), measured by gwShowBurst() in tests/Pest.php.
//
// The render path is renderer.js's mountLayer() (reads border-radius/
// overflow and the host rect, then appends the layer as its ONLY tree write)
// followed by renderBones() (one createElement + appendChild per bone into
// the now-live layer). Its cost is structurally bounded when, and only when:
//   (a) no layout read follows the layer append inside that same task — a
//       read there is a forced synchronous reflow against a freshly-dirtied
//       layout (SPEC-PERF-01), and the runtime's own read-before-write rule
//       (SPEC-PERF-02) is what keeps it at zero;
//   (b) the number of bones — and so of DOM insertions — is bounded by the
//       SPEC-SYN-13 candidate cap for a host of any size;
//   (c) exactly one layer is mounted per cycle (a double mount was the shape
//       of the M3-era onPostPaint reflow bug, issue #6).
// The jsdom tests in js/tests/perf-read-write-order.test.js prove (a) at the
// function level; this proves it against the real built runtime, in a real
// browser, on both Livewire lines, for every M3 gallery layout shape (repeat
// sampling, scroll clipping, card grid) and the capped node-count fixture.

test('SPEC-PERF-01/02: the show burst performs zero layout reads after the Ghost Layer is appended', function (string $route) {
    $burst = gwShowBurst($route);

    expect($burst['readsAfterLayerAppend'])->toBe(0, "{$route}: {$burst['readsAfterLayerAppend']} layout read(s) landed after the layer append — a forced reflow in the render path");
})->with([
    'node count, cap engaged' => ['/gallery/node-count?nodes=800'],
    'repeat list' => ['/gallery/repeat-list'],
    'scrollable kanban' => ['/gallery/scrollable-kanban'],
    'card grid' => ['/gallery/card-grid'],
]);

test('render budget: bones per cycle are bounded by the SPEC-SYN-13 candidate cap, and exactly one layer mounts', function () {
    $burst = gwShowBurst('/gallery/node-count?nodes=800');

    expect($burst['bones'])->toBeGreaterThan(0)
        ->and($burst['bones'])->toBeLessThanOrEqual(301) // MAX_CANDIDATES (300, walk.js) text bones + the one aggregated block bone the cap emits
        ->and($burst['layerAppends'])->toBe(1);
});
