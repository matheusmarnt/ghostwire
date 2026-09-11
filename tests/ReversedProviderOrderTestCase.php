<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Livewire\ComponentHookRegistry;
use Livewire\LivewireServiceProvider;
use ReflectionProperty;

/**
 * Same app as TestCase, except LivewireServiceProvider registers first.
 *
 * TestCase::getPackageProviders() pins Ghostwire-then-Livewire, which is the
 * provider order that already worked even with componentHook() called from
 * boot(). Nothing in the suite exercised the reverse order — the one that
 * was actually broken — until this class (see
 * tests/Feature/Learning/ComponentHookRegistrationOrderTest.php).
 *
 * ComponentHookRegistry::$componentHooks
 * (vendor/livewire/livewire/src/ComponentHookRegistry.php:12) is a
 * process-static array that register() only ever appends to — it is never
 * reset between tests. Every other test in the suite boots the base
 * TestCase, which registers GhostComponentHook into it, so by the time this
 * test runs inside a full-suite process the hook is already present
 * regardless of what this test's own provider order does, and the
 * assertion in ComponentHookRegistrationOrderTest would pass for the wrong
 * reason. Reflection-clearing the array before boot (and restoring it
 * after, so later tests in the same process aren't affected) makes this
 * test's own register()/boot() cycle the only source of truth. This is the
 * same Reflection-on-Livewire-internals pattern already used in
 * src/Commands/InspectCommand.php (readProtected()).
 *
 * ComponentHookRegistry::boot() also resets its per-component WeakMap fresh
 * on every boot and always attaches the generic on('render', ...) etc.
 * dispatchers regardless of $componentHooks — but it only wires the
 * on('mount')/on('hydrate') closures that populate that WeakMap for
 * whatever is in $componentHooks at that instant. Clearing the array is
 * therefore sufficient: those per-test listeners are attached fresh to a
 * per-test EventBus either way, so there is nothing else static to reset.
 */
class ReversedProviderOrderTestCase extends TestCase
{
    private array $originalComponentHooks;

    protected function getPackageProviders($app): array
    {
        return [LivewireServiceProvider::class, GhostwireServiceProvider::class];
    }

    protected function setUp(): void
    {
        $property = $this->componentHooksProperty();
        $this->originalComponentHooks = $property->getValue();
        $property->setValue(null, []);

        parent::setUp();
    }

    protected function tearDown(): void
    {
        parent::tearDown();

        $this->componentHooksProperty()->setValue(null, $this->originalComponentHooks);
    }

    private function componentHooksProperty(): ReflectionProperty
    {
        $property = new ReflectionProperty(ComponentHookRegistry::class, 'componentHooks');
        $property->setAccessible(true);

        return $property;
    }
}
