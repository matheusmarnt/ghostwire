<?php

// tests/Browser/Timing/IslandLifecycleTest.php
//
// Proves an island-scoped skeleton mounts sized to the island's
// own rect, not the whole page/component, against a real browser + real
// Livewire 4 island update + the real built runtime
// (resources/dist/ghostwire.js, which had to be rebuilt before this test
// could pass — it was found to still predate the whole feature). v4-only:
// Livewire 3 has no island concept at all, so this test is
// skipped there.
//
// The third assertion below is deliberate, and the reason is worth keeping.
// The two more obvious assertions — width differs from the host's own rect,
// and layer-top >= the outside-island content's bottom — are satisfied
// identically whether real island-region scoping runs or the pre-M9
// whole-host fallback runs, because in this fixture wire:ghost.island sits
// directly on #island-host, so the fallback (host.el's own rect) and the
// real island region share the exact same top edge and full-container width
// regardless of scoping. Confirmed empirically against a dist containing
// zero island-scoping code: both of those assertions PASSED anyway — a false
// pass. The third assertion (layer bottom reaches the button's bottom, not
// just the host div's own much shorter bottom) is the one that actually
// distinguishes real scoping from the fallback — confirmed both ways: it
// failed against the pre-rebuild dist, and passes against the rebuilt one.

use Composer\InstalledVersions;

it('scopes the skeleton to the island, not the outside-island content, on a real island update', function () {
    if (! str_starts_with(InstalledVersions::getVersion('livewire/livewire'), '4.')) {
        $this->markTestSkipped('Islands are a Livewire 4-only feature.');
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
