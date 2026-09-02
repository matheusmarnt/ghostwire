<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class GroupedTable extends Component
{
    public bool $loaded = false;

    public function load(): void
    {
        usleep(200_000);
        $this->loaded = true;
    }

    public function groups(): array
    {
        return [
            'Fruits' => ['Apple', 'Banana'],
            'Vegetables' => ['Carrot', 'Potato', 'Spinach'],
        ];
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.grouped-table', ['groups' => $this->groups()]);
    }
}
