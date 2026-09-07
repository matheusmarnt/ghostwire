<?php

namespace Ghostwire\Livewire;

use Livewire\ComponentHook;
use Livewire\Drawer\Utils;

// Pendency A9 — confirmed against vendor/livewire/livewire v3.8.7:
// `Livewire\ComponentHook` (vendor/livewire/livewire/src/ComponentHook.php) is
// the real, public base class. Its `render($view, $data)` method — not
// `dehydrate()` or any "effects" hook — is the one whose return value carries
// the root-tag mutation: it must return a closure `function ($html, $replaceHtml)`
// that the framework invokes with the already-rendered HTML string and a
// setter callback. Calling `$replaceHtml($newHtml)` swaps the final output.
// The actual attribute injection is done via the framework's own
// `Livewire\Drawer\Utils::insertAttributesIntoHtmlRoot($html, $attributes)`
// (vendor/livewire/livewire/src/Drawer/Utils.php:13) — the same helper
// Livewire itself uses to stamp `wire:id` onto every component root — so no
// str_replace/string concatenation is needed here (SPEC-API-31).
// Registration is the facade call `Livewire\Livewire::componentHook($hookClass)`
// (vendor/livewire/livewire/src/LivewireManager.php:36), which forwards to
// `Livewire\ComponentHookRegistry::register($hook)`
// (vendor/livewire/livewire/src/ComponentHookRegistry.php:14).
// Ground truth for the render()-returns-a-closure shape: Livewire's own
// internal feature hooks that do exactly this — see
// vendor/livewire/livewire/src/Features/SupportNestedComponentListeners/SupportNestedComponentListeners.php:33-42
// and vendor/livewire/livewire/src/Features/SupportWireModelingNestedComponents/SupportWireModelingNestedComponents.php:57-75.
//
// Livewire v4.4.3: identical mechanism confirmed — same `ComponentHook` base
// class, same `render($view, $data)` closure shape, same
// `Utils::insertAttributesIntoHtmlRoot()` helper and same
// `Livewire::componentHook()` registration call (see
// vendor/livewire/livewire/src/ComponentHook.php,
// vendor/livewire/livewire/src/Features/SupportNestedComponentListeners/SupportNestedComponentListeners.php
// after switching composer's livewire/livewire constraint to ^4.0). No
// version branching required.
//
// Empirically confirmed side effect (both versions): Utils::stringifyHtmlAttributes()
// runs every attribute value through escapeStringForHtml(), i.e.
// htmlspecialchars(..., ENT_QUOTES) — so the JSON payload's double quotes are
// rendered as `&quot;` in the raw HTML (correct, required escaping for a
// double-quoted attribute; browsers decode it back to `"` in the DOM/dataset).
// tests/Feature/Transport/ComponentHookTest.php asserts against the decoded
// value for this reason.
class GhostComponentHook extends ComponentHook
{
    public function render($view, $data)
    {
        return function ($html, $replaceHtml) {
            // Task 1 only proves the wiring: a fixed literal payload.
            // Task 3 replaces this with real Ghostwire\ConfigResolver output.
            $replaceHtml(Utils::insertAttributesIntoHtmlRoot($html, [
                'data-ghost' => '{"m":"synthesize"}',
            ]));
        };
    }
}
