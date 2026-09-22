<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Attributes\Lazy;
use Livewire\Component;

// Fixture for the delay-gate fix
// (docs/plans/2026-09-21-fix-ghost-lazy-learning-delay-gate.md): unlike
// LazyOrdersTable, render() carries no artificial sleep, and bump() does no
// work slow enough to cross the 120ms show delay. DemoTable::refresh()
// (tests/Browser/Fixtures/DemoTable.php) needs an explicit usleep(200_000)
// specifically "long enough to clear the 120ms show delay" — confirming a
// bare commit in this test environment resolves comfortably under it on its
// own, with no artificial slowness needed here to prove the same thing.
#[Lazy]
#[Ghost(lazy: true)]
class LazyFastOrdersTable extends Component
{
    public array $rows = ['Alpha', 'Bravo', 'Charlie'];

    public function bump(): void
    {
        $this->rows[] = 'Delta';
    }

    public function render()
    {
        return view('ghostwire-fixtures::lazy-fast-orders-table');
    }
}
