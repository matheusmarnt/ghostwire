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

// One action method carries its own #[Ghost(...)] (SPEC-API-10 runtime
// transport, #9) -> the rendered data-ghost payload must additionally carry
// an "a" key mapping that method's name to its own compact-key fields.
class MethodOverrideProbeComponent extends Component
{
    #[Ghost(mode: 'freeze', delay: 50)]
    public function increment(): void {}

    public function render()
    {
        return '<div>method-override probe</div>';
    }
}

// F10 (fix round 2): none of this file's tests mention learning, so the whole file
// silently broke under a whole-suite GHOSTWIRE_LEARNING=true run — only the exact-equality
// assertion below was strict enough to notice, but every test here shares the same baseline
// assumption. Pinned off in each, matching LearningTransportTest.php's established shape.
it('serializes only non-default fields, plus mode always, as compact keys (SPEC-API-30)', function () {
    config(['ghostwire.learning.enabled' => false]);
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
    config(['ghostwire.learning.enabled' => false]);
    Livewire::component('data-ghost-probe', DataGhostProbeComponent::class);

    $html = Livewire::test(DataGhostProbeComponent::class)->html();

    expect($html)->not->toMatch('/data-ghost=\'\{"/'); // must be Blade/Livewire-escaped, not a raw single-quoted JSON literal
});

it('does not omit a field from data-ghost when it only matches config() overrides, not the literal package default (config-drift fix)', function () {
    config(['ghostwire.learning.enabled' => false]);
    config()->set('ghostwire.timing.delay', 500);
    Livewire::component('config-drift-probe', ConfigDriftProbeComponent::class);

    $html = Livewire::test(ConfigDriftProbeComponent::class)->html();

    expect($html)->toContain('&quot;d&quot;:500'); // must be present, not omitted, even though 500 equals the live config default
});

it('carries a method-level #[Ghost] override in an "a" key, keyed by action name, compact-encoded (SPEC-API-10 runtime transport, #9)', function () {
    config(['ghostwire.learning.enabled' => false]);
    Livewire::component('method-override-probe', MethodOverrideProbeComponent::class);

    $html = Livewire::test(MethodOverrideProbeComponent::class)->html();

    preg_match('/data-ghost="([^"]*)"/', $html, $matches);
    expect($matches[1] ?? null)->not->toBeNull();

    $decoded = json_decode(html_entity_decode($matches[1], ENT_QUOTES), true);

    expect($decoded)->toBe([
        'm' => 'synthesize',
        'a' => [
            'increment' => ['m' => 'freeze', 'd' => 50],
        ],
    ]);
});

it('omits the "a" key entirely when no action method declares its own #[Ghost] (regression, #9)', function () {
    config(['ghostwire.learning.enabled' => false]);
    Livewire::component('data-ghost-probe-no-methods', DataGhostProbeComponent::class);

    $html = Livewire::test(DataGhostProbeComponent::class)->html();

    expect($html)->not->toContain('&quot;a&quot;');
});
