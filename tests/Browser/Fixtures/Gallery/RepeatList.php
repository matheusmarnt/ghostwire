<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class RepeatList extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000); // matches DemoTable's artificial network delay
        $this->refreshed = true;
    }

    public function items(): array
    {
        return array_map(fn ($i) => "Row {$i}", range(1, 12));
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.repeat-list', ['items' => $this->items()]);
    }
}
