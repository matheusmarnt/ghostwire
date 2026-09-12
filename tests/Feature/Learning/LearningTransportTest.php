<?php

use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Livewire\Livewire;

function ghostPayload(string $component): array
{
    $html = Livewire::test($component)->html();
    preg_match('/data-ghost="([^"]*)"/', $html, $matches);

    return json_decode(html_entity_decode($matches[1] ?? '{}', ENT_QUOTES), true);
}

it('does not transport learning when the config flag is off (SPEC-LRN-04 default)', function () {
    config(['ghostwire.learning.enabled' => false]);

    $payload = ghostPayload(GhostAttributeProbe::class);

    // Pins the negative: without this, a data-ghost attribute that vanished
    // entirely (regex miss falling back to '{}') would also read as a
    // passing refusal. Mode is always emitted, so this proves the attribute
    // genuinely rendered and was genuinely inspected.
    expect($payload)->toHaveKey('m')
        ->and($payload)->not->toHaveKey('g');
});

it('transports the learning flag and component name when enabled outside production', function () {
    config(['ghostwire.learning.enabled' => true]);
    app()->detectEnvironment(fn () => 'local');

    $payload = ghostPayload(GhostAttributeProbe::class);

    expect($payload['g'])->toBeTrue()
        ->and($payload['n'])->toBe('ghost-attribute-probe');
});

it('refuses to transport learning in production, whatever the config says (SPEC-LRN-04)', function () {
    config(['ghostwire.learning.enabled' => true]);
    app()->detectEnvironment(fn () => 'production');

    $payload = ghostPayload(GhostAttributeProbe::class);

    expect($payload)->toHaveKey('m')
        ->and($payload)->not->toHaveKey('g');
});

it('refuses to transport learning for a store driver it does not implement', function () {
    config(['ghostwire.learning.enabled' => true, 'ghostwire.learning.store' => 'redis']);
    app()->detectEnvironment(fn () => 'local');

    $payload = ghostPayload(GhostAttributeProbe::class);

    expect($payload)->toHaveKey('m')
        ->and($payload)->not->toHaveKey('g');
});
