import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAttributeConfig } from '../src/attributeConfig.js';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createRegistry } from '../src/registry.js';
import { boot } from '../src/index.js';
import { SCHEMA_VERSION, STORAGE_KEY } from '../src/learning/store.js';

function elWith(payload) {
  const el = document.createElement('div');
  el.setAttribute('data-ghost', JSON.stringify(payload));

  return el;
}

describe('learning transport in the data-ghost schema', () => {
  it('parses the learning flag and component name', () => {
    const config = parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: 'orders-table' }));

    expect(config.learning).toBe(true);
    expect(config.name).toBe('orders-table');
  });

  it('defaults learning off and name null when the server sent neither', () => {
    const config = parseAttributeConfig(elWith({ m: 'synthesize' }));

    expect(config.learning).toBe(false);
    expect(config.name).toBeNull();
  });

  it('discards the whole payload when the learning flag is not a boolean (SPEC-SEC-02 fail-closed)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: 'yes' }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"g"'));

    warn.mockRestore();
  });

  it('discards the whole payload when the component name breaks the charset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: '<img src=x>' }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"n"'));

    warn.mockRestore();
  });

  it('discards the whole payload when the component name is over-long', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: 'a'.repeat(65) }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"n"'));

    warn.mockRestore();
  });
});

// SPEC-LRN-01: the runtime's collect/persist decision. onSynthesized is the
// only wire between a fresh Bone Tree and the learning store — these tests
// exercise the real createSynthesizer()/synthesize() pipeline (not a mock of
// it), because the thing worth protecting is exactly where that callback is
// placed: inside the `if (boneTree)` branch, only on the fresh-computation
// path, never on the cached early-return and never on the null-degrade path.
describe('onSynthesized wiring (SPEC-LRN-01)', () => {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    global.ResizeObserver = FakeResizeObserver;
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
    }
  });

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

  it('calls onSynthesized with (host, signature, boneTree, hostRect) when a fresh tree is computed', () => {
    const registry = createRegistry();
    const onSynthesized = vi.fn();
    const synthesizer = createSynthesizer(registry, undefined, undefined, undefined, onSynthesized);
    const host = makeHost('<p>Hello world</p>');

    const boneTree = synthesizer.synthesize(host);

    expect(boneTree).not.toBeNull();
    expect(onSynthesized).toHaveBeenCalledTimes(1);
    expect(onSynthesized).toHaveBeenCalledWith(
      host,
      expect.any(Number),
      boneTree,
      { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 },
    );
  });

  it('does not call onSynthesized again on the cached path (unchanged content)', () => {
    const registry = createRegistry();
    const onSynthesized = vi.fn();
    const synthesizer = createSynthesizer(registry, undefined, undefined, undefined, onSynthesized);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host);
    synthesizer.synthesize(host);

    expect(onSynthesized).toHaveBeenCalledTimes(1);
  });

  it('does not call onSynthesized when synthesis degrades to null (empty host, no rows hint)', () => {
    const registry = createRegistry();
    const onSynthesized = vi.fn();
    const synthesizer = createSynthesizer(registry, undefined, undefined, undefined, onSynthesized);
    const host = makeHost('');

    const boneTree = synthesizer.synthesize(host);

    expect(boneTree).toBeNull();
    expect(onSynthesized).not.toHaveBeenCalled();
  });
});

// SPEC-SEC-09 / FR-43: exportLearned()/clearLearned() are the only way
// learned data leaves the browser. These exercise the real boot() wiring
// (not a reimplementation of the store) with a fake localStorage, so what's
// under test is that window.Ghostwire's two methods are really bound to the
// same learningStore instance boot() constructed.
describe('window.Ghostwire.exportLearned / clearLearned wiring', () => {
  function fakeStorage(seedEnvelope) {
    const map = new Map();
    if (seedEnvelope) map.set(STORAGE_KEY, JSON.stringify(seedEnvelope));

    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
    };
  }

  function seed() {
    return {
      v: SCHEMA_VERSION,
      e: { '42|md': { t: 1000, n: 'orders-table', w: 300, h: 150, b: [{ type: 'text', x: 0, y: 0, width: 100, height: 20 }] } },
      c: { 'orders-table|md': '42' },
    };
  }

  let anchorClick;

  beforeEach(() => {
    window.Livewire = { interceptMessage: () => () => {}, hook: () => {}, directive: () => {} };
    // jsdom has no real download mechanism — a genuine anchor.click() here logs
    // "Not implemented: navigation to another Document" noise. These tests
    // verify the JSON wiring, not the click/download mechanics (that's a
    // browser-test concern), so the click itself is stubbed to a no-op.
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.Livewire;
    delete window.Ghostwire;
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it('exportLearned() returns the persisted store as JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage(seed()));

    boot();

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual(seed());
  });

  it('clearLearned() empties the store', () => {
    vi.stubGlobal('localStorage', fakeStorage(seed()));

    boot();
    window.Ghostwire.clearLearned();

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual({ v: SCHEMA_VERSION, e: {}, c: {} });
  });
});
