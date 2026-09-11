<?php

namespace Ghostwire\Tests\Feature\Learning;

use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Ghostwire\Tests\ReversedProviderOrderTestCase;
use Livewire\Livewire;

/**
 * Regression coverage for the componentHook() registration-order fix
 * (SPEC-LRN-02 commit): tests/TestCase.php pins Ghostwire-then-Livewire
 * provider order, which is the order that already worked even when
 * componentHook() was called from boot(). This is the only test in the
 * suite that boots Livewire's own provider first — the order that was
 * actually broken.
 */
class ComponentHookRegistrationOrderTest extends ReversedProviderOrderTestCase
{
    public function test_still_registers_the_ghost_component_hook_when_livewire_boots_first(): void
    {
        $html = Livewire::test(GhostAttributeProbe::class)->html();

        // Only proves the hook actually ran (GhostComponentHook stamps this
        // attribute from its render() hook) under the provider order that
        // broke when componentHook() was called from boot().
        $this->assertStringContainsString('data-ghost="', $html);
    }
}
