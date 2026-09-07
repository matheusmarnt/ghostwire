<?php

// tests/Browser/Timing/RenderlessTest.php
//
// SPEC-API-22 — a Renderless-triggered commit must not activate a host,
// "no configurable exception, either line."
//
// Investigation (Task 6, mirrors A9/A12's empirical discipline — full
// findings in .superpowers/sdd/m4-ghost-attribute/task-6-report.md):
// captured the real message/response shape for DemoTable::renderlessBump(),
// a genuine #[Renderless] action (tests/Browser/Fixtures/DemoTable.php), via
// a temporary interceptor logging to window.__gw and reading it back with
// $page->script(). Two confirmed facts drove js/src/bridge/v4.js's
// implementation:
//
// 1. A plain `wire:click="renderlessBump"` carries NO client-side marker at
//    all -- action.metadata was `{}` at intercept time, identical to any
//    ordinary action (the #[Renderless] PHP attribute is resolved purely
//    server-side, via reflection, never dehydrated to the client ahead of a
//    request). The only reliable signal is the RESPONSE: its effects object
//    never gets an "html" key (confirmed: {returns:[...]} for the Renderless
//    action vs {returns:[...], html:"..."} for an ordinary one). That signal
//    only exists post-response (in onSuccess), strictly after onStart has
//    already run and, if nothing else filtered the host, already called
//    scheduler.messageStart for it.
// 2. A `wire:click.renderless="method"` directive modifier, by contrast, DOES
//    set action.metadata.renderless = true client-side before the request is
//    sent -- confirmed by grepping the installed dist bundle. This case is
//    knowable synchronously, so index.js can gate scheduler.messageStart
//    with it -- true "no exception" compliance, same as isPoll/isSync.
//
// Net effect, faithfully reflected in these two tests rather than guessed:
// the `.renderless`-modifier case gets full, non-vacuous suppression (test
// below proves it with a real >120ms-delay action, same anti-vacuous
// technique as SilenceTest.php: artificial fetch delay + MutationObserver
// armed before the trigger, recording whether gw-frozen was EVER added, not
// just sampled once). The plain #[Renderless]-PHP-attribute case (no
// modifier) can only be corrected after the fact -- js/src/index.js
// deliberately does NOT skip the scheduler bookkeeping calls once
// scheduler.messageStart has already run for a host, to avoid leaking
// host.pending and stranding it visually stuck (see index.js's comment on
// bridge.subscribe). The second test below confirms that real, bounded
// consequence: the host may show briefly, but always recovers within the
// generous configured window -- never left stuck.

it('never activates a host for a `.renderless`-modified commit, even when the response is slower than the show delay (SPEC-API-22, synchronous detection)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { everFrozen: false };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class" && summary.classList.contains("gw-frozen")) {
                window.__gw.everFrozen = true;
            }
        }).observe(summary, { attributes: true });

        // Inject a `.renderless`-modified action at runtime, same technique
        // SilenceTest.php uses for wire:model.live -- tests/Browser/Fixtures/*
        // stays untouched for this sub-case. Reuses refresh() (its own
        // 200ms usleep already exceeds the 120ms show delay); the
        // `.renderless` modifier forces the server to skip rendering
        // regardless of what the method itself does.
        const root = document.getElementById("summary").closest("[wire\\\\:id]");
        const button = document.createElement("button");
        button.id = "gw-diag-renderless-btn";
        button.setAttribute("wire:click.renderless", "refresh");
        root.appendChild(button);
        window.Alpine.initTree(button);

        // Delay only the underlying network call so the round trip genuinely
        // exceeds the 120ms show delay -- same rationale as SilenceTest.php.
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args) => new Promise((resolve) => {
            setTimeout(() => resolve(origFetch(...args)), 250);
        });
        true;
    ');

    $page->script('document.getElementById("gw-diag-renderless-btn").click();');
    $page->wait(2.0); // generous: clears the artificial 250ms fetch delay + delay(120) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['everFrozen'])->toBeFalse();
});

it('always resolves back to non-frozen for a plain #[Renderless] PHP-attribute action with no directive modifier, even if it briefly activates (SPEC-API-22, confirmed post-response-only signal, no stuck-host regression)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { frozenAtEnd: null };
        true;
    ');

    $page->script('document.getElementById("renderless-btn").click();');
    $page->wait(2.0); // generous: clears renderlessBump()\'s own 200ms usleep + delay(120) + hold(300) + morph/settle margin

    $data = json_decode($page->script('
        JSON.stringify({ frozenAtEnd: document.getElementById("summary").classList.contains("gw-frozen") });
    '), true);

    expect($data['frozenAtEnd'])->toBeFalse();
});
