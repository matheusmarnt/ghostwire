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

// SPEC-SEC-06 DoD: enforces a real, per-request-nonce CSP — the policy shape
// SDD §13.4 names, at the strictest each Livewire line actually supports (see
// the note inside the closure) — and passes that same nonce into the fixture
// page, so @ghostwireStyles($nonce)/@ghostwireScripts($nonce) (Task 2) are
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

    return view('ghostwire-fixtures::page', ['component' => 'demo-table']);
});

Route::get('/ghostwire-lazy-learning', function () {
    config(['ghostwire.learning.enabled' => true]);

    return view('ghostwire-fixtures::page', ['component' => 'lazy-orders-table']);
});
