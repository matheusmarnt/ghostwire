<?php

use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Livewire\Livewire;

it('injects a data-ghost attribute on the component root element (SPEC-API-31, pendency A9)', function () {
    // F10 (fix round 2): this file asserts an exact baseline payload and never mentioned
    // learning, so it silently broke under a whole-suite GHOSTWIRE_LEARNING=true run (the
    // env flag leaking in and adding g/n). Pinned off, matching LearningTransportTest.php's
    // established shape, so this stays the generic-transport baseline it's named for.
    config(['ghostwire.learning.enabled' => false]);

    $html = Livewire::test(GhostAttributeProbe::class)->html();

    // The root element Livewire renders for this component must carry the attribute.
    //
    // Note: Livewire's own root-attribute helper (Livewire\Drawer\Utils::
    // insertAttributesIntoHtmlRoot(), confirmed in GhostComponentHook.php's
    // header comment — the same helper that stamps wire:id) HTML-entity-
    // escapes double quotes in attribute values via htmlspecialchars(...,
    // ENT_QUOTES). A literal, unescaped '"' inside a double-quoted HTML
    // attribute would terminate the attribute early and produce broken
    // markup, so the raw HTML will always contain `&quot;` here — that is
    // correct, required HTML, not a bug. We assert on the *decoded* value so
    // the test verifies the payload's content (per the brief's own
    // interface contract: "a data-ghost=... attribute appears... nothing
    // about how it got there"), not one specific escaping style.
    preg_match('/data-ghost="([^"]*)"/', $html, $matches);

    expect($matches[1] ?? null)->not->toBeNull();
    expect(html_entity_decode($matches[1], ENT_QUOTES))->toBe('{"m":"synthesize"}');
});
