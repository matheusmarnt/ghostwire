import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAttributeConfig } from '../src/attributeConfig.js';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createRegistry } from '../src/registry.js';
import { boot } from '../src/index.js';
import { SCHEMA_VERSION, STORAGE_KEY } from '../src/learning/store.js';
import { setDebugForTests } from '../src/debug.js';

function elWith(payload) {
  const el = document.createElement('div');
  el.setAttribute('data-ghost', JSON.stringify(payload));

  return el;
}

describe('learning transport in the data-ghost schema', () => {
  let warn;

  afterEach(() => {
    // Runs even when an expectation above aborted the test body. Without this a
    // failing assertion leaves the debug flag on and the console.warn spy active
    // for whatever test runs next in this file - the same ambient-flag hazard
    // Task 4 found once already (NODE_ENV), just self-inflicted here via a reset
    // line placed at the end of the test body instead of in afterEach.
    warn?.mockRestore();
    warn = undefined;
    setDebugForTests(false);
  });

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
    setDebugForTests(true);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: 'yes' }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"g"'));
  });

  it('discards the whole payload when the component name breaks the charset', () => {
    setDebugForTests(true);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: '<img src=x>' }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"n"'));
  });

  it('discards the whole payload when the component name is over-long', () => {
    setDebugForTests(true);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: 'a'.repeat(65) }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"n"'));
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

// SPEC-LRN-01 fix (docs/plans/2026-09-21-fix-ghost-lazy-learning-delay-gate.md):
// learning capture must run from inside onStart's per-host loop, on every
// eligible commit, not only once scheduler.js's onShow fires (which needs
// host.cfg.delay, 120ms default, to elapse with the commit still pending).
// These tests drive a real, full boot() cycle through a fake
// window.Livewire.interceptMessage — the same integration surface
// js/tests/directive.test.js's island tests use — so what's under test is
// the real onStart wiring, not a reimplementation of it.
describe('learning capture decoupled from the visible-skeleton delay (SPEC-LRN-01 fix)', () => {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  let hookCallbacks;
  let interceptedCallback;
  let registeredDirectiveCallback;

  function componentInitCallback() {
    return hookCallbacks.get('component.init')?.at(-1);
  }

  function fakeStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
    };
  }

  // Real, measurable DOM content so synthesizer.synthesize() computes a
  // genuine Bone Tree — same fixture pattern learning-lazy.test.js and the
  // onSynthesized-wiring describe block above already use. data-ghost
  // carries the learning flag + component name the way GhostComponentHook
  // (PHP) really serializes them (js/src/attributeConfig.js field names
  // confirmed by this file's own 'parses the learning flag and component
  // name' test above: config.learning / config.name).
  function makeLazyLearningComponent(payloadOverrides = {}) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
    el.innerHTML = '<p>Hello world</p>';
    el.setAttribute('data-ghost', JSON.stringify({ m: 'synthesize', g: true, n: 'orders-table', ...payloadOverrides }));
    document.body.appendChild(el);
    for (const child of el.querySelectorAll('*')) {
      child.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    }
    return { id: 'c1', el };
  }

  // Same fixture pattern as makeLazyLearningComponent(), but attaches via
  // the 'ghost' directive (not attribute-only auto-attach) so .ignore/.keep
  // can be set — those two have no data-ghost/attribute-config equivalent
  // (attributeConfig.js's compact-key schema has no "keep"/"ignore" key;
  // see js/src/index.js's own comment on attachAttributeHost: ".keep is
  // reserved to the directive only").
  function makeDirectiveHost(modifiers) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
    el.innerHTML = '<p>Hello world</p>';
    el.setAttribute('data-ghost', JSON.stringify({ m: 'synthesize', g: true, n: 'orders-table' }));
    document.body.appendChild(el);
    for (const child of el.querySelectorAll('*')) {
      child.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    }
    const component = { id: 'c1', el };
    registeredDirectiveCallback({
      el,
      directive: { modifiers, expression: '' },
      component,
      cleanup: () => {},
    });
    return component;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    global.ResizeObserver = FakeResizeObserver;
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
    }
    hookCallbacks = new Map();
    interceptedCallback = null;
    registeredDirectiveCallback = null;
    window.Livewire = {
      interceptMessage: (cb) => { interceptedCallback = cb; return () => {}; },
      hook: (name, cb) => {
        if (!hookCallbacks.has(name)) hookCallbacks.set(name, []);
        hookCallbacks.get(name).push(cb);
      },
      directive: (name, cb) => { if (name === 'ghost') registeredDirectiveCallback = cb; },
    };
  });

  afterEach(() => {
    delete window.Livewire;
    delete window.Ghostwire;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('persists a learned tree immediately, even when the commit finishes before the 120ms show delay (never reaching onShow)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeLazyLearningComponent();
    componentInitCallback()({ component, cleanup: () => {} });

    // Simulates a commit whose round trip resolves well under the 120ms
    // show delay: onFinish's registered callback fires synchronously here,
    // before any fake timer advances — exactly like a real fast
    // wire:click/wire:model.live commit (plan doc: measured 60.6ms in
    // production). The delay timer scheduler.js armed is still pending and
    // unfired when this assertion runs — onShow never ran.
    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(JSON.parse(window.Ghostwire.exportLearned()).e).not.toEqual({});
    expect(storage.getItem('ghostwire.learned.v1')).toContain('orders-table');
  });

  it('does not capture learning for a host the same eligibility gates silence (sync-only message, no override)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeLazyLearningComponent(); // host.config.sync stays undefined — no override
    componentInitCallback()({ component, cleanup: () => {} });

    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [] }, // no actions at all -> isSync (v4 bridge)
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual({ v: SCHEMA_VERSION, e: {}, c: {} });
  });

  it('does not double-persist when synthesize() runs again later inside onShow for an unchanged host (delay crossed)', () => {
    const storage = fakeStorage();
    const setItemSpy = vi.spyOn(storage, 'setItem');
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeLazyLearningComponent();
    componentInitCallback()({ component, cleanup: () => {} });

    let finishCb;
    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => { finishCb = cb; }, // NOT called yet — commit still pending when the delay elapses
    });

    vi.advanceTimersByTime(120); // crosses the show delay -> onShow fires -> synthesize() runs again on the same unchanged DOM/signature
    finishCb();

    expect(setItemSpy).toHaveBeenCalledTimes(1); // one real write; the second synthesize() call hit the signature cache, onSynthesized did not fire twice
  });

  it('does not capture learning for a mode:freeze host (onShow never synthesizes for freeze either)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeLazyLearningComponent({ m: 'freeze' });
    componentInitCallback()({ component, cleanup: () => {} });

    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual({ v: SCHEMA_VERSION, e: {}, c: {} });
  });

  it('does not capture learning for a wire:ghost.ignore host (onShow never synthesizes for .ignore either)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeDirectiveHost(['ignore']);

    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual({ v: SCHEMA_VERSION, e: {}, c: {} });
  });

  it('does not capture learning for a wire:ghost.keep host (onShow never synthesizes for .keep either)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();

    boot();
    const component = makeDirectiveHost(['keep']);

    interceptedCallback({
      message: { isSkipped: () => false, component, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(JSON.parse(window.Ghostwire.exportLearned())).toEqual({ v: SCHEMA_VERSION, e: {}, c: {} });
  });
});
