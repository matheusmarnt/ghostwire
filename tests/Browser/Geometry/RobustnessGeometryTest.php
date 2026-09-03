<?php

// tests/Browser/Geometry/RobustnessGeometryTest.php
//
// M3 acceptance gate for the robustness synthesis pipeline (repeat sampling,
// scroll clipping, sticky-header geometry) plus an extension of the
// SPEC-PERF-10 zero-CLS gate to the three new M3 gallery fixtures Task 6
// built (RepeatList, ScrollableKanban, NodeCount).
//
// Follows the exact MutationObserver-at-first-sighting pattern established
// in tests/Browser/Geometry/GalleryGeometryTest.php: geometry is captured
// the instant the first .gw-bone appears in the DOM, not at a fixed-offset
// wait, so the sample reflects what the scheduler actually measured at
// show-time rather than a later (possibly already-morphed) layout.

test('SPEC-SYN-11: repeat sampling preserves real item count and matches real geometry down to the last (cloned) row', function () {
    $page = visit('/gallery/repeat-list');

    $page->script(<<<'JS'
        window.__gwRepeat = { matched: null, boneCount: 0, rowCount: 0 };
        new MutationObserver(() => {
            if (window.__gwRepeat.matched !== null) return; // evaluate once, at first sighting
            const layer = document.body.querySelector('.gw-layer');
            if (!layer) return;
            const bones = Array.from(layer.querySelectorAll('.gw-bone'));
            if (bones.length === 0) return;

            const rows = Array.from(document.querySelectorAll('#repeat-list li.row'));
            const lastRow = rows[rows.length - 1].getBoundingClientRect();
            const TOLERANCE = 2;

            const matched = bones.some((bone) => {
                const b = bone.getBoundingClientRect();
                return Math.abs(b.top - lastRow.top) <= TOLERANCE && Math.abs(b.left - lastRow.left) <= TOLERANCE;
            });

            window.__gwRepeat.boneCount = bones.length;
            window.__gwRepeat.rowCount = rows.length;
            window.__gwRepeat.matched = matched;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    JS);

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gwRepeat)'), true);

    expect($data['rowCount'])->toBe(12);
    expect($data['boneCount'])->toBe($data['rowCount'] + 1); // one text bone per row + the refresh button's control bone
    expect($data['matched'])->toBeTrue(); // the last (cloned, unsampled) row's bone lands within 2px of the real row it stands in for
});

test('SPEC-SYN-14: scrollable containers limit synthesis to the visible area', function () {
    $page = visit('/gallery/scrollable-kanban');

    $page->script(<<<'JS'
        window.__gwScroll = { actualBones: null, expectedBones: null };

        function gwVisibleCardCount() {
            const column = document.querySelector('#kanban-column');
            const columnRect = column.getBoundingClientRect();
            const cards = Array.from(document.querySelectorAll('.kanban-card'));
            return cards.filter((c) => {
                const r = c.getBoundingClientRect();
                return r.bottom > columnRect.top && r.top < columnRect.bottom;
            }).length;
        }

        new MutationObserver(() => {
            if (window.__gwScroll.actualBones !== null) return;
            const layer = document.body.querySelector('.gw-layer');
            if (!layer) return;
            const bones = layer.querySelectorAll('.gw-bone');
            if (bones.length === 0) return;
            window.__gwScroll.actualBones = bones.length;
            window.__gwScroll.expectedBones = gwVisibleCardCount() + 2; // sticky header bone + refresh-button bone
        }).observe(document.body, { childList: true, subtree: true });
        true;
    JS);

    $page->click('#refresh-btn');
    $page->wait(1.0);

    $data = json_decode($page->script('JSON.stringify(window.__gwScroll)'), true);

    expect($data['expectedBones'])->toBeLessThan(22); // sanity: proves most of the 20 cards really are clipped out
    expect($data['actualBones'])->toBe($data['expectedBones']);
});

test('SPEC-SYN-15: a sticky header bone tracks its pinned viewport position after scrolling', function () {
    $page = visit('/gallery/scrollable-kanban');

    $page->script("document.querySelector('#kanban-column').scrollTop = 300; true;"); // scroll well past several cards

    $page->script(<<<'JS'
        window.__gwSticky = { matched: null };
        new MutationObserver(() => {
            if (window.__gwSticky.matched !== null) return;
            const layer = document.body.querySelector('.gw-layer');
            if (!layer) return;
            const bones = Array.from(layer.querySelectorAll('.gw-bone'));
            if (bones.length === 0) return;

            const header = document.querySelector('#kanban-header').getBoundingClientRect();
            const TOLERANCE = 2;
            window.__gwSticky.matched = bones.some((bone) => {
                const b = bone.getBoundingClientRect();
                return Math.abs(b.top - header.top) <= TOLERANCE && Math.abs(b.left - header.left) <= TOLERANCE;
            });
        }).observe(document.body, { childList: true, subtree: true });
        true;
    JS);

    $page->click('#refresh-btn');
    $page->wait(1.0);

    expect($page->script('window.__gwSticky.matched'))->toBeTrue();
});

dataset('m3_layouts', [
    'repeat list' => ['/gallery/repeat-list', '#refresh-btn'],
    'scrollable kanban' => ['/gallery/scrollable-kanban', '#refresh-btn'],
    'node count' => ['/gallery/node-count', '#refresh-btn'],
]);

test('SPEC-PERF-10: bones introduce zero CLS for the M3 robustness layouts', function (string $route, string $triggerSelector) {
    $page = visit($route);

    $page->script('
        window.__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) window.__cls += entry.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
        true;
    ');

    $page->click($triggerSelector);
    $page->wait(1.0);

    $cls = $page->script('window.__cls');

    expect($cls)->toBe(0);
})->with('m3_layouts');
