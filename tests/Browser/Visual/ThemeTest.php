<?php

// tests/Browser/Visual/ThemeTest.php
//
// Proves the animation-token wiring and automatic
// dark-mode swap added in Task 1 (js/src/style.css) render correctly against
// a real browser and the real compiled runtime (resources/dist/ghostwire.css).
//
// prefers-reduced-motion has no emulation hook in the installed
// pestphp/pest-plugin-browser v4.3.1 — confirmed by reading the real
// vendor/pestphp/pest-plugin-browser/src/Api/PendingAwaitablePage.php source
// (inDarkMode()/inLightMode()/locale()/timezone()/on() only, nothing for
// reduced-motion). That case is covered instead by the static CSS-text
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

    expect($page->script('window.__gw.animationName'))->toBe('gw-shimmer');
});

test('bone color swaps under prefers-color-scheme: dark', function () {
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
// light highlight therefore flashes near-white over an oklch(0.42) dark bone
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

// @keyframes are global to the page, not scoped to the stylesheet that
// declares them: a consuming app that ships its own unrelated @keyframes
// shimmer (e.g. a background-position sweep for some other widget), loaded
// after Ghostwire's own stylesheet, used to silently win that global name
// collision. Ghostwire's animation-name still resolved and its Animation
// object still ran, but the *keyframe body* actually driving the timeline
// was the other stylesheet's — so .gw-bone::after's transform/opacity stayed
// frozen at their static base values forever despite the animation clock
// ticking. Namespacing the built-in keyframe names makes that collision
// structurally impossible; this proves it end to end against the real
// compiled runtime, reading the actual resolved Animation/KeyframeEffect
// rather than just comparing name strings.
test('bone animation survives a page-defined @keyframes shimmer name collision', function () {
    $page = visit('/gallery/card-grid');

    $page->script('
        const collisionStyle = document.createElement("style");
        collisionStyle.textContent = "@keyframes shimmer { 0% { background-position: -100% 0; } 100% { background-position: 200% 0; } }";
        document.head.appendChild(collisionStyle);
        window.__gwCollisionRule = collisionStyle.sheet.cssRules[0];
        true;
    ');

    $page->script('
        window.__gw = null;
        new MutationObserver(() => {
            const bone = document.querySelector(".gw-layer .gw-bone");
            if (!bone || window.__gw !== null) return;

            const anim = bone.getAnimations({ subtree: true }).find((a) => a.animationName === "gw-shimmer");
            const keyframes = anim ? anim.effect.getKeyframes() : [];

            window.__gw = {
                collisionRuleIsBareShimmer: window.__gwCollisionRule instanceof CSSKeyframesRule && window.__gwCollisionRule.name === "shimmer",
                resolvedName: getComputedStyle(bone, "::after").animationName,
                foundOwnAnimation: !!anim,
                touchesTransformOrOpacity: keyframes.some((k) => "transform" in k || "opacity" in k),
                touchesBackgroundPosition: keyframes.some((k) => "backgroundPosition" in k),
            };
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0);

    $result = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: the page really did register its own colliding bare "shimmer"
    // keyframes rule — otherwise the rest of this test would pass vacuously.
    expect($result['collisionRuleIsBareShimmer'])->toBeTrue();

    // The animation-name resolves to the namespaced value, never the page's
    // bare one, and the keyframe body actually driving the timeline is the
    // package's own (transform/opacity) — not the page's unrelated
    // background-position one.
    expect($result['resolvedName'])->toBe('gw-shimmer');
    expect($result['foundOwnAnimation'])->toBeTrue();
    expect($result['touchesTransformOrOpacity'])->toBeTrue();
    expect($result['touchesBackgroundPosition'])->toBeFalse();
});
