<?php

it('style.css defines the gw-shimmer/gw-wave/gw-pulse keyframes wired to the animation token', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toContain('@keyframes gw-shimmer')
        ->and($css)->toContain('@keyframes gw-wave')
        ->and($css)->toContain('@keyframes gw-pulse')
        ->and($css)->toContain('animation-name: var(--ghostwire-animation)');
});

it('keeps bone animations to transform/opacity only', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    foreach (['gw-shimmer', 'gw-wave', 'gw-pulse'] as $name) {
        preg_match('/@keyframes\s+'.$name.'\s*\{(.*?)\n\}/s', $css, $m);

        expect($m)->not->toBeEmpty("missing @keyframes {$name}");

        $body = $m[1];

        // The assertion this test was named for. Without it the whole block is
        // absence-only: an empty @keyframes passes every check below while
        // animating nothing at all.
        expect($body)->toMatch('/\b(transform|opacity)\s*:/', "@keyframes {$name} animates neither transform nor opacity");

        expect($body)->not->toContain('background-position')
            ->and($body)->not->toContain('width:')
            ->and($body)->not->toContain('height:')
            ->and($body)->not->toContain('margin')
            ->and($body)->not->toContain('left:')
            ->and($body)->not->toContain('top:');
    }
});

it('disables bone animation under prefers-reduced-motion', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toMatch('/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.gw-bone::after\s*\{[^}]*animation:\s*none/s');
});

it('swaps to the dark bone token under prefers-color-scheme', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toMatch('/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{[^}]*--ghostwire-bone-color:\s*var\(--ghostwire-bone-color-dark\)/s');
});

// The sheen is animated to opacity: 1 on every cycle, so an unswapped
// near-white highlight over a dark bone is a repeating flash, not a subtle
// theming miss. Both halves are asserted: the dark token must exist AND the
// dark media query must actually point the live token at it.
it('swaps the bone highlight too under prefers-color-scheme: dark (no near-white flash on dark bones)', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toMatch('/--ghostwire-bone-highlight-dark:\s*[^;]+;/')
        ->and($css)->toMatch('/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{[^}]*--ghostwire-bone-highlight:\s*var\(--ghostwire-bone-highlight-dark\)/s');
});

// @keyframes are global to the whole page, not scoped to the stylesheet that
// declares them: a consuming app that happens to ship its own unrelated
// @keyframes shimmer/wave/pulse (loaded after this package's stylesheet)
// would silently steal the animation-name and leave .gw-bone::after's
// transform/opacity frozen at their static base values forever, even though
// the animation clock keeps running. Namespacing the built-in keyframe names
// is what makes that collision structurally impossible — this guards against
// a future edit accidentally reverting to the bare, collidable names.
it('never emits the bare shimmer/wave/pulse keyframe names in the built stylesheet', function () {
    $distPath = __DIR__.'/../../resources/dist/ghostwire.css';

    expect($distPath)->toBeFile('resources/dist/ghostwire.css must be built (run `npm run build`) before this test');

    $css = file_get_contents($distPath);

    // Positive check first, so a broken/empty build can't pass this test by
    // simply containing none of the strings below.
    expect($css)->toContain('@keyframes gw-shimmer')
        ->and($css)->toContain('@keyframes gw-wave')
        ->and($css)->toContain('@keyframes gw-pulse')
        ->and($css)->toContain('--ghostwire-animation: gw-shimmer;');

    expect($css)->not->toContain('@keyframes shimmer')
        ->and($css)->not->toContain('@keyframes wave')
        ->and($css)->not->toContain('@keyframes pulse')
        ->and($css)->not->toContain('--ghostwire-animation: shimmer;');
});
