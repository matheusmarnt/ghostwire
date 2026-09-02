import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createRegistry } from '../src/registry.js';

class FakeResizeObserver {
  constructor(callback) { this.callback = callback; FakeResizeObserver.instances.push(this); }
  observe() {}
  disconnect() {}
}
FakeResizeObserver.instances = [];

// Polyfill Range.getClientRects for jsdom compatibility
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    // Return a mock DOMRectList with one rect representing the text bounds
    return [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
  };
}

function makeHost(html, config = {}) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
  el.innerHTML = html;
  document.body.appendChild(el);
  for (const child of el.querySelectorAll('*')) {
    child.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
  }
  return { el, component: { id: 'c1' }, config, state: 'idle', pending: 0, layer: null };
}

describe('synthesizer/index', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    FakeResizeObserver.instances = [];
    global.ResizeObserver = FakeResizeObserver;
  });

  it('synthesizes a Bone Tree for a host with content', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('<p>Hello world</p>');

    const bones = synthesizer.synthesize(host);

    expect(bones).not.toBeNull();
    expect(bones.length).toBeGreaterThan(0);
  });

  it('returns null for an empty host with no rows hint (degrade to freeze)', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('');

    expect(synthesizer.synthesize(host)).toBeNull();
  });

  it('honors host.config.rows as the SPEC-SYN-17 hint for an empty host', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('', { rows: 3 });

    const bones = synthesizer.synthesize(host);

    expect(bones).toHaveLength(3);
  });

  it('returns a cached Bone Tree on a second call with unchanged content (SPEC-SYN-20)', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('<p>Hello world</p>');

    const first = synthesizer.synthesize(host);
    const second = synthesizer.synthesize(host);

    expect(second).toBe(first);
  });

  it('forget() clears the cache so the next synthesize() recomputes', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('<p>Hello world</p>');
    const first = synthesizer.synthesize(host);

    synthesizer.forget(host);
    const second = synthesizer.synthesize(host);

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('SPEC-SYN-21: invokes the onResize callback when the signature cache invalidates past the resize threshold', () => {
    const registry = createRegistry();
    const onResize = vi.fn();
    const synthesizer = createSynthesizer(registry, undefined, onResize);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host);
    expect(onResize).not.toHaveBeenCalled();

    const observer = FakeResizeObserver.instances.at(-1);
    observer.callback([{ borderBoxSize: [{ inlineSize: 500 }] }]); // host width 200 -> 500, past 4px threshold

    expect(onResize).toHaveBeenCalledWith(host);
  });

  it('SPEC-PERF-07: skips synthesis and returns null once a previous synthesize() call exceeded the long-task threshold', () => {
    const registry = createRegistry();
    let call = 0;
    const now = () => { call += 1; return call === 2 ? 1000 : 0; }; // first synthesize(): starts at 0, ends at 1000 -> 1000ms duration
    const synthesizer = createSynthesizer(registry, undefined, undefined, now);
    const host = makeHost('<p>Hello world</p>');

    const first = synthesizer.synthesize(host);
    expect(first).not.toBeNull(); // the slow call itself still completes and returns bones

    const second = synthesizer.synthesize(host);
    expect(second).toBeNull(); // SPEC-PERF-07: the next call degrades to freeze instead of repeating the expensive work
  });

  it('forget() clears the recorded synthesis duration so a fresh host is not pre-emptively frozen', () => {
    const registry = createRegistry();
    let call = 0;
    const now = () => { call += 1; return call === 2 ? 1000 : 0; };
    const synthesizer = createSynthesizer(registry, undefined, undefined, now);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host);
    synthesizer.forget(host);
    const after = synthesizer.synthesize(host);

    expect(after).not.toBeNull();
  });

  it('exposes the last synthesis duration on window.__ghostwireLastSynthesisMs for the browser perf suite', () => {
    const registry = createRegistry();
    const synthesizer = createSynthesizer(registry);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host);

    expect(typeof window.__ghostwireLastSynthesisMs).toBe('number');
  });
});
