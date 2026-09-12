<?php

// tests/Feature/EnabledKillSwitchTest.php
//
// `enabled` must mean "the package is not here" — not a fourth spelling of
// mode: off. With it false: no data-ghost on any component root, no lazy
// placeholder tagging, and both Blade directives emit nothing at all.

use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Ghostwire\Tests\Browser\Fixtures\LazyOrdersTable;
use Illuminate\Support\Facades\Blade;
use Livewire\Livewire;

it('stamps no data-ghost on any component when disabled', function () {
    config()->set('ghostwire.enabled', false);

    $html = Livewire::test(GhostAttributeProbe::class)->html();

    expect($html)->not->toContain('data-ghost');
});

it('does not tag the lazy placeholder with data-ghost-lazy when disabled', function () {
    config()->set('ghostwire.enabled', false);

    $html = Livewire::test(LazyOrdersTable::class, ['lazy' => true])->html();

    expect($html)->not->toContain('data-ghost-lazy');
});

it('emits nothing from @ghostwireScripts and @ghostwireStyles when disabled', function () {
    config()->set('ghostwire.enabled', false);

    expect(trim(Blade::render('@ghostwireScripts')))->toBe('')
        ->and(trim(Blade::render('@ghostwireStyles')))->toBe('');
});

it('still emits both asset tags when enabled (control)', function () {
    config()->set('ghostwire.enabled', true);

    expect(Blade::render('@ghostwireScripts'))->toContain('ghostwire.js')
        ->and(Blade::render('@ghostwireStyles'))->toContain('ghostwire.css');
});
