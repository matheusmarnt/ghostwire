<?php

// tests/Feature/Precedence/GlobalStrategyLegacyTest.php

use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetFive;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetFour;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetOne;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetThree;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetTwo;
use Livewire\Livewire;

it('ghosts every legacy component through a shared base #[Ghost], with zero wire:ghost in any of their views (SPEC-API-12, milestone DoD)', function (string $class) {
    $html = Livewire::test($class)->html();

    expect($html)->toContain('data-ghost=')
        ->and($html)->not->toContain('wire:ghost');
})->with([
    LegacyWidgetOne::class,
    LegacyWidgetTwo::class,
    LegacyWidgetThree::class,
    LegacyWidgetFour::class,
    LegacyWidgetFive::class,
]);
