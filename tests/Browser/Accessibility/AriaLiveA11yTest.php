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

// Regression for the morph-strip bug the test above is structurally blind to:
// it only asserts clearedAt > busyAt, which holds just as well when aria-busy
// is cleared by Livewire's own attribute diffing mid-cycle as when it's cleared
// by a genuine settle. Livewire's patchAttributes removes ANY attribute on the
// live node that the freshly-rendered server node doesn't carry — a generic
// loop, not class-specific — so both aria-busy and .gw-concealed are wiped the
// instant a morph touches the host, long before the hold timer elapses.
//
// Checkpoint technique copied from GhostLayerMorphTest.php's own
// gw-frozen-reapply regression test (the closest existing precedent — same
// mechanism, same fix site): a later-registered `morphed` listener. Livewire's
// hook bus invokes listeners for an event in registration order without
// yielding to the event loop in between, so the runtime's boot-time `morphed`
// listener — and therefore its reapply — has already run by the time this one
// samples. That makes this a real mid-visible-window, post-morph observation
// rather than a fixed-offset guess at when the morph might land.
it('SPEC-A11Y-01/SPEC-MORPH-03: aria-busy and .gw-concealed survive the morph that lands mid-visible-window', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { morphFired: false, busyAtMorph: null, concealedAtMorph: null, summaryConcealedAtMorph: null };
        Livewire.hook("morphed", () => {
            if (window.__gw.morphFired) return;
            window.__gw.morphFired = true; // independent of the values below — a strip reads as null, which must NOT look like "no morph happened"
            const list = document.getElementById("list");
            window.__gw.busyAtMorph = list.getAttribute("aria-busy");
            window.__gw.concealedAtMorph = list.classList.contains("gw-concealed");
            window.__gw.summaryConcealedAtMorph = document.getElementById("summary").classList.contains("gw-concealed");
        });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: prove a real morph actually reconciled the host during this
    // interaction, so the checks below are meaningful rather than vacuous.
    // Deliberately a separate flag rather than "busyAtMorph !== null": against
    // the unfixed runtime the strip makes busyAtMorph null, and reporting that
    // as a failed sanity check would disguise the very bug this test exists to
    // catch as "no morph observed".
    expect($data['morphFired'])->toBeTrue();

    expect($data['busyAtMorph'])->toBe('true');
    expect($data['concealedAtMorph'])->toBeTrue();

    // Guards against over-applying: the reapply is gated on host.layer, so a
    // freeze-mode host (which never mounts a layer) must never pick up
    // .gw-concealed — dropping that gate would hide #summary's real content
    // behind nothing at all.
    expect($data['summaryConcealedAtMorph'])->toBeFalse();

    // And the reapplied attribute must still clear on the genuine settle —
    // proving the fix restores it without also stranding it.
    expect($page->script('document.getElementById("list").getAttribute("aria-busy")'))->toBeNull();
    expect($page->script('document.getElementById("list").classList.contains("gw-concealed")'))->toBeFalse();
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

// SPEC-A11Y-03 (fix round 1): the original version of this test lived on
// /ghostwire-test-page and focused #list via a client-only tabindex="-1" —
// #list has no naturally-focusable content, and #refresh-btn there is a
// SIBLING of #list/#summary, not a descendant, so the click itself stole
// focus onto the button before captureFocus ever ran, and even after fixing
// that, Livewire's morph stripped the client-only tabindex before
// restoreFocus ran, so #list was never focusable again by then either.
// /gallery/card-grid's #refresh-btn (tests/Browser/Fixtures/views/gallery/card-grid.blade.php)
// is a real, server-rendered, always-present button *inside* the wire:ghost
// host (#card-grid) — genuinely focusable with no client-side hack, and
// stable across the morph since its markup never changes between requests.
//
// A synchronous read of document.activeElement inside the class-mutation
// MutationObserver callback is itself too early here, empirically: both the
// browser's forced blur (visibility: hidden landing on #card-grid) and
// restoreFocus()'s el.focus() call are *rendering-driven* focus changes, not
// synchronous with the class mutation that triggers the observer callback —
// a first version of this test read document.activeElement synchronously in
// that callback and measured focus landing back on #refresh-btn ~180ms after
// the gw-concealed class was actually removed, well after the observer had
// already (wrongly) recorded refocused as false. Poll for a short window
// after each transition instead of trusting the mutation callback's own
// instant, the same "measure the real transition, don't trust a
// point-in-time guess" principle FreezeLifecycleTest.php already established
// for this codebase's morph/class races.
it('SPEC-A11Y-03: focus inside a concealed host is restored after the ghost hides', function () {
    $page = visit('/gallery/card-grid');

    $page->script('
        window.__gw = { focusedAtClick: null, blurredDuring: null, refocused: null };
        const host = document.getElementById("card-grid");
        const btn = document.getElementById("refresh-btn");
        // Pre-condition recorded in-page, at the real moment it is true (see
        // the note below the assertions about why an out-of-band read races).
        btn.addEventListener("click", () => { window.__gw.focusedAtClick = document.activeElement === btn; });
        const pollUntil = (predicate, onSettle) => {
            const t0 = performance.now();
            const iv = setInterval(() => {
                if (predicate()) { onSettle(true); clearInterval(iv); }
                else if (performance.now() - t0 > 500) { onSettle(false); clearInterval(iv); }
            }, 5);
        };
        new MutationObserver(() => {
            if (window.__gw.blurredDuring === null && host.classList.contains("gw-concealed")) {
                pollUntil(() => document.activeElement !== btn, (blurred) => { window.__gw.blurredDuring = blurred; });
            }
            if (window.__gw.blurredDuring === true && window.__gw.refocused === null && !host.classList.contains("gw-concealed")) {
                pollUntil(() => document.activeElement === btn, (refocused) => { window.__gw.refocused = refocused; });
            }
        }).observe(host, { attributes: true, attributeFilter: ["class"] });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin + the polls' own <=500ms windows

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: clicking a native button focuses it, so #refresh-btn — genuinely
    // inside #card-grid — really did hold focus for captureFocus to capture.
    //
    // This used to be asserted with an inline `$page->script(...)` read placed
    // between the click and the wait, which is a race the test lost roughly as
    // often as it won: the assertion is an out-of-band round-trip, and conceal
    // (visibility: hidden) lands at click+~150ms and blurs the button. An
    // instrumented probe measured that round trip at 2.8ms on one run and
    // 257ms on another — identical code, pure harness scheduling variance — so
    // on the slow runs document.activeElement was already <body> and the
    // pre-condition failed even though it had genuinely held. Recording it
    // in-page from the click handler measures the real moment instead, the
    // same principle this file's polling helper and FreezeLifecycleTest.php
    // already apply to the transitions themselves.
    expect($data['focusedAtClick'])->toBeTrue();

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
