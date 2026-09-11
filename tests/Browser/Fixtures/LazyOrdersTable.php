<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Attributes\Lazy;
use Livewire\Component;

#[Lazy]
#[Ghost(lazy: true)]
class LazyOrdersTable extends Component
{
    public array $rows = ['Alpha', 'Bravo', 'Charlie'];

    public function render()
    {
        return view('ghostwire-fixtures::lazy-orders-table');
    }
}
