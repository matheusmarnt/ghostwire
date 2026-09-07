<?php

use Ghostwire\Attributes\Ghost;
use Livewire\Component;
use Livewire\Livewire;

#[Ghost(except: ['refreshBadge'], delay: 200)]
class DataGhostProbeComponent extends Component
{
    public function render()
    {
        return '<div>probe</div>';
    }
}

it('serializes only non-default fields, plus mode always, as compact keys (SPEC-API-30)', function () {
    Livewire::component('data-ghost-probe', DataGhostProbeComponent::class);

    $html = Livewire::test(DataGhostProbeComponent::class)->html();

    expect($html)->toContain('data-ghost=')
        ->and($html)->toContain('&quot;m&quot;:&quot;synthesize&quot;')
        ->and($html)->toContain('&quot;x&quot;:[&quot;refreshBadge&quot;]')
        ->and($html)->toContain('&quot;d&quot;:200')
        ->and($html)->not->toContain('&quot;h&quot;') // hold not declared, equals default -> omitted
        ->and($html)->not->toContain('&quot;r&quot;'); // rows never set -> omitted
});

it('never emits raw, unescaped quotes around the JSON payload (SPEC-SEC-01)', function () {
    Livewire::component('data-ghost-probe', DataGhostProbeComponent::class);

    $html = Livewire::test(DataGhostProbeComponent::class)->html();

    expect($html)->not->toMatch('/data-ghost=\'\{"/'); // must be Blade/Livewire-escaped, not a raw single-quoted JSON literal
});
