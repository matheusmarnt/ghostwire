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

  it('SPEC-PERF-07: skips synthesis only after two consecutive slow synthesize() calls, not a single one', () => {
    const registry = createRegistry();
    let call = 0;
    const now = () => { call += 1; return call % 2 === 0 ? 1000 : 0; }; // every odd call is a "start" (0), every even call is an "end" 1000ms later — every synthesize() call measures as 1000ms (slow)
    const synthesizer = createSynthesizer(registry, undefined, undefined, now);
    const host = makeHost('<p>Hello world</p>');

    const first = synthesizer.synthesize(host);
    expect(first).not.toBeNull(); // 1st slow call: streak becomes 1, but this call itself still completes

    const second = synthesizer.synthesize(host);
    expect(second).not.toBeNull(); // 2nd slow call: streak was only 1 at entry, so this one still completes too — streak becomes 2 only after it finishes

    const third = synthesizer.synthesize(host);
    expect(third).toBeNull(); // streak is now 2 (the limit) at entry: SPEC-PERF-07 skips straight to freeze
  });

  it('SPEC-PERF-07: a fast synthesis resets the slow-streak counter, so isolated jitter never triggers freeze', () => {
    const registry = createRegistry();
    const durations = [0, 1000, 2000, 2001, 2002, 2003]; // call1: 0->1000 (slow, 1000ms); call2: 2000->2001 (fast, 1ms) resets the streak; call3: 2002->2003 (fast, 1ms)
    let call = 0;
    const now = () => durations[call++];
    const synthesizer = createSynthesizer(registry, undefined, undefined, now);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host); // slow -> streak becomes 1
    synthesizer.synthesize(host); // fast -> streak resets to 0
    const third = synthesizer.synthesize(host); // should NOT be frozen despite the earlier slow call

    expect(third).not.toBeNull();
  });

  it('forget() clears the slow-synthesis streak so a fresh host is not pre-emptively frozen', () => {
    const registry = createRegistry();
    let call = 0;
    const now = () => { call += 1; return call % 2 === 0 ? 1000 : 0; };
    const synthesizer = createSynthesizer(registry, undefined, undefined, now);
    const host = makeHost('<p>Hello world</p>');

    synthesizer.synthesize(host); // streak -> 1
    synthesizer.synthesize(host); // streak -> 2 (would now freeze on the next call)
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

  it('uses collectAndClassifyRange and the region rect when a region is passed to synthesize()', () => {
    const registry = createRegistry();
    const host = { el: document.createElement('div'), config: {} };
    registry.attach(host.el, { id: 'c1' }, {});
    // Stubbed (unlike the earlier revision of this test) so the whole-host
    // path below also produces real bones — the point is now to compare
    // WHAT each path includes, not null-vs-non-null.
    host.el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 300, bottom: 100, width: 300, height: 100 });
    document.body.appendChild(host.el);

    // A control OUTSIDE the island's start/end markers but still directly
    // inside host.el: a whole-host synthesize must see it; a region-scoped
    // one must not. This is the actual SPEC-INT-13 guarantee under test — a
    // region narrower than the host excludes out-of-region content — not
    // merely "the region path executes" or "an unstubbed host rect degrades
    // to null" (both true of the previous revision, but incidental per
    // review).
    const outside = document.createElement('button');
    outside.getBoundingClientRect = () => ({ top: 50, left: 210, right: 290, bottom: 70, width: 80, height: 20 });

    // The island's markers and content live inside host.el (as they would in
    // real Livewire output — an @island block nested within the component),
    // so measure.js's computeClipRect() walk from the candidate up to
    // host.el stays inside this subtree.
    const start = document.createComment('[if FRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    const inner = document.createElement('div');
    // inner's rect is deliberately huge so the ancestor-clip intersection in
    // computeClipRect() is a no-op against either hostRect used below
    // (host.el's or regionRect's), regardless of jsdom's incomplete overflow
    // computed-style resolution for a plain element.
    inner.getBoundingClientRect = () => ({ top: -1000, left: -1000, right: 1000, bottom: 1000, width: 2000, height: 2000 });
    const text = document.createElement('p');
    text.textContent = 'x';
    text.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    inner.appendChild(text);
    const end = document.createComment('[if ENDFRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    host.el.append(outside, start, inner, end);

    const regionRect = { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 };
    const synthesizer = createSynthesizer(registry);

    const boneTree = synthesizer.synthesize(host, { startNode: start, endNode: end, rect: regionRect });
    const wholeHostTree = synthesizer.synthesize(host);

    // Region-scoped: sees the island's own text, never the out-of-region control.
    expect(boneTree).not.toBeNull();
    expect(boneTree.some((bone) => bone.type === 'control')).toBe(false);
    // Whole-host: sees the same control, proving it was reachable and the
    // region path's omission of it is real exclusion, not a fluke.
    expect(wholeHostTree.some((bone) => bone.type === 'control')).toBe(true);
  });
});
