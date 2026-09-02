<?php

// tests/Browser/Geometry/GalleryGeometryTest.php
//
// M2 Definition-of-Done gate (SDD §16: "Layouts 1 a 3 da galeria dentro da
// tolerância"). Drives a real browser against the three gallery fixtures
// Task 8 built and the real built runtime (resources/dist/ghostwire.js) to
// prove SPEC-SYN's geometry contract: every synthesized bone must overlap
// the real content element it stands in for, within a 2px tolerance.
//
// Rather than asserting a weak "bones stay inside the host's bounds" check
// (which would pass even for badly-placed bones, as long as nothing
// overflowed), this test independently re-derives the *expected* source
// rects by mirroring js/src/synthesizer/walk.js's classify()/
// collectAndClassify() and measure.js's measureTextLines() in plain
// injected JS — deliberately not reusing the runtime's own modules, so the
// test can't pass merely because it imported the same (possibly buggy)
// code it's meant to verify. Every rendered .gw-bone is then required to
// match (all four edges within TOLERANCE) at least one real source rect.
//
// $page->script()/$page->click()/$page->wait() (seconds, not ms) follow the
// exact API surface tests/Browser/Morph/GhostLayerMorphTest.php and
// tests/Browser/Timing/*.php already established for this codebase's Pest
// v4 + pest-plugin-browser setup.
//
// Geometry is captured inside a MutationObserver callback the instant the
// first .gw-bone appears — not at a fixed-offset wait — for the same reason
// the Morph/Timing suites moved off fixed offsets: the scheduler mounts
// bones once, synchronously, at show-time (js/src/scheduler.js's onShow),
// and nothing in these fixtures' DOM changes again until the response
// lands and Livewire morphs the host — so sampling right at first-sighting
// captures the exact same layout the runtime itself measured, before any
// later morph could shift text and invalidate the comparison.

dataset('gallery_layouts', [
    'paginated table' => ['/gallery/paginated-table', '#next-page-btn', '#paginated-table'],
    'grouped table' => ['/gallery/grouped-table', '#load-btn', '#grouped-table'],
    'card grid' => ['/gallery/card-grid', '#refresh-btn', '#card-grid'],
]);

function gwGeometryProbeScript(string $hostSelector): string
{
    return <<<JS
        window.__gw = { matched: null, boneCount: 0, candidateCount: 0, mismatch: null };

        function gwClassify(el) {
            if (el.tagName === 'SVG') return 'icon';
            if (['IMG', 'VIDEO', 'PICTURE', 'CANVAS'].includes(el.tagName)) return 'media';
            if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button') return 'control';
            if (/^H[1-6]\$/.test(el.tagName)) return 'heading';
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') return 'text';
            }
            if (el.children.length > 0) return 'container';
            return null;
        }

        function gwLineRects(el) {
            const rects = [];
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    rects.push(...range.getClientRects());
                }
            }
            return rects;
        }

        function gwSourceRects(hostEl) {
            const out = [];
            (function visit(node, depth) {
                for (const child of node.children) {
                    if (child.getAttribute('aria-hidden') === 'true') continue;
                    const type = gwClassify(child);
                    if (type === 'container') { if (depth < 12) visit(child, depth + 1); continue; }
                    if (type === null) continue;
                    if (type === 'text') {
                        for (const r of gwLineRects(child)) {
                            if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
                        }
                    } else {
                        const r = child.getBoundingClientRect();
                        out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
                    }
                }
            })(hostEl, 0);
            return out;
        }

        function gwRectsMatch(bone, candidates, tol) {
            return candidates.some((c) =>
                Math.abs(bone.left - c.left) <= tol &&
                Math.abs(bone.top - c.top) <= tol &&
                Math.abs((bone.left + bone.width) - (c.left + c.width)) <= tol &&
                Math.abs((bone.top + bone.height) - (c.top + c.height)) <= tol
            );
        }

        new MutationObserver(() => {
            if (window.__gw.matched !== null) return; // evaluate once, at first sighting

            const layer = document.body.querySelector('.gw-layer');
            if (!layer) return;
            const bones = Array.from(layer.querySelectorAll('.gw-bone'));
            if (bones.length === 0) return;

            const host = document.querySelector('{$hostSelector}');
            const candidates = gwSourceRects(host);
            const TOLERANCE = 2;

            let allMatched = true;
            let firstMismatch = null;
            for (const bone of bones) {
                const b = bone.getBoundingClientRect();
                const rect = { left: b.left, top: b.top, width: b.width, height: b.height };
                if (!gwRectsMatch(rect, candidates, TOLERANCE)) {
                    allMatched = false;
                    firstMismatch = rect;
                    break;
                }
            }

            window.__gw.boneCount = bones.length;
            window.__gw.candidateCount = candidates.length;
            window.__gw.matched = allMatched;
            window.__gw.mismatch = firstMismatch;
        }).observe(document.body, { childList: true, subtree: true });

        true;
    JS;
}

test('SPEC-SYN geometry: bones overlap their source elements within 2px', function (string $route, string $triggerSelector, string $hostSelector) {
    $page = visit($route);

    $page->script(gwGeometryProbeScript($hostSelector));

    $page->click($triggerSelector);
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $data = json_decode($page->script('JSON.stringify(window.__gw)'), true);

    // Sanity: prove bones actually rendered, so the match check below isn't
    // vacuously true because nothing was ever synthesized.
    expect($data['boneCount'])->toBeGreaterThan(0);
    expect($data['candidateCount'])->toBeGreaterThan(0);

    expect($data['matched'])->toBeTrue();
})->with('gallery_layouts');

test('SPEC-PERF-10: bones introduce zero CLS for gallery layouts 1-3', function (string $route, string $triggerSelector) {
    $page = visit($route);

    $page->script('
        window.__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) window.__cls += entry.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
        true;
    ');

    $page->click($triggerSelector);
    $page->wait(1.0); // generous: clears delay(120) + server sleep(200) + hold(300) + morph/settle margin

    $cls = $page->script('window.__cls');

    expect($cls)->toBe(0);
})->with('gallery_layouts');
