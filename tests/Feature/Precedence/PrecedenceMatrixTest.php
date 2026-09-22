<?php

// tests/Feature/Precedence/PrecedenceMatrixTest.php

use Ghostwire\Attributes\Ghost;
use Ghostwire\Support\ConfigResolver;

trait MatrixTrait {}

#[Ghost(mode: 'freeze', hold: 500)]
trait MatrixTraitWithPolicy {}

#[Ghost(delay: 999)]
class MatrixBase
{
    use MatrixTraitWithPolicy;
}

class MatrixConcreteUsesInheritedOnly extends MatrixBase {}

#[Ghost(mode: 'synthesize')]
class MatrixConcreteOverridesMode extends MatrixBase
{
    #[Ghost(mode: 'off')]
    public function anyAction(): void {}
}

trait MatrixConflictingTrait {}

#[Ghost(hold: 700)]
trait MatrixConflictingTraitWithPolicy {}

#[Ghost(hold: 400)]
class MatrixAncestorWithConflictingField {}

class MatrixConcreteWithAncestorAndTraitConflict extends MatrixAncestorWithConflictingField
{
    use MatrixConflictingTraitWithPolicy;
}

#[Ghost(panels: true)]
class MatrixPanelsClassComponent {}

it('resolves class-own field over inherited trait field over inherited base-class field over config over defaults', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteUsesInheritedOnly::class);

    // MatrixBase declares delay:999 directly on the concrete's ancestor chain -> wins over config default.
    expect($resolved['delay'])->toBe(999);
    // MatrixTraitWithPolicy declares mode/hold, but MatrixBase (nearer in the chain) doesn't
    // redeclare them, so the trait's values surface once the class itself has nothing to say.
    expect($resolved['mode'])->toBe('freeze')
        ->and($resolved['hold'])->toBe(500);
});

it('lets mode:off at the method level terminate the host regardless of every lower-precedence level', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteOverridesMode::class, 'anyAction');

    expect($resolved['mode'])->toBe('off');
});

it('lets the concrete class override the inherited mode while keeping the inherited delay (field independence)', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteOverridesMode::class);

    expect($resolved['mode'])->toBe('synthesize') // concrete class's own declaration wins
        ->and($resolved['delay'])->toBe(999);      // still falls through to the inherited base
});

it('lets an ancestor class field win over a same-field trait declaration, both present at once (ordering)', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteWithAncestorAndTraitConflict::class);

    expect($resolved['hold'])->toBe(400); // ancestor's own declared value, not the trait's
});

it('resolves panels through the same seven-level cascade as every other boolean field', function () {
    config(['ghostwire.panels' => false]);
    $resolver = app(ConfigResolver::class);

    $resolved = $resolver->resolve(MatrixPanelsClassComponent::class);

    expect($resolved['panels'])->toBeTrue(); // class-level #[Ghost(panels: true)] beats the config default
});
