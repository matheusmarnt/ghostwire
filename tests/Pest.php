<?php

use Ghostwire\Tests\TestCase;

uses(TestCase::class)->in('Feature', 'Unit', 'Browser', 'Contract');

// Shared by tests/Browser/Performance/*. Returns the JS that instruments one
// show cycle from the page's main world. See ComplexityTest.php's header for
// why the measured quantity is a count of layout reads, never a duration.
function gwShowBurstProbeJs(): string
{
    return <<<'JS'
        window.__gwShowBurst = { reads: null, readsAfterLayerAppend: null, bones: null, layerAppends: 0 };
        (() => {
            let reads = 0;
            let afterAppend = 0;
            let inShow = false;
            let scheduled = false;
            // One flush per synchronous burst: the microtask runs when the
            // current task (and its promise continuations) finish, so every
            // instrumented call inside ghostwire's synchronous show path lands
            // in the same bucket, and Livewire's later response handling in
            // its own.
            const touch = () => {
                if (scheduled) return;
                scheduled = true;
                queueMicrotask(() => {
                    if (inShow) {
                        window.__gwShowBurst.reads = reads;
                        window.__gwShowBurst.readsAfterLayerAppend = afterAppend;
                        window.__gwShowBurst.bones = document.querySelectorAll('.gw-layer .gw-bone').length;
                    }
                    reads = 0; afterAppend = 0; inShow = false; scheduled = false;
                });
            };
            const onRead = () => { reads += 1; if (inShow) afterAppend += 1; touch(); };
            const wrap = (proto, name) => {
                const orig = proto[name];
                proto[name] = function (...args) { onRead(); return orig.apply(this, args); };
            };
            wrap(Element.prototype, 'getBoundingClientRect');
            wrap(Range.prototype, 'getClientRects');
            wrap(Range.prototype, 'getBoundingClientRect');
            const origGCS = window.getComputedStyle;
            window.getComputedStyle = function (...args) { onRead(); return origGCS.apply(this, args); };
            const origAppend = Node.prototype.appendChild;
            Node.prototype.appendChild = function (node) {
                if (node && node.classList && node.classList.contains('gw-layer')) {
                    inShow = true;
                    window.__gwShowBurst.layerAppends += 1;
                    touch();
                }
                return origAppend.call(this, node);
            };
        })();
        true;
    JS;
}

// Drives one full show cycle on $route and returns the instrumented counts
// for the synchronous burst that mounted the Ghost Layer.
function gwShowBurst(string $route, string $trigger = '#refresh-btn'): array
{
    $page = visit($route);
    $page->script(gwShowBurstProbeJs());
    // Dispatched from the page itself, not $page->click(), so Playwright's own
    // actionability hit-testing never runs inside the instrumented window.
    $page->script("document.querySelector('{$trigger}').click(); true;");
    $page->wait(1.0); // show (120ms) + response (200ms server sleep) + hold (300ms): the whole cycle

    $burst = json_decode($page->script('JSON.stringify(window.__gwShowBurst)'), true);

    // Preconditions, asserted not assumed: exactly one skeleton mounted and
    // synthesis really ran (a burst of zero reads would pass every ratio
    // below vacuously).
    expect($burst['layerAppends'])->toBe(1, "{$route}: expected exactly one Ghost Layer mount, saw {$burst['layerAppends']}");
    expect($burst['reads'])->toBeGreaterThan(0);
    expect($page->script('typeof window.__ghostwireLastSynthesisMs'))->toBe('number');

    return $burst;
}
