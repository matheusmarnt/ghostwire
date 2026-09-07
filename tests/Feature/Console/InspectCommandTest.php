<?php

// tests/Feature/Console/InspectCommandTest.php

use Composer\InstalledVersions;
use Ghostwire\Attributes\Ghost;
use Livewire\Component;
use Livewire\Livewire;

#[Ghost(except: ['refreshBadge'])]
class InspectProbeComponent extends Component
{
    public function render()
    {
        return '<div>probe</div>';
    }
}

it('lists every registered component with its resolved config and detected Livewire line (SPEC-API-42)', function () {
    Livewire::component('inspect-probe', InspectProbeComponent::class);

    $this->artisan('ghost:inspect')
        ->expectsOutputToContain('inspect-probe')
        ->expectsOutputToContain(InspectProbeComponent::class)
        ->expectsOutputToContain('synthesize')
        ->expectsOutputToContain('refreshBadge')
        ->expectsOutputToContain(InstalledVersions::getVersion('livewire/livewire'))
        ->assertExitCode(0);
});
