<?php

// tests/Browser/Timing/DirectiveModifierTest.php
//
// Issue #23 — wire:ghost.delay.<N>ms / .hold.<N>ms directive modifiers never
// took effect in a real browser: Livewire splits the attribute name on '.', so
// `hold.2000ms` reaches the runtime as ['hold', '2000ms'], and the old
// single-token parser ignored both tokens. The fixture (DirectiveTimingProbe)
// has no #[Ghost] and no config override, so the values measured below can
// only have come from the directive.
//
// Same in-browser recording pattern as FreezeLifecycleTest.php: timestamps
// captured by a MutationObserver with performance.now(), asserted as measured
// deltas — never a snapshot at a guessed offset. The Ghost Layer is appended to
// document.body (SPEC-MORPH-01, js/src/renderer.js), so a non-subtree childList
// observer on body sees exactly its mount and its unmount.
//
// $page->wait() takes SECONDS (pest-plugin-browser InteractsWithTab::wait).
//
// Timeline (fixture: directive delay 600ms, directive hold 2000ms, server
// sleep 1500ms): show at ~600ms (default would be ~120ms); response at
// ~1500ms; hide at ~2600ms because the hold counts from the show (default
// hold 300ms would hide at ~1500ms, i.e. a ~900ms measured hold).

it('honours wire:ghost.delay.600ms.hold.2000ms written as a directive (SPEC-TIME-03, issue #23)', function () {
    $page = visit('/ghostwire-directive-timing-probe');

    $page->script('
        window.__gw = { clickAt: null, shownAt: null, hiddenAt: null };
        const isLayer = (n) => n.nodeType === 1 && n.classList.contains("gw-layer");
        new MutationObserver((muts) => {
            for (const m of muts) {
                if (window.__gw.shownAt === null && Array.from(m.addedNodes).some(isLayer)) {
                    window.__gw.shownAt = performance.now();
                }
                if (window.__gw.shownAt !== null && window.__gw.hiddenAt === null && Array.from(m.removedNodes).some(isLayer)) {
                    window.__gw.hiddenAt = performance.now();
                }
            }
        }).observe(document.body, { childList: true });
        true;
    ');

    $page->script('
        window.__gw.clickAt = performance.now();
        document.getElementById("refresh-btn").click();
    ');
    $page->wait(3.5); // show ~0.6s, response ~1.5s, hide ~2.6s, plus settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: the full show -> hide cycle really happened, so the deltas below
    // measure something rather than passing vacuously.
    expect($data['shownAt'])->not->toBeNull();
    expect($data['hiddenAt'])->not->toBeNull();
    expect($page->script('!!document.getElementById("refreshed")'))->toBeTrue();

    $delayMs = $data['shownAt'] - $data['clickAt'];
    $holdMs = $data['hiddenAt'] - $data['shownAt'];

    // Default delay is 120ms: showing only after ~600ms proves the directive's
    // delay reached the scheduler...
    expect($delayMs)->toBeGreaterThanOrEqual(590);
    // ...and showing well before the ~1500ms response proves it showed on the
    // delay timer, not merely because the response finally landed.
    expect($delayMs)->toBeLessThan(1200);

    // Default hold is 300ms and the response lands ~900ms after the show, so
    // without the directive the layer would be gone ~900ms after showing.
    // Staying up for ~2000ms proves the directive's hold reached the scheduler.
    expect($holdMs)->toBeGreaterThanOrEqual(1900);
});
