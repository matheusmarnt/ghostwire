<?php

namespace Ghostwire\Tests\Browser\Fixtures\Gallery;

use Livewire\Component;

class PaginatedTable extends Component
{
    public int $page = 1;

    public function nextPage(): void
    {
        usleep(200_000); // matches DemoTable's artificial network delay
        $this->page++;
    }

    public function rows(): array
    {
        return [
            ['name' => 'Ada Lovelace', 'email' => 'ada@example.test'],
            ['name' => 'Grace Hopper', 'email' => 'grace@example.test'],
            ['name' => 'Katherine Johnson', 'email' => 'katherine@example.test'],
            ['name' => 'Margaret Hamilton', 'email' => 'margaret@example.test'],
            ['name' => 'Radia Perlman', 'email' => 'radia@example.test'],
        ];
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.paginated-table', ['rows' => $this->rows()]);
    }
}
