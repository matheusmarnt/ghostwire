<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Attributes\Lazy;
use Livewire\Component;

#[Lazy]
#[Ghost(lazy: true)]
class LazyDeclaredPlaceholder extends Component
{
    public function placeholder()
    {
        return view('ghostwire-fixtures::lazy-declared-placeholder-ph');
    }

    public function render()
    {
        usleep(1_200_000); // 1.2s — same DoD-gate observation window as LazyOrdersTable (review Finding 1)

        return view('ghostwire-fixtures::lazy-declared-placeholder');
    }
}
