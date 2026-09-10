<?php

// tests/Browser/Visual/ThemeTest.php
//
// SPEC-RND-04/05, FR-51 — proves the animation-token wiring and automatic
// dark-mode swap added in Task 1 (js/src/style.css) render correctly against
// a real browser and the real compiled runtime (resources/dist/ghostwire.css).
//
// prefers-reduced-motion has no emulation hook in the installed
// pestphp/pest-plugin-browser v4.3.1 — confirmed by reading the real
// vendor/pestphp/pest-plugin-browser/src/Api/PendingAwaitablePage.php source
// (inDarkMode()/inLightMode()/locale()/timezone()/on() only, nothing for
// reduced-motion). SPEC-RND-06 is covered instead by the static CSS-text
// assertion in tests/Feature/ThemeCssTest.php — a deliberate scope call, not
// an oversight.

test('the ghost bone sheen animates by default', function () {
    $page = visit('/gallery/card-grid');

    $page->script('
        window.__gw = { animationName: null };
        new MutationObserver(() => {
            const bone = document.querySelector(".gw-layer .gw-bone");
            if (!bone || window.__gw.animationName !== null) return;
            window.__gw.animationName = getComputedStyle(bone, "::after").animationName;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    expect($page->script('window.__gw.animationName'))->toBe('shimmer');
});

test('bone color swaps under prefers-color-scheme: dark (FR-51)', function () {
    $lightPage = visit('/gallery/card-grid')->inLightMode();
    $lightPage->script('
        window.__gw = null;
        new MutationObserver(() => {
            const bone = document.querySelector(".gw-layer .gw-bone");
            if (!bone || window.__gw !== null) return;
            window.__gw = getComputedStyle(bone).backgroundColor;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ');
    $lightPage->click('#refresh-btn');
    $lightPage->wait(1.0);
    $lightColor = $lightPage->script('window.__gw');

    $darkPage = visit('/gallery/card-grid')->inDarkMode();
    $darkPage->script('
        window.__gw = null;
        new MutationObserver(() => {
            const bone = document.querySelector(".gw-layer .gw-bone");
            if (!bone || window.__gw !== null) return;
            window.__gw = getComputedStyle(bone).backgroundColor;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ');
    $darkPage->click('#refresh-btn');
    $darkPage->wait(1.0);
    $darkColor = $darkPage->script('window.__gw');

    expect($lightColor)->not->toBeNull();
    expect($darkColor)->not->toBeNull();
    expect($lightColor)->not->toBe($darkColor);
});

// The test above reads .gw-bone's own backgroundColor, which is structurally
// blind to the highlight: --ghostwire-bone-highlight lives only in
// .gw-bone::after's linear-gradient, and the shimmer animation drives that
// pseudo-element to opacity: 1 every --ghostwire-animation-speed. An unswapped
// light highlight therefore flashes near-white over an oklch(0.28) dark bone
// on every cycle — invisible to a base-color check, very visible to a user.
// So this reads the ::after gradient itself, in both schemes.
test('the bone sheen highlight also swaps under prefers-color-scheme: dark (no near-white flash)', function () {
    $probe = '
        window.__gw = null;
        new MutationObserver(() => {
            const bone = document.querySelector(".gw-layer .gw-bone");
            if (!bone || window.__gw !== null) return;
            window.__gw = getComputedStyle(bone, "::after").backgroundImage;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ';

    $lightPage = visit('/gallery/card-grid')->inLightMode();
    $lightPage->script($probe);
    $lightPage->click('#refresh-btn');
    $lightPage->wait(1.0);
    $lightSheen = $lightPage->script('window.__gw');

    $darkPage = visit('/gallery/card-grid')->inDarkMode();
    $darkPage->script($probe);
    $darkPage->click('#refresh-btn');
    $darkPage->wait(1.0);
    $darkSheen = $darkPage->script('window.__gw');

    // Sanity: the probe really captured a resolved gradient, not null/none.
    expect($lightSheen)->toContain('linear-gradient');
    expect($darkSheen)->toContain('linear-gradient');

    expect($lightSheen)->not->toBe($darkSheen);
});
