<?php

// tests/Browser/Timing/SilenceTest.php
//
// SPEC-API-20 — a sync-only commit (a property write with no action call)
// must never activate/freeze a host.
//
// Trigger mechanism, and why it differs from the plan snippet:
// The plan called `Livewire.find(wireId).$wire.set(...)`. Reading the
// installed Livewire v4 bundle (vendor/livewire/livewire/dist/livewire.js,
// `function find(id) { ...; return component && component.$wire; }`) shows
// Livewire.find() already returns the $wire proxy — the extra `.$wire` hop
// resolves through the wire object's dynamic-action-call fallback instead,
// which threw `TypeError: ...set is not a function` when tried verbatim.
// Fixed here by calling `.set(...)` directly on what Livewire.find() returns.
//
// A second, more consequential thing was checked empirically (captured the
// literal outgoing request body via a fetch wrapper): `.set(prop, value)`
// sends `"calls":[{"method":"$set",...}]` — i.e. its wire payload is NOT
// literal empty-calls. It is Livewire's own client API for a property write,
// but the wire protocol represents it as a call to the magic method `$set`
// rather than `calls: []`; every documented client-side sync path found
// (`.set()`, `.commit()`, and wire:model.live's internal `$commit()` call)
// populates exactly one `calls` entry ($set/$commit/$refresh) for
// bookkeeping/promise-resolution, never zero. This is a real gap this test
// found in js/src/bridge/v4.js's original `isSync: message.getActions()
// .length === 0` check (SDD-ghostwire.md:559 defines SPEC-API-20 as "payload
// de calls vazio", but no client-triggered property sync in this Livewire
// version ever produces one) — fixed there by also treating an all-$set
// actions list as sync (see the comment on `isSync` in v4.js). `.set()`
// remains the trigger here since it's the closest representative of "a
// property write with no user-defined action call" without modifying the
// shared fixture.
//
// A fetch delay is added (client-side only, not a fixture/js/src change) so
// the round trip genuinely exceeds the 120ms show delay — without it, a fast
// local response finishes before the delay elapses regardless of whether
// SPEC-API-20 silence is implemented, which would make this assertion pass
// vacuously via SPEC-TIME-01 alone rather than proving silence.
//
// Recording (not a fixed-offset snapshot) follows the same technique as
// FreezeLifecycleTest.php and Task 10's tests/Browser/Morph/GhostLayerMorphTest.php:
// a MutationObserver is armed on #summary's class attribute BEFORE the
// trigger fires, and records whether gw-frozen was EVER added at any point
// during a generous window — not just whether it's absent at one sampled
// instant.

it('does not activate any host for a sync-only message with no action calls (SPEC-API-20)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { everFrozen: false, calls: null };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class" && summary.classList.contains("gw-frozen")) {
                window.__gw.everFrozen = true;
            }
        }).observe(summary, { attributes: true });

        // Capture the real outgoing request body so the assertion below can
        // be interpreted against what was actually sent, not assumed.
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args) => {
            try {
                const body = args[1] && args[1].body;
                if (body && window.__gw.calls === null) {
                    const parsed = JSON.parse(String(body));
                    window.__gw.calls = parsed.components?.[0]?.calls ?? null;
                }
            } catch (e) {}
            // Delay only the underlying network call (not Livewire\'s own
            // dispatch), so the round trip genuinely exceeds the 120ms show
            // delay and this test cannot pass merely because the response
            // was fast enough for SPEC-TIME-01 to mask the question.
            return new Promise((resolve) => {
                setTimeout(() => resolve(origFetch(...args)), 250);
            });
        };
        true;
    ');

    $page->script('
        const wireId = document.getElementById("summary").closest("[wire\\\\:id]").getAttribute("wire:id");
        const c = window.Livewire.find(wireId);
        c.set("rows", c.rows);
    ');
    $page->wait(2.0); // generous: clears the artificial 250ms fetch delay + delay(120) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['everFrozen'])->toBeFalse();
});

it('does not activate a host for a real wire:model.live keystroke sync, the actual named regression (SPEC-API-20)', function () {
    // The `.set()` test above proves isSync recognizes the $set magic
    // action, but the real-world scenario this spec exists for is typing
    // into a wire:model.live-bound input — which syncs via $commit, not
    // $set (confirmed: vendor/livewire/livewire/dist/livewire.js's model
    // directive calls component.$wire.$commit() for live/debounced
    // updates). This exercises that directly: a wire:model.live input is
    // injected into the existing fixture component at runtime via Alpine's
    // own initTree — not a shared-fixture change (tests/Browser/Fixtures/*
    // is untouched) — then a real keystroke ('input' event) is dispatched
    // against it.
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { everFrozen: false };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class" && summary.classList.contains("gw-frozen")) {
                window.__gw.everFrozen = true;
            }
        }).observe(summary, { attributes: true });

        const root = document.getElementById("summary").closest("[wire\\\\:id]");
        const input = document.createElement("input");
        input.id = "gw-diag-model-input";
        input.setAttribute("wire:model.live", "rows");
        root.appendChild(input);
        window.Alpine.initTree(input);

        // Same rationale as the test above: delay the network round trip so
        // it genuinely exceeds the 120ms show delay, so this cannot pass
        // vacuously just because the response was fast.
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args) => new Promise((resolve) => {
            setTimeout(() => resolve(origFetch(...args)), 250);
        });
        true;
    ');

    $page->script('
        const input = document.getElementById("gw-diag-model-input");
        input.value = "typed";
        input.dispatchEvent(new Event("input", { bubbles: true }));
    ');
    $page->wait(2.0); // generous: clears wire:model.live's own default 150ms debounce + the 250ms fetch delay + delay(120) + hold(300) margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['everFrozen'])->toBeFalse();
});
