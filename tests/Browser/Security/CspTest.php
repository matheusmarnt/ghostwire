<?php

// tests/Browser/Security/CspTest.php
//
// SPEC-SEC-06 DoD: "galeria verde sob CSP estrita". Scoped to one
// representative gallery fixture (card-grid) rather than duplicating a
// CSP-enforcing route per layout — the mechanism under test (whether the
// package's own assets/behavior survive a strict CSP) is identical across
// every fixture; per-layout geometry is already covered elsewhere
// (tests/Browser/Geometry/GalleryGeometryTest.php). A deliberate scope call,
// documented here rather than left implicit.
//
// The fixture route (tests/Browser/Fixtures/routes.php) enforces the
// strictest policy each Livewire line actually supports: no 'unsafe-eval'
// at all on Livewire 4 (via its opt-in csp_safe config flag), and
// 'unsafe-eval' granted on Livewire 3, whose stock Alpine evaluator cannot
// evaluate wire:* expressions without it. This test asserts zero
// violations under that policy on both lines; Ghostwire's own package-
// level guarantee — no eval, no new Function in the compiled bundle — is
// asserted statically and line-independently in
// tests/Feature/CspNonceTest.php.

test('the gallery still functions under a strict CSP (self + nonce, no unsafe-inline)', function () {
    $page = visit('/gallery/card-grid-strict-csp');

    $page->script('
        window.__gwCspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
            window.__gwCspViolations.push(e.violatedDirective + ": " + e.blockedURI);
        });
        window.__gwBoneCount = 0;
        new MutationObserver(() => {
            const layer = document.body.querySelector(".gw-layer");
            if (layer) window.__gwBoneCount = layer.querySelectorAll(".gw-bone").length;
        }).observe(document.body, { childList: true, subtree: true });
        true;
    ');

    $page->assertNoJavaScriptErrors();

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    // Violations recorded after the listener attached (page load itself is
    // covered indirectly: if CSP had blocked ghostwire.js or ghostwire.css
    // from loading at all, no .gw-bone would ever appear below).
    expect($page->script('window.__gwCspViolations'))->toBe([]);
    expect((int) $page->script('window.__gwBoneCount'))->toBeGreaterThan(0);
});
