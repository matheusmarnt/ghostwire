<?php

// tests/Browser/Timing/IslandLifecycleTest.php
//
// SPEC-INT-13 — proves an island-scoped skeleton mounts sized to the island's
// own rect, not the whole page/component, against a real browser + real
// Livewire 4 island update + the real built runtime
// (resources/dist/ghostwire.js, rebuilt in the commit before this one —
// Task 7a — after it was found to predate this whole feature). v4-only:
// Livewire 3 has no island concept at all (SPEC-INT-22), so this test is
// skipped there.
//
// This version DIFFERS from the task brief's literal Step 4 snippet: the
// brief's own two assertions (width-diff from the host's own rect, and
// layer-top >= outside-island's bottom) are satisfied identically whether
// real island-region scoping runs or the pre-M9 whole-host fallback runs,
// because in this fixture wire:ghost.island sits directly on #island-host,
// so the fallback (host.el's own rect) and the real island region share the
// exact same top edge and full-container width regardless of scoping.
// Confirmed empirically (see task-7-report.md) against the pre-Task-7a dist,
// which had zero island-scoping code at all: the brief's exact two
// assertions PASSED anyway — a false pass, the same "test passed for the
// wrong reason" trap Task 4's first test fell into. The third assertion
// below (layer bottom reaches the button's bottom, not just the host div's
// own much shorter bottom) is the one that actually distinguishes real
// scoping from the fallback — confirmed both ways: it failed against the
// pre-rebuild dist (no scoping) and passes now (real scoping, post Task 7a).

use Composer\InstalledVersions;

it('scopes the skeleton to the island, not the outside-island content, on a real island update (SPEC-INT-13)', function () {
    if (! str_starts_with(InstalledVersions::getVersion('livewire/livewire'), '4.')) {
        $this->markTestSkipped('Islands are a Livewire 4-only feature (SPEC-INT-22).');
    }

    $page = visit('/ghostwire-island-demo');

    $page->script('
        window.__gw = { layerRectAtCapture: null };
        const observer = new MutationObserver(() => {
            const layer = document.querySelector(".gw-layer");
            if (layer && window.__gw.layerRectAtCapture === null) {
                window.__gw.layerRectAtCapture = layer.getBoundingClientRect().toJSON();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        true;
    ');

    $islandRect = json_decode($page->script(
        'JSON.stringify(document.getElementById("island-host").getBoundingClientRect())'
    ), true);
    $outsideRect = json_decode($page->script(
        'JSON.stringify(document.getElementById("outside-island").getBoundingClientRect())'
    ), true);
    // The island's true lower edge (the button lives inside the same
    // @island/@endisland block as #island-host, as a sibling below it) — the
    // dimension that actually differs between real island-region scoping and
    // the pre-M9 whole-host fallback for this fixture.
    $buttonRect = json_decode($page->script(
        'JSON.stringify(document.getElementById("increment-btn").getBoundingClientRect())'
    ), true);

    $page->script('document.getElementById("increment-btn").click();');
    $page->wait(0.6);

    $captured = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($captured['layerRectAtCapture'])->not->toBeNull();

    $layerRect = $captured['layerRectAtCapture'];

    // Sanity: the layer is a real, sensibly-sized box (not zero-width/some
    // unrelated element) roughly matching the host's own width.
    expect(abs($layerRect['width'] - $islandRect['width']))->toBeLessThan(5);

    // Rules out the whole-COMPONENT fallback (would start at/above
    // #outside-island's own top).
    expect($layerRect['top'])->toBeGreaterThanOrEqual($outsideRect['bottom']);

    // Rules out the whole-HOST-only fallback (host.el's own rect, which
    // stops at the end of #island-host and never reaches the button below
    // it). Real island-region scoping extends through the whole
    // @island/@endisland block, so the layer's bottom must reach the
    // button's bottom — not stop short at the host div's own, much shorter,
    // bottom edge.
    expect($layerRect['bottom'])->toBeGreaterThanOrEqual($buttonRect['bottom'] - 5);
});
