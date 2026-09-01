<?php

it('loads the fixture page and Livewire boots', function () {
    $page = visit('/ghostwire-test-page');

    $page->assertSee('3 rows')
        ->assertPresent('#refresh-btn')
        ->assertNoJavaScriptErrors();
});
