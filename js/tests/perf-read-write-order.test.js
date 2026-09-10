import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createRegistry } from '../src/registry.js';
import { createRenderer } from '../src/renderer.js';

// ponytail: polyfill Range.getClientRects for JSDOM (only reads layout, no write violation)
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    return [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
  };
}

class FakeResizeObserver {
  constructor(callback) { this.callback = callback; FakeResizeObserver.instances.push(this); }
  observe() {}
  disconnect() {}
}
FakeResizeObserver.instances = [];

describe('SPEC-PERF-01/02: read-before-write ordering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    FakeResizeObserver.instances = [];
    global.ResizeObserver = FakeResizeObserver;
  });

  it('never calls getBoundingClientRect or getComputedStyle after the first DOM write during a full synthesize+render cycle', () => {
    // Set up host with content. jsdom's real getBoundingClientRect always
    // returns an all-zero rect, which would make SPEC-SYN-12's zero-size
    // filter reject every candidate — so Element.prototype.getBoundingClientRect
    // is patched below to unconditionally return a fixed, non-zero rect for
    // every element. Per-element shadowing (e.g. host.el.getBoundingClientRect = ...)
    // is deliberately NOT used here: an own property on an element shadows
    // the prototype method for that element, which would make calls to it
    // invisible to this test's read/write event tracking.
    const host = { el: document.createElement('div'), component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    host.el.innerHTML = '<p>Hello world</p>';
    document.body.appendChild(host.el);

    const events = [];
    const origGetBCR = Element.prototype.getBoundingClientRect;
    const origGetComputedStyle = window.getComputedStyle;
    const origAppendChild = Node.prototype.appendChild;

    // Fully replaces jsdom's (useless, always-zero) implementation — does not
    // delegate to origGetBCR — so every call is both recorded AND returns
    // usable, deterministic, non-crashing geometry through this one patched
    // method, with no per-element bypass possible.
    Element.prototype.getBoundingClientRect = function (...args) {
      events.push({ type: 'read', source: 'getBoundingClientRect', stack: new Error().stack });
      return { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 };
    };
    window.getComputedStyle = function (...args) {
      events.push({ type: 'read', source: 'getComputedStyle', stack: new Error().stack });
      return origGetComputedStyle.apply(this, args);
    };
    Node.prototype.appendChild = function (...args) {
      events.push({ type: 'write', source: 'appendChild', stack: new Error().stack });
      return origAppendChild.apply(this, args);
    };

    try {
      const registry = createRegistry();
      const synthesizer = createSynthesizer(registry);
      const renderer = createRenderer();

      const boneTree = synthesizer.synthesize(host);
      renderer.mountLayer(host);
      if (boneTree) {
        renderer.renderBones(host, boneTree);
      }
    } finally {
      Element.prototype.getBoundingClientRect = origGetBCR;
      window.getComputedStyle = origGetComputedStyle;
      Node.prototype.appendChild = origAppendChild;
    }

    const firstWriteIndex = events.findIndex((e) => e.type === 'write');
    const readsAfterFirstWrite = events.slice(firstWriteIndex + 1).filter((e) => e.type === 'read');

    expect(firstWriteIndex).toBeGreaterThan(-1); // sanity: a write actually happened
    expect(readsAfterFirstWrite).toHaveLength(0); // SPEC-PERF-01/02: no read after the first write
  });
});

// Regression test for the GH-#6 multi-host reflow: js/src/index.js's
// onPostPaint used to call renderer.repositionLayer(host) per host inside a
// single loop, so host N+1's getBoundingClientRect() read landed immediately
// after host N's style write — a forced synchronous reflow per host after
// the first. The fix batches the whole component's hosts: measure every
// host first (map), then write every host (forEach). onPostPaint itself
// lives inside boot(), which needs a real window.Livewire bridge and isn't
// unit-tested directly anywhere in this suite (no index.test.js exists), so
// this proves the same batching PATTERN — map-then-forEach over
// measureHostRect/applyLayerRect — that onPostPaint now uses. The true
// end-to-end proof is tests/Browser/{SmokeTest,Timing,Morph} against
// tests/Browser/Fixtures/views/demo-table.blade.php, which has 2 hosts
// (#summary/#list) reacting to the same click.
describe('SPEC-PERF-01/02: onPostPaint-style batching across multiple hosts on one component', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('measures every host before applying any host\'s layer rect, across 2+ hosts', () => {
    const renderer = createRenderer();

    function makeHost() {
      const el = document.createElement('div');
      document.body.appendChild(el);
      return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    }

    const hostA = makeHost();
    const hostB = makeHost();
    // Real layers, mounted before any event recording starts below — this
    // test is only about the reposition batch, not mountLayer's own
    // read-before-write order (already covered above).
    renderer.mountLayer(hostA);
    renderer.mountLayer(hostB);

    const events = [];
    const origGetBCR = Element.prototype.getBoundingClientRect;
    // .style's accessor properties (top/left/width/height) live on a shared
    // internal prototype (not the globally-named CSSStyleDeclaration, which
    // jsdom does not put them on) — read it off a real style instance, like
    // the getBoundingClientRect patch above, so every host's layer (they all
    // share this one prototype) is covered without per-element shadowing.
    const styleProto = Object.getPrototypeOf(hostA.layer.style);
    const styleProps = ['top', 'left', 'width', 'height'];
    const origStyleDescs = {};

    Element.prototype.getBoundingClientRect = function (...args) {
      events.push({ type: 'read', source: 'getBoundingClientRect' });
      return { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 };
    };
    for (const prop of styleProps) {
      const desc = Object.getOwnPropertyDescriptor(styleProto, prop);
      origStyleDescs[prop] = desc;
      Object.defineProperty(styleProto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(value) {
          events.push({ type: 'write', source: `style.${prop}` });
          desc.set.call(this, value);
        },
      });
    }

    try {
      // The exact batching pattern js/src/index.js's onPostPaint now uses.
      const hosts = [hostA, hostB];
      const rects = hosts.map((host) => renderer.measureHostRect(host));
      hosts.forEach((host, i) => renderer.applyLayerRect(host, rects[i]));
    } finally {
      Element.prototype.getBoundingClientRect = origGetBCR;
      for (const prop of styleProps) {
        Object.defineProperty(styleProto, prop, origStyleDescs[prop]);
      }
    }

    const readIndices = events.map((e, i) => (e.type === 'read' ? i : -1)).filter((i) => i !== -1);
    const writeIndices = events.map((e, i) => (e.type === 'write' ? i : -1)).filter((i) => i !== -1);

    expect(readIndices).toHaveLength(2); // one getBoundingClientRect per host
    expect(writeIndices).toHaveLength(8); // 4 style props x 2 hosts
    // SPEC-PERF-01/02: every read strictly before every write — proves the
    // batching, not merely that both functions exist/work in isolation.
    expect(Math.max(...readIndices)).toBeLessThan(Math.min(...writeIndices));

    expect(hostA.layer.style.top).toBe('0px');
    expect(hostB.layer.style.width).toBe('100px');
  });
});
