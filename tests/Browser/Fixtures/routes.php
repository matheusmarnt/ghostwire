<?php

use Illuminate\Support\Facades\Route;

Route::view('/ghostwire-test-page', 'ghostwire-fixtures::page', ['component' => 'demo-table']);

Route::view('/gallery/paginated-table', 'ghostwire-fixtures::page', ['component' => 'paginated-table']);
Route::view('/gallery/grouped-table', 'ghostwire-fixtures::page', ['component' => 'grouped-table']);
Route::view('/gallery/card-grid', 'ghostwire-fixtures::page', ['component' => 'card-grid']);
Route::view('/gallery/repeat-list', 'ghostwire-fixtures::page', ['component' => 'repeat-list']);
Route::view('/gallery/scrollable-kanban', 'ghostwire-fixtures::page', ['component' => 'scrollable-kanban']);
Route::view('/gallery/node-count', 'ghostwire-fixtures::page', ['component' => 'node-count']);

// SPEC-SEC-06 DoD: enforces a real strict CSP (script-src/style-src limited
// to 'self' plus a per-request nonce — the exact policy shape SDD §13.4
// names) and passes that same nonce into the fixture page, so
// @ghostwireStyles($nonce)/@ghostwireScripts($nonce) (Task 2) are exercised
// end to end, not just in isolation.
Route::get('/gallery/card-grid-strict-csp', function () {
    // Livewire's default JS bundle evaluates wire:* expressions via
    // new Function()/eval(), which this route's script-src (no
    // 'unsafe-eval') blocks outright — confirmed empirically via a
    // securitypolicyviolation listener reporting "script-src: eval"
    // before this line was added. Livewire ships a dedicated CSP-safe
    // Alpine build for exactly this case, toggled by this first-party
    // config flag; scoped to this route only (not a global test-suite
    // change) since this is the one route that declares itself strict CSP.
    config(['livewire.csp_safe' => true]);
    $nonce = base64_encode(random_bytes(16));

    return response()
        ->view('ghostwire-fixtures::page', ['component' => 'card-grid', 'nonce' => $nonce])
        ->header(
            'Content-Security-Policy',
            "script-src 'self' 'nonce-{$nonce}'; style-src 'self' 'nonce-{$nonce}'; object-src 'none'; base-uri 'self'"
        );
});

Route::view('/ghostwire-ghost-attribute-probe', 'ghostwire-fixtures::page', ['component' => 'ghost-attribute-probe']);

Route::view('/legacy/legacy-widget-one', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-one']);
Route::view('/legacy/legacy-widget-two', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-two']);
Route::view('/legacy/legacy-widget-three', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-three']);
Route::view('/legacy/legacy-widget-four', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-four']);
Route::view('/legacy/legacy-widget-five', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-five']);
