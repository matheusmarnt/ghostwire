import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createV3Bridge } from '../src/bridge/v3.js';

function makeCommit(calls = []) {
  return { calls };
}

describe('bridge v3', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('exposes name "v3"', () => {
    expect(createV3Bridge().name).toBe('v3');
  });

  it('calls onStart with component, action names, and isSync from an empty calls array', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const componentEl = document.getElementById('root');
    const captured = [];
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1', el: componentEl }, commit: makeCommit([]), succeed: () => {}, fail: () => {} });
      },
    };
    createV3Bridge().subscribe({ onStart: (ctx) => captured.push(ctx), onPostPaint: () => {}, onFinish: () => {} });

    expect(captured[0]).toEqual({
      component: { id: 'c1', el: componentEl },
      actionNames: [],
      isSync: true,
      isPoll: false,
      isRenderless: false,
    });
  });

  it('reads action names from commit.calls[].method (SPEC-API-20 silence-by-default relies on this list being accurate)', () => {
    document.body.innerHTML = '<div id="root"><button wire:click="save"></button></div>';
    const componentEl = document.getElementById('root');
    const captured = [];
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1', el: componentEl }, commit: makeCommit([{ path: '', method: 'save', params: [] }]), succeed: () => {}, fail: () => {} });
      },
    };
    createV3Bridge().subscribe({ onStart: (ctx) => captured.push(ctx), onPostPaint: () => {}, onFinish: () => {} });

    expect(captured[0].actionNames).toEqual(['save']);
    expect(captured[0].isSync).toBe(false);
  });

  it('emulates post-paint removal via succeed -> two chained rAF (SPEC-INT-21)', () => {
    const onPostPaint = vi.fn();
    let capturedSucceedCb;
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1' }, commit: makeCommit([]), succeed: (fn) => { capturedSucceedCb = fn; }, fail: () => {} });
      },
    };
    createV3Bridge().subscribe({ onStart: () => {}, onPostPaint, onFinish: () => {} });

    capturedSucceedCb();

    expect(onPostPaint).toHaveBeenCalledOnce();
  });

  it('finalizes (onFinish) exactly once via succeed, idempotently', () => {
    const onFinish = vi.fn();
    let capturedSucceedCb;
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1' }, commit: makeCommit([]), succeed: (fn) => { capturedSucceedCb = fn; }, fail: () => {} });
      },
    };
    createV3Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish });

    capturedSucceedCb();
    capturedSucceedCb(); // a second invocation must not double-fire onFinish

    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('finalizes (onFinish) via fail, without calling onPostPaint', () => {
    const onFinish = vi.fn();
    const onPostPaint = vi.fn();
    let capturedFailCb;
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1' }, commit: makeCommit([]), succeed: () => {}, fail: (fn) => { capturedFailCb = fn; } });
      },
    };
    createV3Bridge().subscribe({ onStart: () => {}, onPostPaint, onFinish });

    capturedFailCb();

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onPostPaint).not.toHaveBeenCalled();
  });

  it('A12: reports isPoll true for a commit whose sole call name matches an element with wire:poll in the component root (conservative default) — index.js decides silence now', () => {
    document.body.innerHTML = '<div id="root"><button wire:poll.5s="refresh"></button></div>';
    const componentEl = document.getElementById('root');
    const onStart = vi.fn();
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1', el: componentEl },
          commit: makeCommit([{ path: '', method: 'refresh', params: [] }]),
          succeed: () => {}, fail: () => {},
        });
      },
    };
    createV3Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].isPoll).toBe(true);
  });

  it('A12: reports isPoll true when wire:poll is declared directly on the component root element itself', () => {
    document.body.innerHTML = '<div id="root" wire:poll.5s="refresh"></div>';
    const componentEl = document.getElementById('root');
    const onStart = vi.fn();
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1', el: componentEl },
          commit: makeCommit([{ path: '', method: 'refresh', params: [] }]),
          succeed: () => {}, fail: () => {},
        });
      },
    };
    createV3Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].isPoll).toBe(true);
  });

  it('A12: does not report isPoll for a call name that matches no wire:poll element', () => {
    document.body.innerHTML = '<div id="root"><button wire:click="save"></button></div>';
    const componentEl = document.getElementById('root');
    const onStart = vi.fn();
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1', el: componentEl },
          commit: makeCommit([{ path: '', method: 'save', params: [] }]),
          succeed: () => {}, fail: () => {},
        });
      },
    };
    createV3Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].isPoll).toBe(false);
  });

  // Regression test for M1 final review Fix 3: isPolledMethod used to treat
  // a bare `wire:poll` (no explicit method target) as matching ANY method
  // name, which silenced every commit from a component -- including real
  // user-triggered actions like save() -- as long as a bare wire:poll
  // existed anywhere in it. A bare wire:poll's own commit triggers
  // Livewire's $refresh (empty calls array), which is already silenced by
  // the separate isSync check, so this heuristic should never match it.
  it('A12: a bare wire:poll (no explicit target) does not silence a save() action call', () => {
    document.body.innerHTML = '<div id="root"><span wire:poll>loading</span><button wire:click="save"></button></div>';
    const componentEl = document.getElementById('root');
    const onStart = vi.fn();
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1', el: componentEl },
          commit: makeCommit([{ path: '', method: 'save', params: [] }]),
          succeed: () => {}, fail: () => {},
        });
      },
    };
    createV3Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
  });

  // SPEC-API-22: confirmed via a real capture (tests/Browser/Timing/
  // RenderlessTest.php, see the Task 6 report) that a #[Renderless]-triggered
  // v3 commit's response omits the "html" effect key entirely. ctx.isRenderless
  // starts false (unknown until the response arrives) and is corrected inside
  // the succeed(response) callback, before onFinish/onPostPaint run.
  it('SPEC-API-22: reports isRenderless false at onStart (not yet knowable) and true by onFinish/onPostPaint when the response has no "html" effect', () => {
    let capturedSucceedCb;
    const captured = [];
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1' },
          commit: makeCommit([{ path: '', method: 'renderlessBump', params: [] }]),
          succeed: (fn) => { capturedSucceedCb = fn; }, fail: () => {},
        });
      },
    };
    let onFinishCtx = null;
    let onPostPaintCtx = null;
    createV3Bridge().subscribe({
      onStart: (ctx) => captured.push(ctx),
      onPostPaint: (ctx) => { onPostPaintCtx = ctx; },
      onFinish: (ctx) => { onFinishCtx = ctx; },
    });

    expect(captured[0].isRenderless).toBe(false);

    capturedSucceedCb({ snapshot: '{}', effects: { returns: [null] } });

    expect(onFinishCtx.isRenderless).toBe(true);
    expect(onPostPaintCtx.isRenderless).toBe(true);
  });

  it('SPEC-API-22: reports isRenderless false when the response has an "html" effect (ordinary action)', () => {
    let capturedSucceedCb;
    let onFinishCtx = null;
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({
          component: { id: 'c1' },
          commit: makeCommit([{ path: '', method: 'refresh', params: [] }]),
          succeed: (fn) => { capturedSucceedCb = fn; }, fail: () => {},
        });
      },
    };
    createV3Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: (ctx) => { onFinishCtx = ctx; } });

    capturedSucceedCb({ snapshot: '{}', effects: { returns: [null], html: '<div></div>' } });

    expect(onFinishCtx.isRenderless).toBe(false);
  });

  it('subscribe returns an unsubscribe function even though Livewire.hook itself returns nothing (SPEC-INT-24: no documented v3 unsubscribe)', () => {
    global.Livewire = { hook() { /* no return value, matches real v3 */ } };

    const unsub = createV3Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: () => {} });

    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
