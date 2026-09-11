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

    // (No standalone check of $envelope['v'] here — emptyEnvelope() also
    // returns v:1, so that alone would be satisfied by nothing having been
    // learned at all. The assertions below are the ones that require a real,
    // matching, non-empty entry to have actually been persisted.)
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
            // Seeded under all six band names, not just the one this viewport
            // happens to resolve to. bandFor() (js/src/learning/bands.js) is
            // the ONLY definition of the band table on the JS side; guessing
            // it here a second time (a ternary chain keyed on window.innerWidth)
            // would fail loud only if BANDS moved across this test's own
            // viewport threshold, and silently stop covering the change
            // otherwise (review Finding 3). Seeding every band means the
            // lookup hits whichever one the runtime actually picks.
            var envelope = { v: 1, e: {}, c: {} };
            ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].forEach(function (band, i) {
                envelope.e[(12345 + i) + '|' + band] = { t: Date.now(), n: 'lazy-orders-table', w: rect.width, h: rect.height, b: rows };
            });
            // envelope.c is intentionally omitted: validEnvelope() (store.js)
            // rebuilds it from the e keys on read and ignores whatever was
            // written here, so seeding it would be dead weight.
            window.localStorage.setItem('ghostwire.learned.v1', JSON.stringify(envelope));
            window.__gwExpected = {
                count: rows.length,
                firstLeft: rows[0].x,
                width: rect.width,
                // Last row, not first: the first bone's y is ~0 by
                // construction, so it can never catch a "painted every bone
                // at y=0" regression (review Finding 2). The last row is not.
                lastTop: rows[rows.length - 1].y,
                height: rect.height,
            };
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
    // A fixed wait-then-sample here raced the server under load even after
    // widening the fixture's window (review Finding 4): observed directly,
    // one run in seven read bones == 0 at the 0.4s mark. Padding the number
    // again would only narrow the odds, not remove them, so this escalates
    // to the review's own suggested path (the CspTest.php:26-48 pattern): a
    // MutationObserver captures the FIRST instant bones exist and snapshots
    // realContent in that same synchronous read, so "painted before content"
    // is proven from what was actually observed, not inferred from whatever
    // the DOM happened to look like at an arbitrary instant we guessed.
    $page->navigate('/ghostwire-lazy-learning');

    $page->script(<<<'JS'
        (function () {
            window.__gwEarly = null;

            function tryCapture() {
                if (window.__gwEarly !== null) return; // keep only the first sighting
                var root = document.querySelector('[data-ghost-lazy]');
                var bones = document.querySelectorAll('[data-ghost-lazy] .gw-bone');
                if (!root || bones.length === 0) return; // nothing painted yet
                var first = bones[0];
                var last = bones[bones.length - 1];
                window.__gwEarly = {
                    bones: bones.length,
                    realContent: !!document.querySelector('#lazy-list'),
                    firstLeft: parseFloat(first.style.left),
                    lastTop: parseFloat(last.style.top),
                    width: parseFloat(root.style.width || '0'),
                    height: parseFloat(root.style.height || '0'),
                };
            }

            tryCapture(); // covers the case where painting already happened by the time this runs
            new MutationObserver(tryCapture).observe(document.body, { childList: true, subtree: true, attributes: true });
        })();
    JS);
    $page->wait(0.5); // margin for the observer callback to fire and be read back — no longer a race against the render deadline

    $early = json_decode($page->script('JSON.stringify(window.__gwEarly)'), true);

    expect($early)->not->toBeNull(); // the skeleton was painted at some point before this read, whenever that point actually was

    // The skeleton is painted...
    expect($early['bones'])->toBe($expected['count']);
    // ...before any content exists, which is SPEC-LRN-02's whole point...
    expect($early['realContent'])->toBeFalse();
    // ...and it is the LEARNED geometry, not an invented one — all four
    // geometry axes paintLazyPlaceholders()/paintBones() actually write
    // (root width+height, per-bone left+top), not just the two (x, width)
    // that happen to be ~0-safe by construction (review Finding 2).
    // firstLeft/lastTop can only be real numbers once `bones` above is
    // confirmed non-zero — do not reorder these before that assertion, or a
    // genuine "nothing painted" regression would compare null against a
    // delta here instead of failing loudly on the `bones` line (Finding 6).
    expect($early['firstLeft'])->toEqualWithDelta($expected['firstLeft'], 1.0);
    expect($early['lastTop'])->toEqualWithDelta($expected['lastTop'], 1.0);
    expect($early['width'])->toEqualWithDelta($expected['width'], 1.0);
    expect($early['height'])->toEqualWithDelta($expected['height'], 1.0);

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
    // Seed a learned tree for THIS component's own name, under every band, so
    // the paint pass has real data it COULD paint. Without this, an empty
    // store would make the assertions below pass merely because there is
    // nothing to paint yet — not because FR-56's exclusion held (review
    // Finding 1: a prior version of this test was vacuous for exactly this
    // reason, and also counted [data-ghost-lazy] attributes instead of
    // bones, so it was blind to the one regression it was named for: a
    // skeleton painted straight over "my own placeholder").
    $page = visit('/ghostwire-lazy-declared-placeholder');
    $page->wait(2.0); // let this first load's own lazy fetch finish server-side before navigate() below issues a second request — otherwise it can queue behind the still-sleeping first one and make the 0.4s check below race the server, not just the client (same reason Test 2 waits here)

    $page->script(<<<'JS'
        (function () {
            var envelope = { v: 1, e: {}, c: {} };
            var bones = [{ type: 'text', x: 0, y: 0, width: 100, height: 20 }];
            ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].forEach(function (band, i) {
                envelope.e[(54321 + i) + '|' + band] = { t: Date.now(), n: 'lazy-declared-placeholder', w: 200, h: 40, b: bones };
            });
            window.localStorage.setItem('ghostwire.learned.v1', JSON.stringify(envelope));
        })();
    JS);

    // Same-context reload (Ruling A: navigate() reuses the Page/context, so
    // localStorage survives) so boot()'s first paintLazyPlaceholders() pass
    // on the fresh page sees the seeded entry already in place.
    $page->navigate('/ghostwire-lazy-declared-placeholder');
    $page->wait(0.4); // inside the fixture's 1.2s render window (review Finding 1: this fixture had no usleep at all before)

    $seen = json_decode($page->script(<<<'JS'
        JSON.stringify({
            declaredPh: !!document.querySelector('#declared-placeholder'),
            realContent: !!document.querySelector('#declared-real'),
            tagged: document.querySelectorAll('[data-ghost-lazy]').length,
            bones: document.querySelectorAll('.gw-bone').length,
        })
    JS), true);

    // Positive control: the placeholder window is actually open right now —
    // rules out a 404, a load failure, a renamed component, or an
    // already-morphed page silently making the checks below vacuous.
    expect($seen['declaredPh'])->toBeTrue();
    expect($seen['realContent'])->toBeFalse();
    // The developer's own placeholder was never tagged...
    expect($seen['tagged'])->toBe(0);
    // ...and, with real learned data sitting in the store for this exact
    // name, nothing was painted either — what this test's name actually
    // claims, checked directly rather than inferred from the tag's absence.
    expect($seen['bones'])->toBe(0);

    $page->assertNoJavaScriptErrors();
});
