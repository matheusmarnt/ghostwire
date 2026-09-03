<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class ScrollableKanban extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000);
        $this->refreshed = true;
    }

    public function cards(): array
    {
        return array_map(fn ($i) => "Card {$i}", range(1, 20));
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.scrollable-kanban', ['cards' => $this->cards()]);
    }
}
