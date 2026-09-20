<?php

// tests/Feature/Precedence/OptInStrategyTest.php
//
// FR-04: 'global' is the CONFIGURABLE mode; 'opt-in' is the default. Under
// opt-in a component is instrumented only when #[Ghost] is declared somewhere
// in its chain. wire:ghost in the view keeps working with no data-ghost at all
// (js/src/attributeConfig.js's resolveHostConfig falls back to DEFAULTS).

use Ghostwire\Attributes\Ghost;
use Ghostwire\Support\ConfigResolver;
use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetOne;
use Livewire\Component;
use Livewire\Livewire;

// A bare #[Ghost] with no arguments at all — the headline "just opt me in
// with every default" use case. declaredArgsForClass()/declaredArgsForMethod()
// intentionally return [] for this (nothing was textually written at the call
// site to merge — correct for precedence resolution), so hasDeclaration() must
// not be built on top of those. Defined here, not as a shared
// tests/Browser/Fixtures/* fixture: only the two tests below need either class.
#[Ghost]
class BareGhostClassProbe extends Component
{
    public function render()
    {
        return '<div>bare ghost class probe</div>';
    }
}

class BareGhostMethodProbe extends Component
{
    #[Ghost]
    public function someAction(): void {}

    public function render()
    {
        return '<div>bare ghost method probe</div>';
    }
}

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

it('stamps data-ghost under opt-in when #[Ghost] is inherited from a base class', function () {
    config()->set('ghostwire.strategy', 'opt-in');

    $html = Livewire::test(LegacyWidgetOne::class)->html();

    expect($html)->toContain('data-ghost=');
});

it('reports a declaration for an inherited attribute and none for a bare component', function () {
    $resolver = app(ConfigResolver::class);

    expect($resolver->hasDeclaration(LegacyWidgetOne::class))->toBeTrue()
        ->and($resolver->hasDeclaration(GhostAttributeProbe::class))->toBeFalse();
});

it('stamps data-ghost under opt-in when #[Ghost] is declared bare, with no arguments, on the class', function () {
    config()->set('ghostwire.strategy', 'opt-in');
    Livewire::component('bare-ghost-class-probe', BareGhostClassProbe::class);

    $html = Livewire::test(BareGhostClassProbe::class)->html();

    expect($html)->toContain('data-ghost=')
        ->and(app(ConfigResolver::class)->hasDeclaration(BareGhostClassProbe::class))->toBeTrue();
});

it('stamps data-ghost under opt-in when #[Ghost] is declared bare, with no arguments, on a public method', function () {
    config()->set('ghostwire.strategy', 'opt-in');
    Livewire::component('bare-ghost-method-probe', BareGhostMethodProbe::class);

    $html = Livewire::test(BareGhostMethodProbe::class)->html();

    expect($html)->toContain('data-ghost=')
        ->and(app(ConfigResolver::class)->hasDeclaration(BareGhostMethodProbe::class))->toBeTrue();
});
