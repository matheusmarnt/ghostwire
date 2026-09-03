<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class NodeCount extends Component
{
    public int $count = 100;
    public bool $refreshed = false;

    public function mount(): void
    {
        $this->count = max(1, (int) request()->query('nodes', 100));
    }

    public function refresh(): void
    {
        usleep(50_000);
        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.node-count');
    }
}
