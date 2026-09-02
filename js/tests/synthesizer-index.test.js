import { describe, it, expect, beforeEach } from 'vitest';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createRegistry } from '../src/registry.js';

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

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
});
