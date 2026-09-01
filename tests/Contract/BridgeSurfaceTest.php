<?php

it('exposes the exact global symbols this package\'s bridge depends on, for whichever Livewire line is installed (SPEC-INT-02)', function () {
    $installedVersion = \Composer\InstalledVersions::getVersion('livewire/livewire');
    $isV4 = str_starts_with($installedVersion, '4.');

    $page = visit('/ghostwire-test-page');

    $page->assertPresent('#refresh-btn');

    $surface = $page->script('({
        hasHook: typeof window.Livewire.hook === "function",
        hasDirective: typeof window.Livewire.directive === "function",
        hasInterceptMessage: typeof window.Livewire.interceptMessage === "function",
    })');

    expect($surface['hasDirective'])->toBeTrue();
    expect($surface['hasHook'])->toBeTrue();

    if ($isV4) {
        expect($surface['hasInterceptMessage'])->toBeTrue();
    }
});
