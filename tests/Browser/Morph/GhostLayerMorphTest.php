<?php

// tests/Browser/Morph/GhostLayerMorphTest.php
//
// Risk-critical: SDD-ghostwire.md §5 — "Falha aqui produz corrupção visual de
// DOM, pior que a ausência do produto." These tests drive a real browser
// (Playwright/Chromium) against a real Livewire component and the real built
// runtime (resources/dist/ghostwire.js) to prove the Ghost Layer never
// interferes with Livewire's own DOM reconciliation.
//
// $page->wait() (Pest\Browser\Api\Concerns\InteractsWithTab::wait) takes
// SECONDS, not milliseconds — confirmed by reading the installed
// vendor/pestphp/pest-plugin-browser/src/Api/Concerns/InteractsWithTab.php
// and Execution::wait(), which forwards straight to revolt/event-loop's
// delay($seconds).
//
// Tests 2, 3, 4 and 5 record real in-browser events (MutationObserver +
// Livewire.hook) instead of guessing a fixed millisecond offset at which to
// take a point-in-time snapshot. This was a deliberate correction after
// empirically measuring (via an instrumented throwaway diagnostic, not
// committed) that the actual show→morph→hide cycle for this fixture is far
// faster and narrower (~130ms to ~350ms after click) than the configured
// delay(120ms)/hold(300ms) would suggest — a fixed "wait 150ms then sample"
// approach was flaky, sometimes sampling before the layer had mounted at
// all. Recording every relevant event over one generous 1s window (>3x the
// observed cycle length) and asserting on the recording removes that
// flakiness entirely and lets each test unambiguously report whether the
// SPEC-MORPH property genuinely held.

it('leaves the host outerHTML byte-identical after a full show/hide cycle (SPEC-MORPH-03)', function () {
    $page = visit('/ghostwire-test-page');

    $before = $page->script('document.getElementById("summary").outerHTML.replace(/\\s*class="[^"]*"/, "")');
    $firstRowBefore = $page->script('document.querySelector("#list li").textContent');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous: clears delay(120) + hold(300) + response + morph + rAF settle margin

    $after = $page->script('document.getElementById("summary").outerHTML.replace(/\\s*class="[^"]*"/, "")');
    $firstRowAfter = $page->script('document.querySelector("#list li").textContent');

    // Sanity: prove the refresh really round-tripped through the server and
    // Livewire actually reconciled the DOM — otherwise a no-op click would
    // make the identity check below pass vacuously.
    expect($firstRowAfter)->not->toBe($firstRowBefore);

    expect($after)->toBe($before);
});

it('never inserts the Ghost Layer inside the reconciled host subtree (SPEC-MORPH-01)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { layerAppeared: false, layerEverInsideList: false };
        const list = document.getElementById("list");

        // Fix 1: the layer now mounts to document.body (outside the
        // reconciled tree entirely), not as a DOM sibling of the host — so
        // that is what we watch for "did it mount at all".
        new MutationObserver((muts) => {
            for (const m of muts) for (const n of m.addedNodes) {
                if (n.nodeType === 1 && n.classList && n.classList.contains("gw-layer")) window.__gw.layerAppeared = true;
            }
        }).observe(document.body, { childList: true });

        // subtree: true — catches the layer even if it only ever existed
        // inside #list for a single microtask. This is still the core
        // SPEC-MORPH-01 property regardless of where the layer mounts.
        new MutationObserver((muts) => {
            for (const m of muts) for (const n of m.addedNodes) {
                if (n.nodeType === 1 && n.classList && n.classList.contains("gw-layer")) window.__gw.layerEverInsideList = true;
            }
        }).observe(list, { childList: true, subtree: true });

        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous window covering the entire show/morph/hide cycle

    $layerAppeared = $page->script('window.__gw.layerAppeared');
    $layerEverInsideList = $page->script('window.__gw.layerEverInsideList');

    // Sanity: prove the layer actually mounted at some point during the
    // interaction, so the "never inside the host" check below isn't
    // vacuously true because nothing was ever rendered.
    expect($layerAppeared)->toBeTrue();

    expect($layerEverInsideList)->toBeFalse();
});

it('registers morph.updating and morph.removing handlers that call skip() for Ghost Layer nodes (SPEC-MORPH-02)', function () {
    $page = visit('/ghostwire-test-page');

    // Fix 1 means the real Ghost Layer mounts to document.body and never
    // normally reaches the morphed tree, so this defensive line can't be
    // exercised by normal operation any more. This simulates "a Ghost Layer
    // node somehow ended up inside the reconciled tree" — the scenario
    // SPEC-MORPH-02 exists to guard against — by injecting a real
    // `.gw-layer` div into #list before the refresh.
    //
    // Traced (Fix 3) why a single morph.updating listener isn't enough:
    // Livewire's morph diff (context.patch, in the vendored livewire.js)
    // routes any node whose tag name doesn't match its positional
    // counterpart through swapElements() -> "morph.removing", never
    // "morph.updating" -- regardless of where in the children list the
    // mismatch occurs. A DIV among LI siblings is always tag-mismatched, so
    // it always takes that path (confirmed empirically: updatingCalls: 0,
    // removingCalls: 1). js/src/index.js now registers the identical
    // skip()-on-sight guard on both hooks, so both are counted here.
    //
    // Livewire's hook bus (js/hooks.js: trigger2) invokes every listener
    // registered for a given event, in registration order, and does not
    // short-circuit when an earlier listener calls skip(). The runtime's
    // own hooks register first (at boot, before this script runs), so
    // proving our own identically-conditioned listeners observe the
    // injected node is direct, live evidence the runtime\'s handlers did
    // too -- and the probe-survival check below proves skip() actually
    // protected it, not merely that some hook fired.
    $page->script('
        window.__gwSkipCalls = 0;
        Livewire.hook("morph.updating", ({ el }) => {
            if (el.classList && el.classList.contains("gw-layer")) { window.__gwSkipCalls++; }
        });
        Livewire.hook("morph.removing", ({ el }) => {
            if (el.classList && el.classList.contains("gw-layer")) { window.__gwSkipCalls++; }
        });
        const probe = document.createElement("div");
        probe.className = "gw-layer";
        document.getElementById("list").appendChild(probe);
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous window covering the entire show/morph/hide cycle

    $skipCalls = $page->script('window.__gwSkipCalls');

    // Must have actually fired for the injected Ghost Layer node — merely
    // checking `typeof window.__gwSkipCalls === "number"` would pass even
    // if neither hook ever registered, since the counter is a number from
    // the moment it's initialized to 0.
    expect($skipCalls)->toBeGreaterThan(0);

    // Direct behavioral proof, not just that a hook fired: the injected
    // probe must still be exactly where it was left — not swapped out, not
    // removed — proving skip() (called by the runtime's own handler)
    // genuinely protected it, closing the gap the original diagnostic found.
    $probeSurvived = $page->script('document.getElementById("list").querySelector(".gw-layer") !== null');

    expect($probeSurvived)->toBeTrue();
});

it('reuses the same Ghost Layer element across a morph rather than recreating it (SPEC-MORPH-04)', function () {
    $page = visit('/ghostwire-test-page');

    // Stash a reference to the exact node object the first time a
    // `.gw-layer` element is added (Fix 1: to document.body, outside the
    // reconciled tree entirely). At the moment the morph completes
    // (`morphed` hook — same event-driven checkpoint technique as the
    // freeze-reapply regression test below, chosen over a fixed-offset wait
    // because a late fixed check risks landing after the scheduler's own
    // hold-driven removeLayer() has already detached the node, which would
    // make "not found" look like a false failure rather than the real
    // identity question this test asks), record whether whatever is
    // currently in the DOM as `.gw-layer` is the *same object* as the one
    // first mounted. A destroy-and-recreate cycle would have swapped in a
    // different node by then.
    $page->script('
        window.__gw = { firstLayer: null, identityAtMorph: null };

        new MutationObserver((muts) => {
            for (const m of muts) for (const n of m.addedNodes) {
                if (n.nodeType === 1 && n.classList && n.classList.contains("gw-layer") && !window.__gw.firstLayer) {
                    window.__gw.firstLayer = n;
                }
            }
        }).observe(document.body, { childList: true });

        if (window.Livewire && window.Livewire.hook) {
            Livewire.hook("morphed", () => {
                if (window.__gw.identityAtMorph === null) {
                    const current = document.body.querySelector(".gw-layer");
                    window.__gw.identityAtMorph = window.__gw.firstLayer !== null && current === window.__gw.firstLayer;
                }
            });
        }

        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous window covering the entire show/morph/hide cycle

    $morphed = $page->script('window.__gw.identityAtMorph !== null');

    // Sanity: prove a real morph actually reconciled the host during this
    // interaction, so the identity check below is meaningful rather than
    // vacuous (nothing to "survive" if no morph ever ran).
    expect($morphed)->toBeTrue();

    $identityStable = $page->script('window.__gw.identityAtMorph');

    expect($identityStable)->toBeTrue();
});

it('freeze mode host classList no longer carries gw-frozen once idle again (cleanup on hide)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { frozenEverApplied: false };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class" && summary.classList.contains("gw-frozen")) {
                window.__gw.frozenEverApplied = true;
            }
        }).observe(summary, { attributes: true });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous window covering the entire show/morph/hide cycle

    $frozenEverApplied = $page->script('window.__gw.frozenEverApplied');

    // Sanity: prove the class really was applied at some point, so "it's
    // gone now" below proves cleanup rather than freeze() never having run.
    expect($frozenEverApplied)->toBeTrue();

    $stillFrozen = $page->script('document.getElementById("summary").classList.contains("gw-frozen")');

    expect($stillFrozen)->toBeFalse();
});

it('reapplies gw-frozen immediately after a morph strips it, while the host is still supposed to be visible (regression for the hold-bypass fix)', function () {
    $page = visit('/ghostwire-test-page');

    // Livewire's own attribute diffing (patchAttributes) strips any class
    // not present in the server-rendered HTML — including gw-frozen — the
    // instant a morph touches #summary, regardless of the configured hold
    // duration. js/src/index.js now registers a `morphed` listener that
    // reapplies the class (idempotent) right after any morph, for any host
    // still in the "visible" state. Livewire's hook bus calls listeners for
    // the same event in registration order and does not yield to the event
    // loop in between, so the runtime's own `morphed` listener (registered
    // at boot, before this script ever runs) has already run — and, if the
    // fix works, already reapplied the class — by the time our own
    // later-registered `morphed` listener observes it. This is event-driven
    // rather than a fixed-offset guess, so it isn't sensitive to exactly
    // when the morph happens to land.
    $page->script('
        window.__gw = { frozenRightAfterMorph: null };
        Livewire.hook("morphed", ({ component }) => {
            if (window.__gw.frozenRightAfterMorph === null) {
                window.__gw.frozenRightAfterMorph = document.getElementById("summary").classList.contains("gw-frozen");
            }
        });
        true;
    ');

    $page->click('#refresh-btn');
    $page->wait(1.0); // generous window covering the entire show/morph/hide cycle

    $fired = $page->script('window.__gw.frozenRightAfterMorph !== null');

    // Sanity: prove a real morph actually happened during this interaction,
    // so the check below is meaningful rather than vacuous.
    expect($fired)->toBeTrue();

    $frozenRightAfterMorph = $page->script('window.__gw.frozenRightAfterMorph');

    expect($frozenRightAfterMorph)->toBeTrue();
});
