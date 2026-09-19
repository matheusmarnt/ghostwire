// Issue #21: js/src/index.js's onResize callback (wired into createSynthesizer
// as the SPEC-SYN-21 invalidation hook) re-synthesized and repainted a host's
// bones but never repositioned its Ghost Layer, so the fresh bones — laid out
// relative to the host's NEW rect — were painted inside a layer still sitting
// at the OLD rect until the next onPostPaint happened to re-apply it.
//
// These tests drive the real boot() wiring (real scheduler, synthesizer,
// renderer, registry — nothing mocked) through the same fake-Livewire harness
// js/tests/directive.test.js uses, reach the 'visible' state via the
// scheduler's real 120ms delay under fake timers, then fire the signature
// cache's ResizeObserver exactly as a real browser would, and assert on the
// layer element in the document.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot } from '../src/index.js';

class FakeResizeObserver {
  constructor(callback) { this.callback = callback; FakeResizeObserver.instances.push(this); }
  observe() {}
  disconnect() {}
}
FakeResizeObserver.instances = [];

// jsdom has no Range.getClientRects; measure.js needs one rect per text node
// or emit() produces no text bones and synthesize() degrades to null.
const origGetClientRects = Range.prototype.getClientRects;
const origRangeRect = Range.prototype.getBoundingClientRect;
const origBCR = Element.prototype.getBoundingClientRect;
const origGCS = window.getComputedStyle;
const origAppendChild = Node.prototype.appendChild;

function rectFrom(hostRect, inset) {
  return {
    top: hostRect.top + inset, left: hostRect.left + inset,
    right: hostRect.left + inset + 80, bottom: hostRect.top + inset + 20,
    width: 80, height: 20,
  };
}

describe('onResize repositions the Ghost Layer (issue #21)', () => {
  let registeredCallback;
  let interceptedCallback;
  // Mutable "current geometry" the patched reads return — a test changes
  // these to simulate the layout the browser would report after a resize.
  let hostEl;
  let hostRect;
  let islandRect;
  let events;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    FakeResizeObserver.instances = [];
    global.ResizeObserver = FakeResizeObserver;
    events = [];
    hostEl = null;
    hostRect = { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 };
    islandRect = { top: 5, left: 5, right: 185, bottom: 95, width: 180, height: 90 };

    // Prototype-level patches (never own properties on an element — an own
    // property would shadow the prototype and make the call invisible to
    // the read/write log), same technique as js/tests/perf-read-write-order.test.js.
    Element.prototype.getBoundingClientRect = function () {
      events.push({ type: 'read', source: 'getBoundingClientRect' });
      return this === hostEl ? { ...hostRect } : rectFrom(hostRect, 10);
    };
    Range.prototype.getClientRects = function () {
      events.push({ type: 'read', source: 'getClientRects' });
      return [rectFrom(hostRect, 10)];
    };
    Range.prototype.getBoundingClientRect = function () {
      events.push({ type: 'read', source: 'Range.getBoundingClientRect' });
      return { ...islandRect };
    };
    window.getComputedStyle = function (...args) {
      events.push({ type: 'read', source: 'getComputedStyle' });
      return origGCS.apply(this, args);
    };
    Node.prototype.appendChild = function (...args) {
      events.push({ type: 'write', source: 'appendChild' });
      return origAppendChild.apply(this, args);
    };

    registeredCallback = null;
    interceptedCallback = null;
    window.Livewire = {
      interceptMessage: (cb) => { interceptedCallback = cb; return () => {}; },
      hook: () => {},
      directive: (name, cb) => { if (name === 'ghost') registeredCallback = cb; },
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = origBCR;
    Range.prototype.getClientRects = origGetClientRects;
    Range.prototype.getBoundingClientRect = origRangeRect;
    window.getComputedStyle = origGCS;
    Node.prototype.appendChild = origAppendChild;
    delete window.Livewire;
    vi.useRealTimers();
  });

  function appendMarker(parent, kind) {
    parent.appendChild(document.createComment(`[if ${kind}:type=island|name=t|token=t1|mode=morph]><![endif]`));
  }

  // Boots the runtime, attaches one wire:ghost host with the given modifiers
  // and drives one message far enough for the real onShow to mount the layer.
  function showHost(modifiers, { inIsland = false } = {}) {
    boot();
    hostEl = document.createElement('div');
    hostEl.innerHTML = '<p>Hello world</p>';
    if (inIsland) {
      const wrapper = document.createElement('div');
      appendMarker(wrapper, 'FRAGMENT');
      wrapper.appendChild(hostEl);
      appendMarker(wrapper, 'ENDFRAGMENT');
      document.body.appendChild(wrapper);
    } else {
      document.body.appendChild(hostEl);
    }
    registeredCallback({
      el: hostEl,
      directive: { modifiers, expression: '' },
      component: { id: 'c1', el: hostEl },
      cleanup: () => {},
    });
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: () => {},
    });
    vi.advanceTimersByTime(120); // scheduler's default delay -> real onShow -> synthesize + mountLayer + renderBones
    const layer = document.querySelector('.gw-layer');
    expect(layer).not.toBeNull(); // precondition: the skeleton really showed
    return layer;
  }

  // Fires the SPEC-SYN-21 observer the signature cache registered on host.el,
  // with a border-box width far past the 4px threshold, exactly the way a
  // real ResizeObserver would after a viewport change.
  function resizeHostTo(nextRect) {
    hostRect = nextRect;
    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer).toBeDefined(); // precondition: synthesize() registered the observer
    observer.callback([{ borderBoxSize: [{ inlineSize: nextRect.width }] }]);
  }

  function layerBox(layer) {
    return { top: layer.style.top, left: layer.style.left, width: layer.style.width, height: layer.style.height };
  }

  it('moves the layer to the host\'s new rect in the same task that repaints the bones', () => {
    const layer = showHost([]);
    expect(layerBox(layer)).toEqual({ top: '0px', left: '0px', width: '200px', height: '100px' }); // mounted at the old rect

    resizeHostTo({ top: 40, left: 8, right: 128, bottom: 140, width: 120, height: 100 });

    // Bones were repainted from the new geometry (relative to the NEW host rect)...
    const bone = document.querySelector('.gw-layer .gw-bone');
    expect(bone).not.toBeNull();
    expect(bone.style.left).toBe('10px');
    // ...and the layer that holds them now sits at that same new rect — the
    // assertion that failed before the fix (the layer stayed at 0/0/200/100).
    expect(document.querySelector('.gw-layer')).toBe(layer); // same layer element: repositioned, not re-mounted
    expect(layerBox(layer)).toEqual({ top: '40px', left: '8px', width: '120px', height: '100px' });
  });

  it('uses the island region\'s rect, not the host\'s, on the .island path (SPEC-INT-13)', () => {
    const layer = showHost(['island'], { inIsland: true });
    expect(layerBox(layer)).toEqual({ top: '5px', left: '5px', width: '180px', height: '90px' }); // mounted at the island rect

    islandRect = { top: 30, left: 12, right: 112, bottom: 120, width: 100, height: 90 };
    resizeHostTo({ top: 32, left: 14, right: 110, bottom: 118, width: 96, height: 86 });

    expect(layerBox(layer)).toEqual({ top: '30px', left: '12px', width: '100px', height: '90px' });
  });

  it('keeps SPEC-PERF-01/02 on the resize path: no layout read after the first DOM write', () => {
    const layer = showHost([]);
    const styleProto = Object.getPrototypeOf(layer.style);
    const styleProps = ['top', 'left', 'width', 'height'];
    const origDescs = {};
    for (const prop of styleProps) {
      const desc = Object.getOwnPropertyDescriptor(styleProto, prop);
      origDescs[prop] = desc;
      Object.defineProperty(styleProto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(value) { events.push({ type: 'write', source: `style.${prop}` }); desc.set.call(this, value); },
      });
    }

    try {
      events.length = 0; // only the resize cycle is under test
      resizeHostTo({ top: 40, left: 8, right: 128, bottom: 140, width: 120, height: 100 });
    } finally {
      for (const prop of styleProps) Object.defineProperty(styleProto, prop, origDescs[prop]);
    }

    const firstWrite = events.findIndex((e) => e.type === 'write');
    const readsAfterFirstWrite = events.slice(firstWrite + 1).filter((e) => e.type === 'read');
    expect(firstWrite).toBeGreaterThan(-1); // sanity: the reposition and repaint really wrote
    expect(events.slice(0, firstWrite).some((e) => e.type === 'read')).toBe(true); // sanity: synthesis and the reposition really read
    expect(readsAfterFirstWrite).toEqual([]);
  });

  it('leaves a frozen host alone: no layer exists to reposition and nothing throws', () => {
    boot();
    hostEl = document.createElement('div');
    hostEl.innerHTML = '<p>Hello world</p>';
    document.body.appendChild(hostEl);
    registeredCallback({
      el: hostEl,
      directive: { modifiers: ['freeze'], expression: '' },
      component: { id: 'c1', el: hostEl },
      cleanup: () => {},
    });
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {}, onError: () => {}, onFailure: () => {}, onCancel: () => {}, onFinish: () => {},
    });
    vi.advanceTimersByTime(120);

    expect(document.querySelector('.gw-layer')).toBeNull();
    expect(FakeResizeObserver.instances).toHaveLength(0); // freeze never synthesizes, so nothing observes host.el
  });
});
