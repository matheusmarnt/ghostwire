<?php

// tests/Browser/Geometry/PanelBonesGeometryTest.php
//
// End-to-end regression gate for panel bones: a real Livewire component,
// rendered in a real browser, with #[Ghost(panels: true)] semantics opted
// into via wire:ghost.panels (see tests/Browser/Fixtures/PanelCardComponent.php),
// synthesized and painted by the real built runtime
// (resources/dist/ghostwire.js) — closing the loop the unit tests covering
// the PHP attribute, the data-ghost transport, and the client-side
// synthesizer/renderer each verified only in isolation.
//
// Follows the exact MutationObserver-at-first-sighting pattern established in
// tests/Browser/Geometry/GalleryGeometryTest.php and used throughout
// RobustnessGeometryTest.php: geometry (and, here, bone type) is captured the
// instant the first .gw-bone appears in the DOM, not at a fixed-offset wait.
//
// Bone type is read off the rendered DOM itself, the same way every sibling
// geometry test reads bones — via the real .gw-bone elements under
// .gw-layer, never a synthetic test-only hook. js/src/renderer.js's
// paintBones() writes each bone's type as a CSS class modifier
// (`gw-bone gw-bone--${bone.type}`), so a panel bone is identifiable in the
// DOM as an element carrying the gw-bone--panel class — that class is parsed
// back out below, in the same injected-script style GalleryGeometryTest.php
// and RobustnessGeometryTest.php already use for geometry.

test('a card with a real background emits a panel bone before its children\'s bones', function () {
    $page = visit('/ghostwire-panel-card');

    $page->script(<<<'JS'
        window.__gwPanel = { types: null, firstWidth: null };

        new MutationObserver(() => {
            if (window.__gwPanel.types !== null) return; // evaluate once, at first sighting
            const layer = document.body.querySelector('.gw-layer');
            if (!layer) return;
            const bones = Array.from(layer.querySelectorAll('.gw-bone'));
            if (bones.length === 0) return;

            window.__gwPanel.types = bones.map((bone) => {
                const match = bone.className.match(/gw-bone--(\S+)/);
                return match ? match[1] : null;
            });
            window.__gwPanel.firstWidth = bones[0].getBoundingClientRect().width;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    JS);

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gwPanel)'), true);

    // Sanity: prove bones actually rendered, so the assertions below aren't
    // vacuously true because nothing was ever synthesized.
    expect($data['types'])->not->toBeNull();
    expect($data['types'])->not->toBeEmpty();

    expect($data['types'][0])->toBe('panel');
    expect($data['firstWidth'])->toBeGreaterThan(0);

    // Guards against the loop below passing vacuously if the card's children
    // stopped rendering entirely: there must be the panel bone PLUS at least
    // one child bone, not just the panel alone.
    expect(count($data['types']))->toBeGreaterThan(1);

    // every subsequent bone (the card's text children) must come after the
    // panel bone, and none of them may themselves be typed 'panel'
    foreach (array_slice($data['types'], 1) as $childType) {
        expect($childType)->not->toBe('panel');
    }
});
