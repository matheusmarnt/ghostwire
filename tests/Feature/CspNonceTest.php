<?php

use Illuminate\Support\Facades\Blade;

it('ghostwireStyles renders a plain link with no nonce by default', function () {
    $html = Blade::render('@ghostwireStyles');

    expect($html)->toContain('<link rel="stylesheet" href="')
        ->and($html)->not->toContain('nonce=');
});

it('ghostwireStyles includes a nonce attribute when given one', function () {
    $html = Blade::render('@ghostwireStyles($nonce)', ['nonce' => 'abc123']);

    expect($html)->toContain('<link rel="stylesheet" href="')
        ->and($html)->toContain('nonce="abc123"');
});

it('ghostwireScripts renders a plain script tag with no nonce by default', function () {
    $html = Blade::render('@ghostwireScripts');

    expect($html)->toContain('<script src="')
        ->and($html)->toContain('defer></script>')
        ->and($html)->not->toContain('nonce=');
});

it('ghostwireScripts includes a nonce attribute when given one', function () {
    $html = Blade::render('@ghostwireScripts($nonce)', ['nonce' => 'abc123']);

    expect($html)->toContain('<script src="')
        ->and($html)->toContain('nonce="abc123"')
        ->and($html)->toContain('defer></script>');
});
