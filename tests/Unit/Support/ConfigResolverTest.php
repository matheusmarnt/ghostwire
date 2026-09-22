<?php

use Ghostwire\Attributes\Ghost;
use Ghostwire\Support\ConfigResolver;

trait GhostTraitDefaults {}

#[Ghost(mode: 'freeze', delay: 50)]
trait GhostTraitWithDefaults {}

class GhostBaseComponent {}

#[Ghost(except: ['refreshBadge'])]
class GhostInheritedBase {}

class GhostConcreteNoOwnAttribute extends GhostInheritedBase {}

#[Ghost(mode: 'off')]
class GhostConcreteOverridesMode extends GhostInheritedBase
{
    #[Ghost(rows: 15)]
    public function applyFilters(): void {}

    #[Ghost(mode: 'freeze')]
    public function save(): void {}
}

#[Ghost(only: ['a'], except: ['b'])]
class GhostInvalidBothFilters {}

class GhostUsesTraitPolicy
{
    use GhostTraitWithDefaults;
}

class GhostMethodOverridesFixture
{
    #[Ghost(mode: 'freeze', delay: 50)]
    public function methodWithGhost(): void {}

    #[Ghost(only: ['x'])]
    public function methodWithOnlyOnly(): void {}

    public function methodWithNoAttribute(): void {}
}

#[Ghost(hold: 500)]
class GhostProvenanceBase {}

#[Ghost(mode: 'freeze')]
class GhostProvenanceConcrete extends GhostProvenanceBase
{
    #[Ghost(rows: 7)]
    public function refresh(): void {}
}

#[Ghost(panels: true)]
class PanelsClassComponent {}

it('falls all the way through to package defaults when nothing declares anything', function () {
    $resolved = (new ConfigResolver)->resolve(GhostBaseComponent::class);

    expect($resolved['mode'])->toBe('synthesize')
        ->and($resolved['only'])->toBeNull()
        ->and($resolved['except'])->toBeNull()
        ->and($resolved['delay'])->toBe(config('ghostwire.timing.delay'))
        ->and($resolved['hold'])->toBe(config('ghostwire.timing.hold'))
        ->and($resolved['rows'])->toBeNull()
        ->and($resolved['poll'])->toBe(! config('ghostwire.silence.poll'))
        ->and($resolved['sync'])->toBe(! config('ghostwire.silence.sync'))
        ->and($resolved['lazy'])->toBeFalse(); // F1: package default is hardcoded false, independent of learning.enabled
});

it('keeps the lazy package default false even when learning.enabled is on, so #[Ghost(lazy: true)] stays the sole opt-in (F1)', function () {
    config(['ghostwire.learning.enabled' => true]);

    $resolved = (new ConfigResolver)->resolve(GhostBaseComponent::class);

    expect($resolved['lazy'])->toBeFalse();
});

it('inherits a base class attribute field by field', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteNoOwnAttribute::class);

    expect($resolved['except'])->toBe(['refreshBadge'])
        ->and($resolved['mode'])->toBe('synthesize'); // not declared anywhere -> package default
});

it('lets the concrete class override an inherited field, keeping the rest inherited', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class);

    expect($resolved['mode'])->toBe('off')       // concrete class's own declared field wins
        ->and($resolved['except'])->toBe(['refreshBadge']); // not redeclared on concrete class -> inherited
});

it('lets a method attribute override the class, field by field, without discarding undeclared fields', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class, 'applyFilters');

    expect($resolved['rows'])->toBe(15)          // declared on the method
        ->and($resolved['mode'])->toBe('off')    // not declared on the method -> falls through to class
        ->and($resolved['except'])->toBe(['refreshBadge']); // still inherited past both method and class
});

it('lets a different method declare its own mode independently', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class, 'save');

    expect($resolved['mode'])->toBe('freeze');
});

it('rejects only+except coexisting on the same resolved config', function () {
    (new ConfigResolver)->resolve(GhostInvalidBothFilters::class);
})->throws(InvalidArgumentException::class);

it('inherits a trait-level attribute when nothing in the class chain declares its own', function () {
    $resolved = (new ConfigResolver)->resolve(GhostUsesTraitPolicy::class);

    expect($resolved['mode'])->toBe('freeze')
        ->and($resolved['delay'])->toBe(50);
});

it('reports which precedence level decided each field', function () {
    $result = (new ConfigResolver)->resolveWithProvenance(GhostProvenanceConcrete::class, 'refresh');

    expect($result['rows'])->toBe(['value' => 7, 'level' => 'method'])       // declared on the method
        ->and($result['mode'])->toBe(['value' => 'freeze', 'level' => 'class'])   // declared on the concrete class
        ->and($result['hold'])->toBe(['value' => 500, 'level' => 'inherited'])    // declared on the ancestor
        ->and($result['delay'])->toBe(['value' => config('ghostwire.timing.delay'), 'level' => 'default']); // never declared
});

it('collects only the method-transport fields each action method declared for itself (runtime transport, #9)', function () {
    $overrides = (new ConfigResolver)->methodOverrides(GhostMethodOverridesFixture::class);

    expect($overrides)->toBe([
        'methodWithGhost' => ['mode' => 'freeze', 'delay' => 50],
    ]);
});

it('exposes the package defaults for the fields that have one, matching resolve()\'s own fallback', function () {
    $defaults = (new ConfigResolver)->defaults();

    expect($defaults)->toBe([
        'mode' => 'synthesize',
        'delay' => config('ghostwire.timing.delay'),
        'hold' => config('ghostwire.timing.hold'),
        'poll' => ! config('ghostwire.silence.poll'),
        'sync' => ! config('ghostwire.silence.sync'),
        'lazy' => false,
        'panels' => false,
    ]);
});

it('resolves panels to the config-driven package default when nothing declares it', function () {
    config(['ghostwire.panels' => true]);
    $resolver = app(ConfigResolver::class);

    $resolved = $resolver->resolve(GhostBaseComponent::class);

    expect($resolved['panels'])->toBeTrue();
});

it('casts a string config value (as env() returns for GHOSTWIRE_PANELS=1) to a real boolean', function () {
    config(['ghostwire.panels' => '1']);
    $resolver = app(ConfigResolver::class);

    $resolved = $resolver->resolve(GhostBaseComponent::class);

    expect($resolved['panels'])->toBeTrue()
        ->and($resolved['panels'])->toBeBool();
});

it('lets a class-level #[Ghost(panels: true)] override the config default', function () {
    config(['ghostwire.panels' => false]);
    $resolver = app(ConfigResolver::class);

    $resolved = $resolver->resolve(PanelsClassComponent::class);

    expect($resolved['panels'])->toBeTrue();
});

it('includes panels in literalDefaults() and defaults()', function () {
    $resolver = app(ConfigResolver::class);

    expect($resolver->literalDefaults()['panels'])->toBeFalse()
        ->and($resolver->defaults()['panels'])->toBeFalse();
});
