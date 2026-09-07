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

it('resolves class-own field over inherited trait field over inherited base-class field over config over defaults', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteUsesInheritedOnly::class);

    // MatrixBase declares delay:999 directly on the concrete's ancestor chain -> wins over config default.
    expect($resolved['delay'])->toBe(999);
    // MatrixTraitWithPolicy declares mode/hold, but MatrixBase (nearer in the chain) doesn't
    // redeclare them, so the trait's values surface once the class itself has nothing to say.
    expect($resolved['mode'])->toBe('freeze')
        ->and($resolved['hold'])->toBe(500);
});

it('lets mode:off at the method level terminate the host regardless of every lower-precedence level (SPEC-API-41)', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteOverridesMode::class, 'anyAction');

    expect($resolved['mode'])->toBe('off');
});

it('lets the concrete class override the inherited mode while keeping the inherited delay (SPEC-API-10/11 field independence)', function () {
    $resolved = (new ConfigResolver)->resolve(MatrixConcreteOverridesMode::class);

    expect($resolved['mode'])->toBe('synthesize') // concrete class's own declaration wins
        ->and($resolved['delay'])->toBe(999);      // still falls through to the inherited base
});
