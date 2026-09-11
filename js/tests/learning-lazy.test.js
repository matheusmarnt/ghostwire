import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRenderer } from '../src/renderer.js';
import { createRegistry } from '../src/registry.js';
import { createSynthesizer } from '../src/synthesizer/index.js';
import { createLearningStore, NAME_PATTERN } from '../src/learning/store.js';
import { bandFor } from '../src/learning/bands.js';
import { boot } from '../src/index.js';

const TREE = [
  { type: 'text', x: 12, y: 8, width: 240, height: 14 },
  { type: 'avatar', x: 12, y: 48, width: 40, height: 40 },
];

describe('paintBones', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('builds one bone element per bone, positioned from numeric geometry', () => {
    const renderer = createRenderer();
    const container = document.createElement('div');

    renderer.paintBones(container, TREE);

    const bones = container.querySelectorAll('.gw-bone');
    expect(bones).toHaveLength(2);
    expect(bones[0].className).toBe('gw-bone gw-bone--text');
    expect(bones[0].style.left).toBe('12px');
    expect(bones[0].style.top).toBe('8px');
    expect(bones[0].style.width).toBe('240px');
    expect(bones[0].style.height).toBe('14px');
    expect(bones[1].className).toBe('gw-bone gw-bone--avatar');
  });

  it('replaces any previous content rather than appending to it', () => {
    const renderer = createRenderer();
    const container = document.createElement('div');
    container.textContent = 'stale';

    renderer.paintBones(container, TREE);
    renderer.paintBones(container, TREE);

    expect(container.querySelectorAll('.gw-bone')).toHaveLength(2);
    expect(container.textContent).toBe('');
  });

  it('never produces markup from persisted data (SPEC-SEC-04)', () => {
    const renderer = createRenderer();
    const container = document.createElement('div');

    renderer.paintBones(container, [{ type: 'text', x: 0, y: 0, width: 1, height: 1 }]);

    expect(container.querySelector('script')).toBeNull();
    expect(container.firstChild.nodeName).toBe('DIV');
  });

  it('no-ops on a missing container instead of throwing', () => {
    const renderer = createRenderer();

    expect(() => renderer.paintBones(null, TREE)).not.toThrow();
  });
});

// SPEC-LRN-02: js/src/index.js's paintLazyPlaceholders() is not exported —
// it is only reachable through boot() itself, at the end of boot() and again
// from the real Livewire.hook('morphed', ...) handler. These tests exercise
// it exactly that way (a real boot() call, a real fake-Livewire hook
// dispatch), never a reimplementation of its logic.
describe('paintLazyPlaceholders (SPEC-LRN-02)', () => {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  function fakeStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
    };
  }

  // Unlike the no-op Livewire stub other learning tests use, this one really
  // records and re-fires hooks — needed to trigger the SECOND
  // paintLazyPlaceholders() call site (inside the 'morphed' hook) for real.
  function fakeLivewire() {
    const hooks = {};
    return {
      interceptMessage: () => () => {},
      directive: () => {},
      hook: (name, cb) => { (hooks[name] ??= []).push(cb); },
      trigger: (name, payload) => { (hooks[name] || []).forEach((cb) => cb(payload)); },
    };
  }

  // Real, measurable DOM content so synthesizer.synthesize() computes a
  // genuine Bone Tree — mirrors the same fixture pattern already used in
  // learning-wiring.test.js, synthesizer-index.test.js and
  // perf-read-write-order.test.js.
  function synthesizableHost(config) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
    el.innerHTML = '<p>Hello world</p>';
    document.body.appendChild(el);
    for (const child of el.querySelectorAll('*')) {
      child.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    }
    return { el, component: { id: 'c1' }, config, state: 'idle', pending: 0, layer: null };
  }

  // Finding 4: global.ResizeObserver and the Range.prototype.getClientRects
  // patch are real, capture-and-restore globals, not vi.stubGlobal calls —
  // vi.unstubAllGlobals() below does not touch either of them on its own.
  // ResizeObserver is restored by routing it through vi.stubGlobal instead
  // (so the existing vi.unstubAllGlobals() call restores it for free); the
  // prototype patch has no vi.stubGlobal equivalent, so it's captured and
  // restored by hand, deleting it again if this suite is what added it.
  let hadGetClientRects;
  let originalGetClientRects;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.innerWidth = 700; // band 'sm' throughout — held fixed so every put()/get() in these tests agrees on band
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    hadGetClientRects = Object.prototype.hasOwnProperty.call(Range.prototype, 'getClientRects');
    originalGetClientRects = Range.prototype.getClientRects;
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
    }
  });

  afterEach(() => {
    delete window.Livewire;
    delete window.Ghostwire;
    document.body.innerHTML = '';
    vi.unstubAllGlobals(); // restores ResizeObserver

    if (hadGetClientRects) {
      Range.prototype.getClientRects = originalGetClientRects;
    } else {
      delete Range.prototype.getClientRects;
    }
  });

  // Ruling B: proves the full cycle end to end, not against a hand-seeded
  // fixture. A real synthesis run (the actual walk/measure/emit/signature
  // pipeline) persists through the real learningStore.put(); a FRESH store
  // instance backed by the same storage reads it back through the real
  // learningStore.get(); boot()'s own paintLazyPlaceholders() paints exactly
  // that. A hand-seeded envelope never calls put() at all, so it could never
  // catch a key-format mismatch between what put() writes and what
  // get()/paintLazyPlaceholders() reads, or a shape mismatch between what a
  // real synthesis hands the callback and what the store/renderer expect.
  it('paints the exact geometry a real synthesis persisted, read back through a fresh store instance', () => {
    const storage = fakeStorage();
    const registry = createRegistry();
    const seedingStore = createLearningStore({ storage });
    const host = synthesizableHost({ learning: true, name: 'orders-table' });
    const synthesizer = createSynthesizer(registry, undefined, undefined, undefined, (h, signature, boneTree, hostRect) => {
      if (!h.config.learning || !h.config.name) return; // mirrors index.js's own onSynthesized gating
      seedingStore.put(h.config.name, signature, bandFor(window.innerWidth), hostRect, boneTree);
    });

    const realBoneTree = synthesizer.synthesize(host);
    expect(realBoneTree.length).toBeGreaterThan(0); // sanity: there is really something to persist, not just a non-null empty tree

    document.body.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(placeholder);

    window.Livewire = fakeLivewire();
    vi.stubGlobal('localStorage', storage);
    boot();

    expect(placeholder.classList.contains('gw-lazy')).toBe(true);
    expect(placeholder.style.width).toBe('200px');
    expect(placeholder.style.height).toBe('100px');
    const bones = placeholder.querySelectorAll('.gw-bone');
    expect(bones).toHaveLength(realBoneTree.length);
    expect(bones[0].className).toBe(`gw-bone gw-bone--${realBoneTree[0].type}`);
    expect(bones[0].style.left).toBe(`${realBoneTree[0].x}px`);
    expect(placeholder.dataset.ghostLazyPainted).toBe('1');
  });

  // Finding 1: a pure "nothing painted" assertion can't tell "correctly
  // found nothing learned" apart from "the harness never ran at all" (e.g.
  // detectBridge() failing to recognise fakeLivewire() and boot() returning
  // early). Asserting the precondition through the same store-reading code
  // paintLazyPlaceholders itself uses pins down which of those it actually
  // was, so a broken precondition fails loudly at that line instead of
  // reading as a correct skip two lines later.
  it('leaves a placeholder unpainted when nothing has been learned for it', () => {
    const storage = fakeStorage();
    const band = bandFor(window.innerWidth);
    expect(createLearningStore({ storage }).get('never-learned', band)).toBeNull(); // precondition: genuinely nothing learned for this key

    window.Livewire = fakeLivewire();
    vi.stubGlobal('localStorage', storage);
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', 'never-learned');
    document.body.appendChild(placeholder);

    boot();

    expect(placeholder.classList.contains('gw-lazy')).toBe(false);
    expect(placeholder.querySelectorAll('.gw-bone')).toHaveLength(0);
    expect(placeholder.dataset.ghostLazyPainted).toBeUndefined();
  });

  it('leaves a placeholder unpainted when the only learned tree is for a different viewport band', () => {
    const storage = fakeStorage();
    const store = createLearningStore({ storage });
    store.put('orders-table', 42, 'xl', { width: 300, height: 150 }, [
      { type: 'text', x: 0, y: 0, width: 100, height: 20 },
    ]);
    expect(store.get('orders-table', 'xl')).not.toBeNull(); // precondition: the seed actually landed, at band 'xl'

    window.innerWidth = 320; // band 'xs' — the only stored entry is band 'xl'
    window.Livewire = fakeLivewire();
    vi.stubGlobal('localStorage', storage);
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(placeholder);

    boot();

    expect(placeholder.classList.contains('gw-lazy')).toBe(false);
  });

  it('ignores a data-ghost-lazy value that fails the component-name charset, without throwing (SPEC-SEC-04)', () => {
    expect(NAME_PATTERN.test('<script>alert(1)</script>')).toBe(false); // precondition: this value genuinely fails the charset, not just "happens not to be learned"

    window.Livewire = fakeLivewire();
    vi.stubGlobal('localStorage', fakeStorage());
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', '<script>alert(1)</script>');
    document.body.appendChild(placeholder);

    expect(() => boot()).not.toThrow();
    expect(placeholder.classList.contains('gw-lazy')).toBe(false);
    expect(placeholder.querySelector('script')).toBeNull();
  });

  it('paints without throwing when the learned geometry exceeds the placeholder bounds', () => {
    const storage = fakeStorage();
    createLearningStore({ storage }).put('orders-table', 42, 'sm', { width: 50, height: 50 }, [
      { type: 'text', x: 40, y: 0, width: 500, height: 20 }, // wider than the container it will be painted into
    ]);
    window.Livewire = fakeLivewire();
    vi.stubGlobal('localStorage', storage);
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(placeholder);

    expect(() => boot()).not.toThrow();

    // Painted as-is — SPEC-SEC-04 is about markup/selector injection, not
    // visual containment, and .gw-lazy (Step 5) is deliberately not
    // overflow:hidden, so nothing clips this. Documented accepted behaviour.
    const bone = placeholder.querySelector('.gw-bone');
    expect(bone.style.width).toBe('500px');
  });

  it('never repaints an already-painted placeholder, even when a later morph occurs and the stored tree has changed', () => {
    const storage = fakeStorage();
    const store = createLearningStore({ storage });
    store.put('orders-table', 42, 'sm', { width: 200, height: 100 }, [
      { type: 'text', x: 0, y: 0, width: 100, height: 20 },
    ]);
    const livewire = fakeLivewire();
    window.Livewire = livewire;
    vi.stubGlobal('localStorage', storage);
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(placeholder);

    boot(); // paints once, at the end of boot()
    expect(placeholder.style.width).toBe('200px');

    store.put('orders-table', 43, 'sm', { width: 999, height: 999 }, [
      { type: 'text', x: 0, y: 0, width: 999, height: 20 },
    ]);
    livewire.trigger('morphed', { component: { id: 'unrelated' } });

    expect(placeholder.style.width).toBe('200px'); // unchanged — the painted flag skipped the repaint
  });

  it('paints a lazy placeholder inserted into the DOM after boot(), when a morph occurs', () => {
    const storage = fakeStorage();
    createLearningStore({ storage }).put('orders-table', 42, 'sm', { width: 200, height: 100 }, [
      { type: 'text', x: 0, y: 0, width: 100, height: 20 },
    ]);
    const livewire = fakeLivewire();
    window.Livewire = livewire;
    vi.stubGlobal('localStorage', storage);

    boot(); // nothing lazy in the DOM yet — no-op

    const placeholder = document.createElement('div'); // simulates another component's morph inserting this root
    placeholder.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(placeholder);
    livewire.trigger('morphed', { component: { id: 'unrelated' } });

    expect(placeholder.classList.contains('gw-lazy')).toBe(true);
    expect(placeholder.querySelectorAll('.gw-bone')).toHaveLength(1);
  });
});
