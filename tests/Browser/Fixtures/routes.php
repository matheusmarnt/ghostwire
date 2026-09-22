<?php

use Composer\InstalledVersions;
use Illuminate\Support\Facades\Route;

Route::view('/ghostwire-test-page', 'ghostwire-fixtures::page', ['component' => 'demo-table']);

Route::view('/gallery/paginated-table', 'ghostwire-fixtures::page', ['component' => 'paginated-table']);
Route::view('/gallery/grouped-table', 'ghostwire-fixtures::page', ['component' => 'grouped-table']);
Route::view('/gallery/card-grid', 'ghostwire-fixtures::page', ['component' => 'card-grid']);
Route::view('/gallery/repeat-list', 'ghostwire-fixtures::page', ['component' => 'repeat-list']);
Route::view('/gallery/scrollable-kanban', 'ghostwire-fixtures::page', ['component' => 'scrollable-kanban']);
Route::view('/gallery/node-count', 'ghostwire-fixtures::page', ['component' => 'node-count']);

// Enforces a real, per-request-nonce CSP, at the strictest each Livewire
// line actually supports (see the note inside the closure) — and passes
// that same nonce into the fixture page, so
// @ghostwireStyles($nonce)/@ghostwireScripts($nonce) (Task 2) are
// exercised end to end, not just in isolation.
Route::get('/gallery/card-grid-strict-csp', function () {
    // Livewire evaluates wire:* expressions through Alpine's
    // new Function()-based evaluator. Livewire 4 ships an opt-in
    // CSP-safe Alpine build, enabled by this first-party config flag, so
    // the 4.x cells run under a policy with no 'unsafe-eval' at all. On
    // 3.x this flag has no effect: without 'unsafe-eval', Alpine cannot
    // evaluate anything, the #refresh-btn click never reaches Livewire,
    // and zero bones ever mount (observed in CI, __gwBoneCount === 0).
    // So the 3.x cell grants 'unsafe-eval' below — exactly what a real
    // Livewire 3 app must do — and this route therefore enforces the
    // strictest policy each line actually supports.
    config(['livewire.csp_safe' => true]);
    $isV4 = str_starts_with(InstalledVersions::getVersion('livewire/livewire'), '4.');
    $nonce = base64_encode(random_bytes(16));
    $scriptSrc = $isV4
        ? "script-src 'self' 'nonce-{$nonce}'"
        : "script-src 'self' 'unsafe-eval' 'nonce-{$nonce}'";

    return response()
        ->view('ghostwire-fixtures::page', ['component' => 'card-grid', 'nonce' => $nonce])
        ->header(
            'Content-Security-Policy',
            "{$scriptSrc}; style-src 'self' 'nonce-{$nonce}'; object-src 'none'; base-uri 'self'"
        );
});

Route::view('/ghostwire-ghost-attribute-probe', 'ghostwire-fixtures::page', ['component' => 'ghost-attribute-probe']);

// Fixture for tests/Browser/Timing/IslandLifecycleTest.php:
// a real Livewire 4 @island/@endisland block, proving island-scoped skeleton
// sizing against the real framework and the real built runtime.
Route::view('/ghostwire-island-demo', 'ghostwire-fixtures::page', ['component' => 'island-demo']);

// Issue #21 fixture for tests/Browser/Geometry/ResizeRepositionTest.php:
// a long-hold host whose skeleton stays up across a viewport resize.
Route::view('/ghostwire-resize-probe', 'ghostwire-fixtures::page', ['component' => 'resize-probe']);

// Issue #23 fixture for tests/Browser/Timing/DirectiveModifierTest.php: a host
// whose delay and hold come ONLY from wire:ghost.delay.600ms.hold.2000ms.
Route::view('/ghostwire-directive-timing-probe', 'ghostwire-fixtures::page', ['component' => 'directive-timing-probe']);

// Fixture for tests/Browser/Geometry/PanelBonesGeometryTest.php: a card with
// a real background + rounded corners, opted into panels ONLY via
// wire:ghost.panels in the view (no #[Ghost] attribute, no config override).
Route::view('/ghostwire-panel-card', 'ghostwire-fixtures::page', ['component' => 'panel-card']);

Route::view('/legacy/legacy-widget-one', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-one']);
Route::view('/legacy/legacy-widget-two', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-two']);
Route::view('/legacy/legacy-widget-three', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-three']);
Route::view('/legacy/legacy-widget-four', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-four']);
Route::view('/legacy/legacy-widget-five', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-five']);

// M7 DoD gate (tests/Browser/Learning/LazySkeletonTest.php): learning is off by
// default (config/ghostwire.php), so these routes turn it on for just their own
// request. Setting config inside the closure works because the component
// renders during the view render, after the closure body has already run.
Route::get('/ghostwire-lazy-declared-placeholder', function () {
    config(['ghostwire.learning.enabled' => true]);

    return view('ghostwire-fixtures::page', ['component' => 'lazy-declared-placeholder']);
});

Route::get('/ghostwire-learn-demo', function () {
    config(['ghostwire.learning.enabled' => true]);

    // Task 2: demo-table carries no #[Ghost] anywhere, so under the
    // default 'opt-in' strategy GhostComponentHook would gate off the whole
    // data-ghost transport — including the 'g'/'n' learning keys this route
    // exists to exercise. Forced global for this route only,
    // same reasoning as the learning.enabled override above: this test is
    // about the learning subsystem, not about opt-in activation itself.
    config(['ghostwire.strategy' => 'global']);

    return view('ghostwire-fixtures::page', ['component' => 'demo-table']);
});

Route::get('/ghostwire-lazy-learning', function () {
    config(['ghostwire.learning.enabled' => true]);

    return view('ghostwire-fixtures::page', ['component' => 'lazy-orders-table']);
});

Route::get('/ghostwire-lazy-fast-learning', function () {
    config(['ghostwire.learning.enabled' => true]);

    return view('ghostwire-fixtures::page', ['component' => 'lazy-fast-orders-table']);
});
