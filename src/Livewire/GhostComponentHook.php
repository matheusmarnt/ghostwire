<?php

namespace Ghostwire\Livewire;

use Ghostwire\Support\ConfigResolver;
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
// runs every attribute value through escapeStringForHtml(). That helper
// (vendor/livewire/livewire/src/Drawer/Utils.php:44-50) branches on the
// value's type: a string/numeric is run through htmlspecialchars() as-is,
// but anything else (our compact payload array) is first json_encode()'d and
// *then* run through htmlspecialchars(..., ENT_QUOTES|ENT_SUBSTITUTE). So
// passing the raw PHP array straight into insertAttributesIntoHtmlRoot()
// below is itself the real, confirmed serialize+escape path (SPEC-SEC-01) —
// no hand-rolled json_encode()/JSON_HEX_* call is needed or used here, since
// that would just double-encode. The JSON's double quotes end up rendered as
// `&quot;` in the raw HTML (correct, required escaping for a double-quoted
// attribute; browsers decode it back to `"` in the DOM/dataset).
// tests/Feature/Transport/*Test.php assert against the decoded value for
// this reason.
class GhostComponentHook extends ComponentHook
{
    public function render($view, $data)
    {
        return function ($html, $replaceHtml) {
            // $this->component is set by ComponentHookRegistry::initializeHook()
            // (vendor/livewire/livewire/src/ComponentHookRegistry.php) to the
            // concrete Livewire component instance this hook run is scoped
            // to — the real, confirmed way this hook knows "which component".
            // $method is always null here: this class-level resolve() call
            // stays the base layer only. Method-level #[Ghost] overrides
            // (SPEC-API-10, #9) are a separate, additional transport below
            // — every action method's own declared fields are gathered via
            // ConfigResolver::methodOverrides() and sent as the compact "a"
            // map, merged client-side into the matching action's config for
            // the duration of that one commit (js/src/index.js).
            $resolver = app(ConfigResolver::class);
            $componentClass = get_class($this->component);
            $resolved = $resolver->resolve($componentClass);
            $payload = $this->compactPayload($resolved, $resolver->literalDefaults());

            $methodOverrides = $this->compactMethodOverrides($resolver->methodOverrides($componentClass));
            if ($methodOverrides !== []) {
                $payload['a'] = $methodOverrides;
            }

            $replaceHtml(Utils::insertAttributesIntoHtmlRoot($html, [
                'data-ghost' => $payload,
            ]));
        };
    }

    /**
     * Compact-key, defaults-omitted payload for the `data-ghost` attribute
     * (SPEC-API-30). `m` (mode) is always present; every other key is
     * emitted only when it differs from the package default, and `only`/
     * `except`/`rows` are omitted entirely while still null.
     *
     * @param  array{mode: string, only: ?array, except: ?array, delay: int, hold: int, rows: ?int, poll: bool, sync: bool, lazy: bool}  $resolved
     * @param  array<string, mixed>  $defaults  from ConfigResolver::literalDefaults() — deliberately NOT defaults()/config()-driven values: the browser can only ever fall back to the fixed literal js/src/attributeConfig.js hardcodes, so a field must stay in the payload whenever it differs from that literal, even if it happens to match a deployment's customized config() value (config-drift fix).
     * @return array<string, mixed>
     */
    private function compactPayload(array $resolved, array $defaults): array
    {
        $keys = ['mode' => 'm', 'only' => 'o', 'except' => 'x', 'delay' => 'd', 'hold' => 'h', 'rows' => 'r', 'poll' => 'p', 'sync' => 's', 'lazy' => 'l'];

        $payload = ['m' => $resolved['mode']]; // mode always present

        foreach ($keys as $field => $key) {
            if ($field === 'mode') {
                continue;
            }

            $value = $resolved[$field];

            if ($value === null) {
                continue;
            }

            if (array_key_exists($field, $defaults) && $value === $defaults[$field]) {
                continue;
            }

            $payload[$key] = $value;
        }

        return $payload;
    }

    /**
     * @param  array<string, array<string, mixed>>  $methodOverrides  from ConfigResolver::methodOverrides()
     * @return array<string, array<string, mixed>>  action name => compact-key partial config
     */
    private function compactMethodOverrides(array $methodOverrides): array
    {
        $keys = ['mode' => 'm', 'delay' => 'd', 'hold' => 'h', 'rows' => 'r', 'poll' => 'p', 'sync' => 's', 'lazy' => 'l'];

        $compact = [];
        foreach ($methodOverrides as $action => $fields) {
            $entry = [];
            foreach ($fields as $field => $value) {
                if (array_key_exists($field, $keys)) {
                    $entry[$keys[$field]] = $value;
                }
            }
            if ($entry !== []) {
                $compact[$action] = $entry;
            }
        }

        return $compact;
    }
}
