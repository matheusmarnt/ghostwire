<?php

// M7 DoD gate (SDD §16: "Primeiro lazy com esqueleto correto, sem Chromium").
// "Sem Chromium" describes the export pipeline (ghost:export never launches a
// browser); this gate itself is a real browser test, because only a real
// browser can learn a tree and only a real browser can prove a lazy
// placeholder paints one before content exists.
//
// Ruling B (only a real browser proves put()/get() round-trip with real
// geometry): the first test below drives a genuine synthesize -> onSynthesized
// -> learningStore.put() -> localStorage -> exportLearned() round trip through
// a real Livewire action (click #refresh-btn on demo-table) and real
// getBoundingClientRect() geometry. That is the real-loop test this ruling
// requires. The second test's own "Phase 1" hand-writes localStorage instead
// of driving the same live-synthesis path — LazyOrdersTable has no interactive
// action, so nothing here would ever naturally re-synthesize and persist its
// own geometry post-mount — but every number it writes is still read from a
// real getBoundingClientRect() on the real rendered fixture, and the write
// goes through the browser's real Storage API and the store's real read/
// validate path (js/src/learning/store.js's validEnvelope), not a fake. Its
// job is the paint half: proving paintLazyPlaceholders() reproduces exactly
// the persisted geometry into a placeholder before Livewire's real content
// exists — something no jsdom test (stubbed getBoundingClientRect) could show.

it('learns a Bone Tree from a real render and persists it (SPEC-LRN-01)', function () {
    $page = visit('/ghostwire-learn-demo');

    $page->script('window.Ghostwire.clearLearned();');

    $page->click('#refresh-btn');
    $page->wait(1.0); // clears delay(120) + server sleep(200) + hold(300) + settle margin

    $envelope = json_decode($page->script('window.Ghostwire.exportLearned()'), true);

    expect($envelope['v'])->toBe(1);

    $names = array_column($envelope['e'], 'n');
    expect($names)->toContain('demo-table');

    $entry = collect($envelope['e'])->firstWhere('n', 'demo-table');
    expect($entry['b'])->not->toBeEmpty()
        ->and($entry['w'])->toBeGreaterThan(0);

    $page->assertNoJavaScriptErrors();
});

it('paints a learned skeleton into a lazy placeholder before any content exists (SPEC-LRN-02, M7 DoD)', function () {
    // Phase 1 — render the lazy component for real, then record its own geometry
    // into the store. This is exactly the state a returning visitor's
    // localStorage would already be in.
    $page = visit('/ghostwire-lazy-learning');

    $page->script('window.Ghostwire.clearLearned();');
    $page->wait(2.0); // let the lazy component finish loading

    $page->script(<<<'JS'
        (function () {
            var host = document.querySelector('#lazy-orders-table');
            var rect = host.getBoundingClientRect();
            var rows = Array.prototype.map.call(host.querySelectorAll('li'), function (li) {
                var r = li.getBoundingClientRect();
                return { type: 'text', x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height };
            });
            var w = window.innerWidth;
            var band = w >= 1536 ? '2xl' : w >= 1280 ? 'xl' : w >= 1024 ? 'lg' : w >= 768 ? 'md' : w >= 640 ? 'sm' : 'xs';
            var envelope = { v: 1, e: {}, c: {} };
            envelope.e['12345|' + band] = { t: Date.now(), n: 'lazy-orders-table', w: rect.width, h: rect.height, b: rows };
            envelope.c['lazy-orders-table|' + band] = '12345';
            window.localStorage.setItem('ghostwire.learned.v1', JSON.stringify(envelope));
            window.__gwExpected = { count: rows.length, firstLeft: rows[0].x, width: rect.width };
        })();
    JS);

    $expected = json_decode($page->script('JSON.stringify(window.__gwExpected)'), true);
    expect($expected['count'])->toBeGreaterThan(0);

    // Phase 2 — same tab, same browser context, so localStorage survives.
    // Pest's navigate() (Ruling A) calls Playwright's Page::goto() on the SAME
    // Page instance visit() already created — confirmed by reading
    // vendor/pestphp/pest-plugin-browser: PendingAwaitablePage memoizes one
    // AwaitableWebpage per visit() and reuses it for every subsequent call, and
    // InteractsWithToolbar::navigate() goes through that same $this->page. A
    // second visit() would instead mint a brand new browser context and wipe
    // localStorage, making this gate vacuous — so navigate() is used here, not
    // a script-driven window.location.assign.
    $page->navigate('/ghostwire-lazy-learning');
    $page->wait(0.4); // inside the fixture's 600ms render window

    $early = json_decode($page->script(<<<'JS'
        JSON.stringify((function () {
            var root = document.querySelector('[data-ghost-lazy]');
            var first = document.querySelector('[data-ghost-lazy] .gw-bone');
            return {
                bones: document.querySelectorAll('[data-ghost-lazy] .gw-bone').length,
                realContent: !!document.querySelector('#lazy-list'),
                firstLeft: first ? parseFloat(first.style.left) : null,
                width: root ? parseFloat(root.style.width || '0') : null,
            };
        })())
    JS), true);

    // The skeleton is painted...
    expect($early['bones'])->toBe($expected['count']);
    // ...before any content exists, which is SPEC-LRN-02's whole point...
    expect($early['realContent'])->toBeFalse();
    // ...and it is the LEARNED geometry, not an invented one.
    expect($early['firstLeft'])->toEqualWithDelta($expected['firstLeft'], 1.0);
    expect($early['width'])->toEqualWithDelta($expected['width'], 1.0);

    // Then the real component takes over and the placeholder is gone. Queried
    // by the stable #lazy-orders-table id rather than [data-ghost-lazy] (which
    // the morph may itself have stripped) so this also settles Ruling C: does
    // Livewire's morph actually clean up the painted bones, the gw-lazy class
    // and the inline geometry it left on the host, or leak them into the live
    // DOM once real content lands.
    $page->wait(2.0);

    $late = json_decode($page->script(<<<'JS'
        JSON.stringify((function () {
            var host = document.querySelector('#lazy-orders-table');
            return {
                bones: document.querySelectorAll('.gw-bone').length,
                realContent: !!document.querySelector('#lazy-list'),
                hostHasGhostLazyAttr: host ? host.hasAttribute('data-ghost-lazy') : null,
                hostHasGwLazyClass: host ? host.classList.contains('gw-lazy') : null,
                hostInlineWidth: host ? host.style.width : null,
            };
        })())
    JS), true);

    expect($late['realContent'])->toBeTrue();
    expect($late['bones'])->toBe(0);
    expect($late['hostHasGhostLazyAttr'])->toBeFalse();
    expect($late['hostHasGwLazyClass'])->toBeFalse();
    expect($late['hostInlineWidth'])->toBe('');

    $page->assertNoJavaScriptErrors();
});

it('paints nothing for a component that declared its own placeholder (FR-56)', function () {
    $page = visit('/ghostwire-lazy-declared-placeholder');

    $page->wait(0.3);

    expect((int) $page->script("document.querySelectorAll('[data-ghost-lazy]').length"))->toBe(0);

    $page->assertNoJavaScriptErrors();
});
