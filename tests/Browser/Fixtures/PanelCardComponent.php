<?php

namespace Ghostwire\Tests\Browser\Fixtures;

use Livewire\Component;

// Fixture for tests/Browser/Geometry/PanelBonesGeometryTest.php.
//
// Deliberately carries NO #[Ghost] attribute and no config override, the
// same shape as DirectiveTimingProbe: wire:ghost.panels in the view is the
// ONLY source of this host's panels opt-in, so the test can pass only if the
// runtime parsed that directive modifier for real.
class PanelCardComponent extends Component
{
    public bool $refreshed = false;

    public function refresh(): void
    {
        usleep(200_000); // 200ms — long enough to clear the 120ms show delay, same as every other fixture

        $this->refreshed = true;
    }

    public function render()
    {
        return view('ghostwire-fixtures::panel-card');
    }
}
