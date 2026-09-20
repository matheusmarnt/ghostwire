<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Livewire\Component;

// Issue #23 fixture for tests/Browser/Timing/DirectiveModifierTest.php.
//
// Deliberately carries NO #[Ghost] attribute and no config override: the
// directive modifiers written in its view (wire:ghost.delay.600ms.hold.2000ms)
// are the ONLY source of this host's delay and hold, so the test can pass only
// if the runtime parsed them the way Livewire tokenizes them — as
// ['delay', '600ms', 'hold', '2000ms'] (see parseModifiers in js/src/index.js).
//
// refresh() sleeps longer than the view's 600ms directive delay on purpose: a
// response that lands before the delay elapses must produce no skeleton at
// all, which would make the delay unmeasurable here.
class DirectiveTimingProbe extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(1_500_000); // 1500ms: well past the 600ms directive delay, well before the 2600ms end of the directive hold

        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::directive-timing-probe');
    }
}
