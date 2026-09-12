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
        usleep(1_200_000); // 1.2s — widened per review Finding 4: 600ms left only ~200ms of margin around the gate's 0.4s check, the likeliest source of CI flake

        return view('ghostwire-fixtures::lazy-orders-table');
    }
}
