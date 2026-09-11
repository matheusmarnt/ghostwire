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
        return view('ghostwire-fixtures::lazy-declared-placeholder');
    }
}
