<?php

use Ghostwire\GhostwireServiceProvider;
use Illuminate\Support\Facades\Blade;

it('merges the package config', function () {
    expect(config('ghostwire.timing.delay'))->toBe(120);
    expect(config('ghostwire.timing.hold'))->toBe(300);
    expect(config('ghostwire.timing.timeout'))->toBe(15000);
});

it('registers the config publish group', function () {
    $paths = GhostwireServiceProvider::pathsToPublish(GhostwireServiceProvider::class, 'ghostwire-config');

    expect($paths)->toHaveCount(1);
});

it('registers the assets publish group', function () {
    $paths = GhostwireServiceProvider::pathsToPublish(GhostwireServiceProvider::class, 'ghostwire-assets');

    expect($paths)->toHaveCount(1);
});

it('renders @ghostwireStyles as a stylesheet link with no inline CSS (SPEC-SEC-06 baseline)', function () {
    $html = Blade::render('@ghostwireStyles');

    expect($html)->toContain('<link')
        ->and($html)->toContain('ghostwire.css')
        ->and($html)->not->toContain('<style>');
});

it('renders @ghostwireScripts as an external script tag with no inline JS (SPEC-SEC-06 baseline)', function () {
    $html = Blade::render('@ghostwireScripts');

    expect($html)->toContain('<script')
        ->and($html)->toContain('ghostwire.js')
        ->and($html)->not->toContain('eval(')
        ->and($html)->not->toContain('new Function');
});
