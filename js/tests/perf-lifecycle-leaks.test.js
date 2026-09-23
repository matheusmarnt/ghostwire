// "nenhum crescimento de memória após 500 ciclos de montagem e
// desmontagem". jsdom cannot measure bytes, and a byte count would be exactly
// the kind of absolute threshold now retired. What can grow across cycles
// in this runtime, structurally, is: Ghost Layer / bone elements left in the
// document, ResizeObservers left observing (signature.js registers one per
// fresh synthesis), scheduler timers left armed, and the live region being
// recreated. Each is asserted directly after 500 real show -> postPaint ->
// finish -> hide cycles through boot()'s real wiring, then after teardown.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot } from '../src/index.js';

class FakeResizeObserver {
  constructor(callback) { this.callback = callback; this.active = false; FakeResizeObserver.instances.push(this); }
  observe() { this.active = true; }
  disconnect() { this.active = false; }
}
FakeResizeObserver.instances = [];

const origGetClientRects = Range.prototype.getClientRects;
const origBCR = Element.prototype.getBoundingClientRect;

describe('500 show/hide cycles leak nothing', () => {
  let registeredCallback;
  let interceptedCallback;
  let hostEl;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    // The real concealment rule from js/src/style.css: while the skeleton is
    // showing, host.el carries .gw-concealed and every descendant inherits
    // visibility: hidden. Matches js/tests/resize-reposition.test.js's
    // harness so this test runs under the same real concealment inheritance.
    document.head.innerHTML = '<style>.gw-concealed { visibility: hidden; }</style>';
    FakeResizeObserver.instances = [];
    global.ResizeObserver = FakeResizeObserver;
    Element.prototype.getBoundingClientRect = function () {
      return this === hostEl
        ? { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 }
        : { top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 };
    };
    Range.prototype.getClientRects = () => [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
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
    document.head.innerHTML = '';
    delete window.Livewire;
    vi.useRealTimers();
  });

  // One complete message lifecycle: start -> (120ms) show -> response ->
  // onPostPaint -> finish -> (hold 300ms) hide. Mirrors the real v4 bridge's
  // callback shapes (js/src/bridge/v4.js).
  function runCycle() {
    let success;
    let finish;
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
      onSuccess: (cb) => { success = cb; },
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => { finish = cb; },
    });
    vi.advanceTimersByTime(120); // show
    expect(document.querySelector('.gw-layer')).not.toBeNull();
    success({ payload: { effects: { html: '<div></div>' } }, onRender: (fn) => fn() }); // onPostPaint
    finish(); // onFinish
    vi.advanceTimersByTime(300); // hold elapses -> hide
    expect(document.querySelector('.gw-layer')).toBeNull();
  }

  it('leaves no layers, bones, observers, timers or extra elements behind after 500 cycles, nor after teardown', () => {
    boot();
    hostEl = document.createElement('div');
    hostEl.innerHTML = '<p>Hello world</p><p>Second line</p>';
    document.body.appendChild(hostEl);
    let cleanupFn;
    registeredCallback({
      el: hostEl,
      directive: { modifiers: [], expression: '' },
      component: { id: 'c1', el: hostEl },
      cleanup: (fn) => { cleanupFn = fn; },
    });

    runCycle();
    const elementsAfterFirstCycle = document.body.querySelectorAll('*').length; // host, its <p>s, the one live region
    const activeObserversAfterFirstCycle = FakeResizeObserver.instances.filter((o) => o.active).length;
    expect(activeObserversAfterFirstCycle).toBe(1); // sanity: synthesis registered its own observer

    for (let i = 0; i < 499; i++) runCycle();

    expect(document.querySelectorAll('.gw-layer')).toHaveLength(0);
    expect(document.querySelectorAll('.gw-bone')).toHaveLength(0);
    expect(document.body.querySelectorAll('*').length).toBe(elementsAfterFirstCycle);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(FakeResizeObserver.instances.filter((o) => o.active)).toHaveLength(1); // still the one observer: the cache hit on every later cycle, nothing re-registered
    expect(vi.getTimerCount()).toBe(0); // delay, hold and hard-timeout timers all fired or were cleared
    expect(hostEl.getAttribute('aria-busy')).toBeNull();
    expect(hostEl.classList.contains('gw-concealed')).toBe(false);

    cleanupFn(); // the directive's own teardown (component removed)

    expect(FakeResizeObserver.instances.filter((o) => o.active)).toHaveLength(0);
    expect(document.querySelectorAll('.gw-layer')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
