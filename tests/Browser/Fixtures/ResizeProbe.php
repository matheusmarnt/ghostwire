<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Component;

// Issue #21 fixture for tests/Browser/Geometry/ResizeRepositionTest.php.
//
// `hold` is declared via #[Ghost(...)] so this fixture exercises the attribute
// transport on its own; the directive form of the same override
// (wire:ghost.hold.<N>ms, broken until issue #23) is proven separately by
// tests/Browser/Timing/DirectiveModifierTest.php.
//
// The long hold keeps the skeleton visible across a viewport resize with no
// message in flight, so the resize path is the ONLY thing that can move the
// Ghost Layer during the assertion window. That resize re-synthesizes while
// the host still carries .gw-concealed, which measure.js now sees through
// (issue #21) instead of filtering every candidate as hidden — without that
// fix this fixture degraded to freeze on resize instead of repositioning
// (proven by mutation; see ResizeRepositionTest.php's header).
#[Ghost(hold: 4000)]
class ResizeProbe extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay, same as every other fixture
        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::resize-probe');
    }
}
