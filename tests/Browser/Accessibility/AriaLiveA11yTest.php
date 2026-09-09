<?php

// tests/Browser/Accessibility/AriaLiveA11yTest.php
//
// SPEC-A11Y-01/03/04 (behavioral) and the M5 DoD gate "axe-core sem achado"
// (SDD §16). The behavioral tests follow the same MutationObserver +
// performance.now() recording pattern tests/Browser/Timing/FreezeLifecycleTest.php
// already established for this codebase — a point-in-time snapshot at a
// guessed wait offset was empirically flaky there; recording real transition
// timestamps/booleans is not.
//
// assertNoAccessibilityIssues(3) (not the default of 1): SDD's M5 DoD text is
// "axe-core sem achado" — zero findings of ANY severity, not just
// critical+serious. Level 3 is the strictest available (confirmed against
// vendor/pestphp/pest-plugin-browser/src/Enums/AccessibilityIssueLevel.php:
// 0=critical .. 3=minor, and MakesConsoleAssertions::assertNoAccessibilityIssues()
// keeps violations at or more severe than the given level).

it('SPEC-A11Y-01: #list (synthesize) gets aria-busy while its ghost is visible, cleared once settled', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { busyAt: null, clearedAt: null };
        const list = document.getElementById("list");
        new MutationObserver(() => {
            if (list.getAttribute("aria-busy") === "true" && window.__gw.busyAt === null) {
                window.__gw.busyAt = performance.now();
            } else if (list.getAttribute("aria-busy") === null && window.__gw.busyAt !== null && window.__gw.clearedAt === null) {
                window.__gw.clearedAt = performance.now();
            }
        }).observe(list, { attributes: true, attributeFilter: ["aria-busy"] });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['busyAt'])->not->toBeNull();
    expect($data['clearedAt'])->not->toBeNull();
    expect($data['clearedAt'])->toBeGreaterThan($data['busyAt']);
});

it('SPEC-A11Y-01: #summary (freeze) also gets aria-busy while visible', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { busySeen: false };
        const summary = document.getElementById("summary");
        new MutationObserver(() => {
            if (summary.getAttribute("aria-busy") === "true") window.__gw.busySeen = true;
        }).observe(summary, { attributes: true, attributeFilter: ["aria-busy"] });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.5);

    expect($page->script('window.__gw.busySeen'))->toBeTrue();
});

it('SPEC-A11Y-03: focus inside a concealed host is restored after the ghost hides', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        const list = document.getElementById("list");
        list.setAttribute("tabindex", "-1");
        list.focus();
        window.__gw = { focusedBefore: document.activeElement === list, blurredDuring: null, refocused: null };
        new MutationObserver(() => {
            if (window.__gw.blurredDuring === null && list.classList.contains("gw-concealed")) {
                window.__gw.blurredDuring = document.activeElement !== list;
            }
            if (window.__gw.blurredDuring === true && window.__gw.refocused === null && !list.classList.contains("gw-concealed")) {
                window.__gw.refocused = document.activeElement === list;
            }
        }).observe(list, { attributes: true, attributeFilter: ["class"] });
        true;
    ');

    expect($page->script('window.__gw.focusedBefore'))->toBeTrue();

    // Plain $page->click('#refresh-btn') would itself steal focus onto the
    // button (clicking any native button focuses it) before Ghostwire's own
    // captureFocus ever runs, making blurredDuring/refocused vacuously true
    // regardless of Ghostwire's behavior. Click and immediately re-focus
    // #list in the same round-trip so focus is genuinely inside the host
    // when the 120ms show-delay elapses and captureFocus actually fires.
    $page->script('document.getElementById("refresh-btn").click(); document.getElementById("list").focus();');
    $page->wait(1.5);

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['blurredDuring'])->toBeTrue();
    expect($data['refocused'])->toBeTrue();
});

test('SPEC-A11Y DoD: demo table has no axe-core findings, at rest and while ghosted', function () {
    $page = visit('/ghostwire-test-page');
    $page->assertNoAccessibilityIssues(3);

    $page->click('#refresh-btn');
    $page->wait(0.2); // inside the visible window: delay(120ms) elapsed, hold(300ms) not yet

    $page->assertNoAccessibilityIssues(3);
});

test('SPEC-A11Y DoD: gallery layouts have no axe-core findings', function (string $route) {
    $page = visit($route);
    $page->assertNoAccessibilityIssues(3);
})->with([
    '/gallery/paginated-table',
    '/gallery/grouped-table',
    '/gallery/card-grid',
]);
