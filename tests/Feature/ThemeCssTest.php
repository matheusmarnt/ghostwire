<?php

it('style.css defines the shimmer/wave/pulse keyframes wired to the animation token', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toContain('@keyframes shimmer')
        ->and($css)->toContain('@keyframes wave')
        ->and($css)->toContain('@keyframes pulse')
        ->and($css)->toContain('animation-name: var(--ghostwire-animation)');
});

it('keeps bone animations to transform/opacity only (SPEC-RND-05)', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    foreach (['shimmer', 'wave', 'pulse'] as $name) {
        preg_match('/@keyframes\s+'.$name.'\s*\{(.*?)\n\}/s', $css, $m);

        expect($m)->not->toBeEmpty("missing @keyframes {$name}");

        $body = $m[1];
        expect($body)->not->toContain('background-position')
            ->and($body)->not->toContain('width:')
            ->and($body)->not->toContain('height:')
            ->and($body)->not->toContain('margin')
            ->and($body)->not->toContain('left:')
            ->and($body)->not->toContain('top:');
    }
});

it('disables bone animation under prefers-reduced-motion (SPEC-RND-06)', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');

    expect($css)->toMatch('/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.gw-bone::after\s*\{[^}]*animation:\s*none/s');
});

it('swaps to the dark bone token under prefers-color-scheme (FR-51)', function () {
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
