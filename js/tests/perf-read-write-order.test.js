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
