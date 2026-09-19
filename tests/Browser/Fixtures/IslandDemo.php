<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Livewire\Component;

class IslandDemo extends Component
{
    public int $count = 0;

    public function increment(): void
    {
        usleep(200_000); // artificial latency, same technique as FreezeLifecycleTest.php's server sleep(200)
        $this->count++;
    }

    public function render()
    {
        return view('ghostwire-fixtures::island-demo');
    }
}
