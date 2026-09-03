<?php

it('loads the repeat-list fixture with all 12 rows', function () {
    $page = visit('/gallery/repeat-list');

    $page->assertPresent('#repeat-list')
        ->assertPresent('#row-11')
        ->assertNoJavaScriptErrors();
});

it('loads the scrollable-kanban fixture with a scrollable, sticky-header column', function () {
    $page = visit('/gallery/scrollable-kanban');

    $page->assertPresent('#kanban-column')
        ->assertPresent('#kanban-header')
        ->assertPresent('#kcard-19')
        ->assertNoJavaScriptErrors();
});

it('loads the node-count fixture honoring the ?nodes= query string', function () {
    $page = visit('/gallery/node-count?nodes=25');

    $page->assertPresent('.gw-node-24')
        ->assertNotPresent('.gw-node-25')
        ->assertNoJavaScriptErrors();
});
