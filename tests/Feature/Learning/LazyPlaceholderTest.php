<?php

use Ghostwire\Tests\Browser\Fixtures\DemoTable;
use Ghostwire\Tests\Browser\Fixtures\LazyDeclaredPlaceholder;
use Ghostwire\Tests\Browser\Fixtures\LazyOrdersTable;
use Livewire\Livewire;

it('tags the lazy placeholder root with data-ghost-lazy (SPEC-LRN-02)', function () {
    $html = Livewire::test(LazyOrdersTable::class, ['lazy' => true])->html();

    expect($html)->toContain('data-ghost-lazy="lazy-orders-table"');
});

it('leaves a developer-declared placeholder completely alone (SPEC-LRN-05, FR-56)', function () {
    $html = Livewire::test(LazyDeclaredPlaceholder::class, ['lazy' => true])->html();

    expect($html)->toContain('my own placeholder')
        ->and($html)->not->toContain('data-ghost-lazy');
});

it('does not tag a lazy component that never opted in via #[Ghost(lazy: true)]', function () {
    $html = Livewire::test(DemoTable::class, ['lazy' => true])->html();

    expect($html)->not->toContain('data-ghost-lazy');
});

it('registers the Livewire component hook from register(), not boot()', function () {
    $source = file_get_contents(dirname(__DIR__, 3).'/src/GhostwireServiceProvider.php');

    $registerAt = strpos($source, 'public function register');
    $bootAt = strpos($source, 'public function boot');
    $registerBody = substr($source, $registerAt, $bootAt - $registerAt);

    expect($registerBody)->toContain('Livewire::componentHook(GhostComponentHook::class)');
});
