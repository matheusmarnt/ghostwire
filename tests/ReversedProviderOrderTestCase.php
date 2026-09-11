<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Livewire\LivewireServiceProvider;

/**
 * Same app as TestCase, except LivewireServiceProvider registers first.
 *
 * TestCase::getPackageProviders() pins Ghostwire-then-Livewire, which is the
 * provider order that already worked even with componentHook() called from
 * boot(). Nothing in the suite exercised the reverse order — the one that
 * was actually broken — until this class (see
 * tests/Feature/Learning/ComponentHookRegistrationOrderTest.php).
 */
class ReversedProviderOrderTestCase extends TestCase
{
    protected function getPackageProviders($app): array
    {
        return [LivewireServiceProvider::class, GhostwireServiceProvider::class];
    }
}
