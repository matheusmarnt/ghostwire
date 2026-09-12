<?php

// tests/Feature/Precedence/OptInStrategyTest.php
//
// FR-04: 'global' is the CONFIGURABLE mode; 'opt-in' is the default. Under
// opt-in a component is instrumented only when #[Ghost] is declared somewhere
// in its chain. wire:ghost in the view keeps working with no data-ghost at all
// (js/src/attributeConfig.js's resolveHostConfig falls back to DEFAULTS).

use Ghostwire\Support\ConfigResolver;
use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetOne;
use Livewire\Livewire;

it('does not stamp data-ghost on a component with no #[Ghost] anywhere, under the default opt-in strategy', function () {
    config()->set('ghostwire.strategy', 'opt-in');

    $html = Livewire::test(GhostAttributeProbe::class)->html();

    expect($html)->not->toContain('data-ghost');
});

it('does stamp data-ghost on that same component under the global strategy', function () {
    config()->set('ghostwire.strategy', 'global');

    $html = Livewire::test(GhostAttributeProbe::class)->html();

    expect($html)->toContain('data-ghost=');
});

it('stamps data-ghost under opt-in when #[Ghost] is inherited from a base class (SPEC-API-12)', function () {
    config()->set('ghostwire.strategy', 'opt-in');

    $html = Livewire::test(LegacyWidgetOne::class)->html();

    expect($html)->toContain('data-ghost=');
});

it('reports a declaration for an inherited attribute and none for a bare component', function () {
    $resolver = app(ConfigResolver::class);

    expect($resolver->hasDeclaration(LegacyWidgetOne::class))->toBeTrue()
        ->and($resolver->hasDeclaration(GhostAttributeProbe::class))->toBeFalse();
});
