<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Livewire\Attributes\Renderless;
use Livewire\Component;

class DemoTable extends Component
{
    public array $rows = ['Row one', 'Row two', 'Row three'];

    public function refresh(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay
        $this->rows = array_reverse($this->rows);
    }

    // SPEC-API-22 investigation fixture (Task 6): a real #[Renderless] action,
    // driven from tests/Browser/Timing/RenderlessTest.php to capture the
    // actual message/response shape Livewire produces for it.
    #[Renderless]
    public function renderlessBump(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay
        $this->rows[] = 'Renderless row';
    }

    public function render()
    {
        return view('ghostwire-fixtures::demo-table');
    }
}
