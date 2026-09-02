<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class CardGrid extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000);
        $this->refreshed = true;
    }

    public function cards(): array
    {
        return [
            ['title' => 'Short card', 'body' => 'One line of body text.'],
            ['title' => 'Tall card', 'body' => 'This card has a much longer body that wraps across several lines to force an unequal height compared to its siblings in the grid.'],
            ['title' => 'Medium card', 'body' => 'A couple of lines of body text go here for this one.'],
        ];
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.card-grid', ['cards' => $this->cards()]);
    }
}
