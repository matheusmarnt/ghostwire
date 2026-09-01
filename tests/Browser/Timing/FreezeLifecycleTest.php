<?php

// tests/Browser/Timing/FreezeLifecycleTest.php
//
// SPEC-TIME-01 / SPEC-TIME-02 — proves the freeze mode's show delay (120ms)
// and visible hold (300ms) are genuinely enforced by the runtime, against a
// real browser + real Livewire commit + the real built runtime
// (resources/dist/ghostwire.js), not a mocked/fake-timer harness.
//
// $page->wait() (Pest\Browser\Api\Concerns\InteractsWithTab::wait) takes
// SECONDS, not milliseconds — confirmed by reading the installed
// vendor/pestphp/pest-plugin-browser/src/Api/Concerns/InteractsWithTab.php
// and Execution::wait(), which forwards straight to revolt/event-loop's
// delay($seconds). Every millisecond figure from the original plan snippet
// (wait(60), wait(160), ...) is converted to fractional seconds here.
//
// These tests replace the plan's fixed-offset "wait Nms then snapshot"
// pattern with in-browser event recording (a MutationObserver on #summary's
// class attribute, timestamped with performance.now()), following the same
// correction Task 10 made in tests/Browser/Morph/GhostLayerMorphTest.php: a
// point-in-time snapshot at a guessed offset is sensitive to exactly when
// Livewire's request/render cycle happens to land in this environment and
// was empirically flaky here, whereas recording the real transition
// timestamps and asserting on the *measured* deltas is deterministic
// regardless of scheduling jitter. All three tests below share this
// recording setup; each covers a distinct SPEC-TIME property.

it('does not become frozen before the 120ms delay elapses (SPEC-TIME-01)', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { clickAt: null, frozenAt: null };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class") {
                if (summary.classList.contains("gw-frozen") && window.__gw.frozenAt === null) {
                    window.__gw.frozenAt = performance.now();
                }
            }
        }).observe(summary, { attributes: true });
        true;
    ');

    $page->script('
        window.__gw.clickAt = performance.now();
        document.getElementById("refresh-btn").click();
    ');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: prove it really did become frozen during this interaction, so
    // the delay measurement below is meaningful rather than vacuous.
    expect($data['frozenAt'])->not->toBeNull();

    $delayMs = $data['frozenAt'] - $data['clickAt'];

    expect($delayMs)->toBeGreaterThanOrEqual(110);
});

it('becomes frozen shortly after the delay elapses', function () {
    $page = visit('/ghostwire-test-page');

    $page->script('
        window.__gw = { clickAt: null, frozenAt: null };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class") {
                if (summary.classList.contains("gw-frozen") && window.__gw.frozenAt === null) {
                    window.__gw.frozenAt = performance.now();
                }
            }
        }).observe(summary, { attributes: true });
        true;
    ');

    $page->script('
        window.__gw.clickAt = performance.now();
        document.getElementById("refresh-btn").click();
    ');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    expect($data['frozenAt'])->not->toBeNull();

    $delayMs = $data['frozenAt'] - $data['clickAt'];

    // Upper bound: proves the delay actually resolves promptly once the
    // 120ms threshold passes, rather than the host just never freezing
    // and this test only passing because $data['frozenAt'] was null (the
    // sanity check above already rules that out) or delayed indefinitely.
    expect($delayMs)->toBeLessThan(700);
});

it('holds visible for at least 300ms after becoming visible, even though the request finishes sooner (SPEC-TIME-02)', function () {
    $page = visit('/ghostwire-test-page');

    // A first pass at this test measured the class-removal timestamp naively
    // (first mutation where gw-frozen is absent) and got ~147ms, well under
    // the 300ms hold. That was a measurement bug, not a runtime one: the
    // morph that lands the refreshed HTML strips gw-frozen via Livewire's
    // own attribute diffing, and js/src/index.js's `morphed` hook (Task 10's
    // fix for the hold-bypass bug) reapplies it synchronously right after —
    // so the *first* removal is a transient strip-then-reapply mid-morph,
    // not the genuine end of the hold. Debounce: only count a removal as the
    // real unfreeze if the class is still absent 20ms later (the morph's
    // reapply happens essentially immediately, well inside that window; the
    // scheduler's real hold-timer-driven removal has nothing reapplying it).
    $page->script('
        window.__gw = { clickAt: null, frozenAt: null, unfrozenAt: null };
        const summary = document.getElementById("summary");
        new MutationObserver((muts) => {
            for (const m of muts) if (m.attributeName === "class") {
                const isFrozen = summary.classList.contains("gw-frozen");
                if (isFrozen && window.__gw.frozenAt === null) {
                    window.__gw.frozenAt = performance.now();
                } else if (!isFrozen && window.__gw.frozenAt !== null && window.__gw.unfrozenAt === null) {
                    setTimeout(() => {
                        if (!summary.classList.contains("gw-frozen") && window.__gw.unfrozenAt === null) {
                            window.__gw.unfrozenAt = performance.now();
                        }
                    }, 20);
                }
            }
        }).observe(summary, { attributes: true });
        true;
    ');

    $page->script('
        window.__gw.clickAt = performance.now();
        document.getElementById("refresh-btn").click();
    ');
    $page->wait(1.5); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: prove the full show -> hide cycle actually completed during
    // this interaction, so the hold measurement below is meaningful.
    expect($data['frozenAt'])->not->toBeNull();
    expect($data['unfrozenAt'])->not->toBeNull();

    $holdMs = $data['unfrozenAt'] - $data['frozenAt'];

    expect($holdMs)->toBeGreaterThanOrEqual(280);
});
