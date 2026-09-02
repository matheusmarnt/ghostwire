import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSignatureCache } from '../src/synthesizer/signature.js';

class FakeResizeObserver {
  constructor(callback) { this.callback = callback; this.observed = null; this.observedOptions = null; }
  observe(el, options) { this.observed = el; this.observedOptions = options; }
  disconnect() { this.observed = null; }
  // Real browsers deliver borderBoxSize when { box: 'border-box' } is passed to
  // observe() (SPEC-SYN-20 fix) — exercise that path, not just contentRect,
  // since borderBoxSize is what production code now reads first.
  trigger(width) {
    this.callback([{ contentRect: { width }, borderBoxSize: [{ inlineSize: width }] }]);
  }
  triggerContentBoxOnly(width) {
    this.callback([{ contentRect: { width } }]);
  }
}

function makeHost() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width: 200, height: 100 });
  document.body.appendChild(el);
  return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
}

describe('synthesizer/signature', () => {
  let lastObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    lastObserver = null;
    global.ResizeObserver = class extends FakeResizeObserver {
      constructor(cb) { super(cb); lastObserver = this; }
    };
  });

  it('computeSignature hashes tagName/type/className/depth, not textContent', () => {
    const cache = createSignatureCache();
    const p1 = document.createElement('p'); p1.textContent = 'hello';
    const p2 = document.createElement('p'); p2.textContent = 'a completely different sentence';

    const sigA = cache.computeSignature([{ el: p1, type: 'text', depth: 1 }]);
    const sigB = cache.computeSignature([{ el: p2, type: 'text', depth: 1 }]);

    expect(sigA).toBe(sigB);
  });

  it('computeSignature differs when className or depth differs', () => {
    const cache = createSignatureCache();
    const p1 = document.createElement('p');
    const p2 = document.createElement('p'); p2.className = 'summary';

    const sigA = cache.computeSignature([{ el: p1, type: 'text', depth: 1 }]);
    const sigB = cache.computeSignature([{ el: p2, type: 'text', depth: 1 }]);
    const sigC = cache.computeSignature([{ el: p1, type: 'text', depth: 2 }]);

    expect(sigA).not.toBe(sigB);
    expect(sigA).not.toBe(sigC);
  });

  it('set then get returns the cached Bone Tree for a matching signature', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    const boneTree = [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }];

    cache.set(host, 42, boneTree);

    expect(cache.get(host, 42)).toBe(boneTree);
  });

  it('get returns null when the signature does not match (content changed shape)', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    expect(cache.get(host, 43)).toBeNull();
  });

  it('SPEC-SYN-21: a width change past the 4px threshold invalidates the cache', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    const onInvalidate = vi.fn();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }], onInvalidate);

    lastObserver.trigger(205); // 200 -> 205, 5px >= 4px threshold

    expect(cache.get(host, 42)).toBeNull();
    expect(onInvalidate).toHaveBeenCalledWith(host);
  });

  it('SPEC-SYN-21: a width change under the 4px threshold keeps the cache', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    lastObserver.trigger(202); // 200 -> 202, 2px < 4px threshold

    expect(cache.get(host, 42)).not.toBeNull();
  });

  it('observes with { box: "border-box" } so the callback receives borderBoxSize (SPEC-SYN-20 fix)', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    expect(lastObserver.observedOptions).toEqual({ box: 'border-box' });
  });

  it('does not invalidate on set when borderBoxSize matches the stored border-box width exactly', () => {
    const cache = createSignatureCache();
    const host = makeHost(); // getBoundingClientRect() width: 200 (border-box)
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    lastObserver.trigger(200); // borderBoxSize.inlineSize matches stored border-box width -> no drift

    expect(cache.get(host, 42)).not.toBeNull();
  });

  it('falls back to contentRect.width when borderBoxSize is unavailable', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    const onInvalidate = vi.fn();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }], onInvalidate);

    lastObserver.triggerContentBoxOnly(205); // 200 -> 205, 5px >= 4px threshold

    expect(cache.get(host, 42)).toBeNull();
    expect(onInvalidate).toHaveBeenCalledWith(host);
  });

  it('invalidate disconnects the observer and drops the cache entry', () => {
    const cache = createSignatureCache();
    const host = makeHost();
    cache.set(host, 42, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    cache.invalidate(host);

    expect(cache.get(host, 42)).toBeNull();
    expect(lastObserver.observed).toBeNull();
  });
});
