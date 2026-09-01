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
    const captured = [];
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1' }, commit: makeCommit([]), succeed: () => {}, fail: () => {} });
      },
    };
    createV3Bridge().subscribe({ onStart: (ctx) => captured.push(ctx), onPostPaint: () => {}, onFinish: () => {} });

    expect(captured[0]).toEqual({ component: { id: 'c1' }, actionNames: [], isSync: true });
  });

  it('reads action names from commit.calls[].method (SPEC-API-20 silence-by-default relies on this list being accurate)', () => {
    const captured = [];
    global.Livewire = {
      hook(name, cb) {
        if (name !== 'commit') return;
        cb({ component: { id: 'c1' }, commit: makeCommit([{ path: '', method: 'save', params: [] }]), succeed: () => {}, fail: () => {} });
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

  it('A12: silences a commit whose sole call name matches an element with wire:poll in the component root (conservative default)', () => {
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

    expect(onStart).not.toHaveBeenCalled();
  });

  it('A12: does not silence a call name that matches no wire:poll element', () => {
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
  });

  it('subscribe returns an unsubscribe function even though Livewire.hook itself returns nothing (SPEC-INT-24: no documented v3 unsubscribe)', () => {
    global.Livewire = { hook() { /* no return value, matches real v3 */ } };

    const unsub = createV3Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: () => {} });

    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
