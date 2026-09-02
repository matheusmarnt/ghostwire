<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Livewire\Component;

class DemoTable extends Component
{
    public array $rows = ['Row one', 'Row two', 'Row three'];

    public function refresh(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay
        $this->rows = array_reverse($this->rows);
    }

    public function render()
    {
        return view('ghostwire-fixtures::demo-table');
    }
}
