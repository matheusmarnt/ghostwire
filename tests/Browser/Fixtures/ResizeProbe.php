<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Ghostwire\Attributes\Ghost;
use Livewire\Component;

// Issue #21 fixture for tests/Browser/Geometry/ResizeRepositionTest.php.
//
// `hold` is declared via #[Ghost(...)] rather than a wire:ghost.hold.4000ms
// modifier because that modifier form is dead code (issue #23): Livewire's
// own tokenizer (vendor/livewire/livewire/dist/livewire.esm.js) reads
//   let [value, ...modifiers] = name.replace(new RegExp("wire:"), "").split(".");
// which splits "hold.4000ms" into TWO modifier tokens, "hold" and "4000ms" —
// neither matches parseModifiers' TIMED_MODIFIER_PATTERN (js/src/index.js),
// which expects them combined as one token. #[Ghost(...)]'s data-ghost
// transport reaches the same `hold` config correctly.
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
