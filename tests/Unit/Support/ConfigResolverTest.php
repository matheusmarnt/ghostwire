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

it('inherits a base class attribute field by field (SPEC-API-11)', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteNoOwnAttribute::class);

    expect($resolved['except'])->toBe(['refreshBadge'])
        ->and($resolved['mode'])->toBe('synthesize'); // not declared anywhere -> package default
});

it('lets the concrete class override an inherited field, keeping the rest inherited (SPEC-API-10/11)', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class);

    expect($resolved['mode'])->toBe('off')       // concrete class's own declared field wins
        ->and($resolved['except'])->toBe(['refreshBadge']); // not redeclared on concrete class -> inherited
});

it('lets a method attribute override the class, field by field, without discarding undeclared fields (SPEC-API-10)', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class, 'applyFilters');

    expect($resolved['rows'])->toBe(15)          // declared on the method
        ->and($resolved['mode'])->toBe('off')    // not declared on the method -> falls through to class
        ->and($resolved['except'])->toBe(['refreshBadge']); // still inherited past both method and class
});

it('lets a different method declare its own mode independently (SPEC-API-10)', function () {
    $resolved = (new ConfigResolver)->resolve(GhostConcreteOverridesMode::class, 'save');

    expect($resolved['mode'])->toBe('freeze');
});

it('rejects only+except coexisting on the same resolved config (SPEC-API-23)', function () {
    (new ConfigResolver)->resolve(GhostInvalidBothFilters::class);
})->throws(InvalidArgumentException::class);

it('inherits a trait-level attribute when nothing in the class chain declares its own (SPEC-API-11)', function () {
    $resolved = (new ConfigResolver)->resolve(GhostUsesTraitPolicy::class);

    expect($resolved['mode'])->toBe('freeze')
        ->and($resolved['delay'])->toBe(50);
});

it('reports which precedence level decided each field (SPEC-API-42)', function () {
    $result = (new ConfigResolver)->resolveWithProvenance(GhostProvenanceConcrete::class, 'refresh');

    expect($result['rows'])->toBe(['value' => 7, 'level' => 'method'])       // declared on the method
        ->and($result['mode'])->toBe(['value' => 'freeze', 'level' => 'class'])   // declared on the concrete class
        ->and($result['hold'])->toBe(['value' => 500, 'level' => 'inherited'])    // declared on the ancestor
        ->and($result['delay'])->toBe(['value' => config('ghostwire.timing.delay'), 'level' => 'default']); // never declared
});

it('collects only the method-transport fields each action method declared for itself (SPEC-API-10 runtime transport, #9)', function () {
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
    ]);
});
