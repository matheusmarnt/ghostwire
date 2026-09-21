<?php

use Composer\InstalledVersions;

it('exposes the exact global symbols this package\'s bridge depends on, for whichever Livewire line is installed', function () {
    $installedVersion = InstalledVersions::getVersion('livewire/livewire');
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

        // Task 4c (diagnosis doc regression item 5): the surface probe above
        // only checks window.Livewire itself — it says nothing about the
        // shape of a real Message. Register a second interceptMessage
        // subscriber (Livewire supports more than one concurrently — its own
        // dist/livewire.esm.js calls interceptMessage internally several
        // times for its own features) and capture one via the #refresh-btn
        // click this test already has available. getActions() is called
        // unconditionally by js/src/bridge/v4.js, so its absence would crash
        // the real bridge — assert it's present. isSkipped is feature-
        // detected there instead (Task 1: absent on the 4.0.x floor, present
        // from ~4.3 onward) precisely because both shapes are valid, so this
        // only records its type, never requiring either.
        //
        // `typeof` wraps the interceptMessage(...) call itself: this Pest
        // browser plugin's script() completion-value handling was
        // empirically unreliable (registration intermittently never fired)
        // when the eval'd script's last statement is a bare call whose
        // return value is Livewire's live, non-JSON-serializable unsubscribe
        // closure — reproduced repeatedly across isolated runs, fixed
        // repeatedly across isolated runs by making the completion value a
        // plain string instead. interceptReturn's value is asserted below
        // too, so this isn't just a workaround shim.
        $page->script('
            window.__gwCapturedMessage = null;
            window.__gwInterceptReturn = typeof window.Livewire.interceptMessage(({ message }) => {
                if (window.__gwCapturedMessage === null) {
                    window.__gwCapturedMessage = {
                        hasGetActions: typeof message.getActions === "function",
                        isSkippedType: typeof message.isSkipped,
                    };
                }
            });
        ');

        expect($page->script('window.__gwInterceptReturn'))->toBe('function');

        $page->script('document.getElementById("refresh-btn").click();');
        $page->wait(1.5); // same margin as FreezeLifecycleTest.php: clears the 200ms server sleep + morph/settle

        $captured = json_decode($page->script('JSON.stringify(window.__gwCapturedMessage)'), true);

        expect($captured)->not->toBeNull();
        expect($captured['hasGetActions'])->toBeTrue();
        expect($captured['isSkippedType'])->toBeIn(['function', 'undefined']);
    }
});

// Regression test 6 (diagnosis doc item 6): "browser com
// livewire/livewire:4.0.*: acao dispara, zero erro de console, request
// enviado." Runs regardless of which Livewire line is installed (same as
// SmokeTest.php) — it becomes meaningful specifically on Task 4b's floor CI
// cell (pinned to 4.1.*, not the literal 4.0.x named in the diagnosis doc:
// v4.0.0-v4.0.3 are rejected by Composer's own advisory-block policy,
// confirmed live in CI; isSkipped() is absent through v4.2.3, so 4.1.*
// still reproduces the exact crash Task 1 fixed — see tests.yml's matching
// cell for the full investigation), where that crash would previously have
// reproduced (uncaught TypeError from calling .isSkipped() on a Message
// build that doesn't have it, killing every Livewire request on the page).
it('fires the refresh action and completes the round trip with zero JS errors', function () {
    $page = visit('/ghostwire-test-page');

    $page->assertPresent('#refresh-btn');

    $firstRowBefore = $page->script('document.querySelector("#list li").textContent');
    expect($firstRowBefore)->toBe('Row one');

    $page->script('document.getElementById("refresh-btn").click();');
    $page->wait(1.5); // same margin as FreezeLifecycleTest.php: clears the 200ms server sleep + morph/settle

    // DemoTable::refresh() reverses $rows server-side. Asserting the first
    // <li> flipped to "Row three" proves the request actually round-tripped
    // (sent, processed, response applied) — "request enviado" — not just
    // that the click didn't throw, which a silently no-op click could also
    // satisfy.
    $firstRowAfter = $page->script('document.querySelector("#list li").textContent');
    expect($firstRowAfter)->toBe('Row three');

    // assertNoJavaScriptErrors() is this Pest browser plugin's assertion for
    // "zero erro de console": it reads window.__pestBrowser.jsErrors, fed by
    // a window 'error' listener InitScript.php installs — exactly what an
    // uncaught TypeError (the isSkipped crash's actual failure mode) would
    // populate. assertNoConsoleLogs() was considered and rejected: grepped
    // vendor/pestphp/pest-plugin-browser/src/Playwright/InitScript.php and
    // confirmed it only intercepts console.log, which nothing in js/src/
    // ever calls (every diagnostic there is console.warn) — it would pass
    // vacuously and prove nothing.
    $page->assertNoJavaScriptErrors();
});
