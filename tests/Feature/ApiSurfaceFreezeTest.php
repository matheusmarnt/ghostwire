<?php

// tests/Feature/ApiSurfaceFreezeTest.php
//
// SPEC-API-50 / SPEC-PKG-11: the public API is frozen at v1.0. This test is
// the enforcement mechanism — it fails the moment any of the four public
// surfaces below changes shape, forcing a deliberate, reviewed update here
// (and a CHANGELOG/major-version decision) instead of a silent drift.

use Ghostwire\Attributes\Ghost;

it('freezes the #[Ghost] attribute constructor signature', function () {
    $ctor = new ReflectionMethod(Ghost::class, '__construct');
    $params = collect($ctor->getParameters())->map(fn (ReflectionParameter $p) => [
        'name' => $p->getName(),
        'type' => (string) $p->getType(),
        'default' => $p->isDefaultValueAvailable() ? $p->getDefaultValue() : null,
    ])->all();

    expect($params)->toBe([
        ['name' => 'mode', 'type' => 'string', 'default' => 'synthesize'],
        ['name' => 'only', 'type' => '?array', 'default' => null],
        ['name' => 'except', 'type' => '?array', 'default' => null],
        ['name' => 'delay', 'type' => '?int', 'default' => null],
        ['name' => 'hold', 'type' => '?int', 'default' => null],
        ['name' => 'rows', 'type' => '?int', 'default' => null],
        ['name' => 'poll', 'type' => 'bool', 'default' => false],
        ['name' => 'sync', 'type' => 'bool', 'default' => false],
        ['name' => 'lazy', 'type' => 'bool', 'default' => false],
    ]);
});

it('freezes config/ghostwire.php\'s public key set', function () {
    $config = require __DIR__.'/../../config/ghostwire.php';

    expect(array_keys($config))->toBe(['enabled', 'strategy', 'mode', 'timing', 'silence', 'synthesis', 'learning'])
        ->and(array_keys($config['timing']))->toBe(['delay', 'hold', 'timeout'])
        ->and(array_keys($config['silence']))->toBe(['poll', 'sync'])
        ->and(array_keys($config['synthesis']))->toBe(['max_depth', 'max_bones', 'repeat_sample_size'])
        ->and(array_keys($config['learning']))->toBe(['enabled', 'store', 'quota_kb']);
});

it('freezes the CSS custom-property token set', function () {
    $css = file_get_contents(__DIR__.'/../../js/src/style.css');
    preg_match_all('/--ghostwire-[a-z-]+(?=:)/', $css, $matches);
    $tokens = array_values(array_unique($matches[0]));
    sort($tokens);

    expect($tokens)->toBe([
        '--ghostwire-animation',
        '--ghostwire-animation-speed',
        '--ghostwire-bone-color',
        '--ghostwire-bone-color-dark',
        '--ghostwire-bone-gap',
        '--ghostwire-bone-highlight',
        '--ghostwire-bone-highlight-dark',
        '--ghostwire-bone-radius',
        '--ghostwire-fade-duration',
    ]);
});
