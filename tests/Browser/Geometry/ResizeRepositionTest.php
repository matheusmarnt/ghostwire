<?php

// tests/Browser/Geometry/ResizeRepositionTest.php
//
// Issue #21 — a host that resizes while its skeleton is showing must get its
// Ghost Layer repositioned to the new host rect, not only its bones
// re-synthesized. Runs on both Livewire lines (the resize path is bridge-
// independent). The fixture's #[Ghost(hold: 4000)] keeps the skeleton up
// across the resize with no message in flight, so nothing but the resize
// path can move the layer inside the assertion window. Its #[Ghost(rows: 3)]
// is load-bearing too, for an unrelated reason documented on the fixture
// (ResizeProbe.php): re-synthesis while concealed measures zero visible
// candidates (visibility: hidden inherits from .gw-concealed), so without a
// rows hint boneTree is always null and the host degrades to freeze instead
// of ever reaching the reposition branch this test exists to check.
//
// Non-vacuity, proven both ways during Task 3 of the 2026-09-19 plan: against
// the pre-fix v1.0.0 bundle (git show v1.0.0:resources/dist/ghostwire.js) the
// width/left assertions fail — the layer keeps the 1200px-viewport rect while
// the host has shrunk to the 700px one; against the fixed bundle they pass.

function gwClientRect($page, string $selector): array
{
    return json_decode($page->script("JSON.stringify(document.querySelector('{$selector}').getBoundingClientRect())"), true);
}

test('a host resized while its skeleton is showing gets its Ghost Layer repositioned to the new host rect (issue #21)', function () {
    $page = visit('/ghostwire-resize-probe');
    $page->resize(1200, 800);

    // Dispatched from the page itself rather than $page->click(): keeps
    // Playwright's own actionability checks out of the picture entirely.
    $page->script('document.getElementById("refresh-btn").click(); true;');
    $page->wait(0.8); // show at ~120ms, response at ~200ms (onPostPaint applies the rect), hold keeps the layer up until ~4.1s

    // Preconditions, asserted not assumed: the response landed (so onPostPaint
    // already ran and cannot mask the bug later) and the layer is up, aligned.
    expect($page->script('!!document.getElementById("refreshed")'))->toBeTrue();
    $hostBefore = gwClientRect($page, '#resize-host');
    $layerBefore = gwClientRect($page, '.gw-layer');
    expect(abs($layerBefore['width'] - $hostBefore['width']))->toBeLessThan(2);

    $page->resize(700, 800); // shrinks the host by ~500px — far past SPEC-SYN-21's 4px threshold
    $page->wait(0.5); // ResizeObserver -> onResize; still inside the hold window

    $host = gwClientRect($page, '#resize-host');
    $layer = gwClientRect($page, '.gw-layer');

    expect($host['width'])->toBeLessThan($hostBefore['width'] - 300); // the resize really reached the host
    foreach (['top', 'left', 'width', 'height'] as $edge) {
        expect(abs($layer[$edge] - $host[$edge]))->toBeLessThan(2, "layer {$edge} = {$layer[$edge]}, host {$edge} = {$host[$edge]}: the Ghost Layer was not repositioned after the resize");
    }
});
