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
