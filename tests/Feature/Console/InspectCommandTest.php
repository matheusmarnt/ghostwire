<?php

// tests/Feature/Console/InspectCommandTest.php

use Composer\InstalledVersions;
use Ghostwire\Attributes\Ghost;
use Illuminate\Support\Facades\Artisan;
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

it('lists every registered component with its resolved config and detected Livewire line', function () {
    Livewire::component('inspect-probe', InspectProbeComponent::class);

    $this->artisan('ghost:inspect')
        ->expectsOutputToContain('inspect-probe')
        ->expectsOutputToContain(InspectProbeComponent::class)
        ->expectsOutputToContain('synthesize')
        ->expectsOutputToContain('refreshBadge')
        ->expectsOutputToContain(InstalledVersions::getVersion('livewire/livewire'))
        ->assertExitCode(0);

    // P3 (2026-09-12 gap-fix audit): tests/TestCase.php always registers five
    // Legacy widget fixtures that inherit #[Ghost(except: ['refreshBadge'])]
    // from LegacyBaseComponent, so a bare expectsOutputToContain('refreshBadge')
    // above passes even when THIS probe's own except-resolution is completely
    // broken — confirmed by mutation (ConfigResolver::resolveWithProvenance()'s
    // 'class' level forced to []): the assertion above kept passing. Anchor the
    // check to inspect-probe's own printed block so it can only pass because of
    // this component's own resolved config.
    Artisan::call('ghost:inspect');
    $output = Artisan::output();

    $start = strpos($output, 'Component: inspect-probe');
    expect($start)->not->toBeFalse();

    $nextComponent = strpos($output, 'Component: ', $start + 1);
    $ownBlock = $nextComponent === false ? substr($output, $start) : substr($output, $start, $nextComponent - $start);

    expect($ownBlock)->toContain('refreshBadge');
});
