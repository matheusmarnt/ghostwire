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
        // Must exceed the scheduler's default 120ms show-delay (js/src/
        // scheduler.js): if the request finishes before that delay elapses,
        // onShow (and therefore synthesize()) never fires at all — the ghost
        // never appears. This was 50ms and silently broke both this and every
        // other test relying on the node-count fixture's ghost showing at
        // all (Task 8 discovered it via window.__ghostwireLastSynthesisMs
        // staying undefined). 200ms matches the CardGrid/PaginatedTable
        // fixtures' existing convention.
        usleep(200_000);
        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::gallery.node-count');
    }
}
