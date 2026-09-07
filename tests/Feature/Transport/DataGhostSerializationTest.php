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

// No #[Ghost] attribute at all -> every field resolves to whatever
// ConfigResolver::packageDefault() returns, which is config()-driven.
class ConfigDriftProbeComponent extends Component
{
    public function render()
    {
        return '<div>config-drift probe</div>';
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

it('does not omit a field from data-ghost when it only matches config() overrides, not the literal package default (config-drift fix)', function () {
    config()->set('ghostwire.timing.delay', 500);
    Livewire::component('config-drift-probe', ConfigDriftProbeComponent::class);

    $html = Livewire::test(ConfigDriftProbeComponent::class)->html();

    expect($html)->toContain('&quot;d&quot;:500'); // must be present, not omitted, even though 500 equals the live config default
});
