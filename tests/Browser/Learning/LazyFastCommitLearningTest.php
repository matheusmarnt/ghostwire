<?php

// Regression gate for docs/plans/2026-09-21-fix-ghost-lazy-learning-delay-gate.md:
// before the fix, learning capture only ran from inside scheduler.js's
// onShow, which a commit resolving faster than the 120ms show delay never
// reaches — #[Ghost(lazy: true)] then had nothing to paint, forever,
// regardless of how many fast-resolving actions ran. LazyFastOrdersTable's
// bump() does no artificial work (see that fixture's own comment for why a
// bare commit here reliably resolves under 120ms) — a real repro of the
// plan doc's own production measurement (60.6ms, wire:click, no network
// throttling).

it('learns from, and later paints, a commit that resolves faster than the 120ms show delay', function () {
    // Phase 1 — real page, real fast commit, no hand-seeding.
    $page = visit('/ghostwire-lazy-fast-learning');
    $page->script('window.Ghostwire.clearLearned();');
    $page->wait(0.5); // let Livewire's own #[Lazy] swap finish (no sleep in render(), so this is ample)

    $page->click('#bump-btn');
    $page->wait(0.3); // real round trip only — see LazyFastOrdersTable's own comment on why this stays well under 120ms

    $learned = json_decode($page->script('window.Ghostwire.exportLearned()'), true);
    $names = array_column($learned['e'], 'n');
    expect($names)->toContain('lazy-fast-orders-table');

    // Phase 2 — same browser context (navigate(), not a second visit(), so
    // localStorage survives — same ruling as
    // tests/Browser/Learning/LazySkeletonTest.php's Phase 2), proving the
    // learned tree actually reaches the next lazy placeholder with no slow
    // warm-up action ever required — the real symptom this fix closes.
    $page->navigate('/ghostwire-lazy-fast-learning');

    $page->script(<<<'JS'
        (function () {
            window.__gwEarly = null;
            function tryCapture() {
                if (window.__gwEarly !== null) return;
                var root = document.querySelector('[data-ghost-lazy]');
                var bones = document.querySelectorAll('[data-ghost-lazy] .gw-bone');
                if (!root || bones.length === 0) return;
                window.__gwEarly = {
                    bones: bones.length,
                    realContent: !!document.querySelector('#lazy-fast-list'),
                };
            }
            tryCapture();
            new MutationObserver(tryCapture).observe(document.body, { childList: true, subtree: true, attributes: true });
        })();
    JS);
    $page->wait(0.5);

    $early = json_decode($page->script('JSON.stringify(window.__gwEarly)'), true);

    expect($early)->not->toBeNull();
    expect($early['bones'])->toBeGreaterThan(0);
    expect($early['realContent'])->toBeFalse();

    $page->assertNoJavaScriptErrors();
});
