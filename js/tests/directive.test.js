import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/scheduler.js', async (importOriginal) => {
  const actual = await importOriginal();
  const instances = [];
  return {
    createScheduler: (...args) => {
      const real = actual.createScheduler(...args);
      const spied = {
        ...real,
        messageStart: vi.fn(real.messageStart),
        messagePostPaint: vi.fn(real.messagePostPaint),
        messageFinish: vi.fn(real.messageFinish),
      };
      instances.push(spied);
      return spied;
    },
    __instances: instances,
  };
});

import { boot } from '../src/index.js';
import { __instances as schedulerInstances } from '../src/scheduler.js';

describe('directive registration and modifier parsing', () => {
  let registeredCallback;
  let interceptedCallback;

  beforeEach(() => {
    document.body.innerHTML = '';
    registeredCallback = null;
    interceptedCallback = null;
    window.Livewire = {
      interceptMessage: (cb) => { interceptedCallback = cb; return () => {}; },
      hook: vi.fn(),
      directive: (name, cb) => { if (name === 'ghost') registeredCallback = cb; },
    };
  });
  afterEach(() => { delete window.Livewire; });

  it('registers the "ghost" directive', () => {
    boot();
    expect(registeredCallback).toBeTypeOf('function');
  });

  it('parses the .freeze modifier without throwing and registers a cleanup function', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const component = { id: 'c1' };
    let cleanupFn;
    registeredCallback({
      el,
      directive: { modifiers: ['freeze'], expression: '' },
      component,
      cleanup: (fn) => { cleanupFn = fn; },
    });

    // Full start -> visible -> hide behavior through a real bridge is exercised
    // end-to-end in Task 10/11's Pest browser tests against the real, built
    // bundle and a real Livewire page — that is the only place a real
    // interceptMessage/hook callback fires. This test only proves wiring.
    expect(cleanupFn).toBeTypeOf('function');
  });

  it('unknown modifiers do not throw (SPEC-API-01: fail visibly only in dev, ignored in production)', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(() => registeredCallback({
      el,
      directive: { modifiers: ['totallyMadeUp'], expression: '' },
      component: { id: 'c1' },
      cleanup: () => {},
    })).not.toThrow();
  });

  it('a sync-only message is a complete no-op across onStart/onPostPaint/onFinish (SPEC-API-20)', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    registeredCallback({
      el,
      directive: { modifiers: [], expression: '' },
      component: { id: 'c1' },
      cleanup: () => {},
    });

    const scheduler = schedulerInstances.at(-1);

    // A sync-only commit (e.g. wire:model.live) — no actions, so isSync is
    // true. Its onSuccess/onFinish registrars are invoked synchronously here
    // to simulate the full v4 lifecycle firing for a host that was never
    // started (regression: onPostPaint/onFinish used to run unconditionally
    // and could decrement/settle a host whose pending count they never
    // incremented, e.g. while a genuinely async message is in flight on the
    // same component).
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [] },
      onSuccess: (cb) => cb({ onRender: (fn) => fn() }),
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(scheduler.messageStart).not.toHaveBeenCalled();
    expect(scheduler.messagePostPaint).not.toHaveBeenCalled();
    expect(scheduler.messageFinish).not.toHaveBeenCalled();
  });

  it('parses the .ignore modifier without throwing and registers a cleanup function', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    let cleanupFn;
    registeredCallback({
      el,
      directive: { modifiers: ['ignore'], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { cleanupFn = fn; },
    });

    expect(cleanupFn).toBeTypeOf('function');
    expect(() => cleanupFn()).not.toThrow();
  });

  it('parses the .keep modifier without throwing and registers a cleanup function', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    let cleanupFn;
    registeredCallback({
      el,
      directive: { modifiers: ['keep'], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { cleanupFn = fn; },
    });

    expect(cleanupFn).toBeTypeOf('function');
    expect(() => cleanupFn()).not.toThrow();
  });

  it('applies .gw-kept to a .keep-marked host immediately at attach time (SPEC-MORPH-03)', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    let cleanupFn;
    registeredCallback({
      el,
      directive: { modifiers: ['keep'], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { cleanupFn = fn; },
    });

    expect(el.classList.contains('gw-kept')).toBe(true);

    cleanupFn();
    expect(el.classList.contains('gw-kept')).toBe(false);
  });

  it('parses the .rows.N modifier into config.rows without throwing', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    let cleanupFn;
    expect(() => registeredCallback({
      el,
      directive: { modifiers: ['rows.4'], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { cleanupFn = fn; },
    })).not.toThrow();
    expect(cleanupFn).toBeTypeOf('function');
  });

  it('cleanup() leaves the element ready for a fresh attach (no leaked synthesizer state blocks re-registration)', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);

    let firstCleanup;
    registeredCallback({
      el,
      directive: { modifiers: [], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { firstCleanup = fn; },
    });
    firstCleanup();

    let secondCleanup;
    expect(() => registeredCallback({
      el,
      directive: { modifiers: [], expression: '' },
      component: { id: 'c1' },
      cleanup: (fn) => { secondCleanup = fn; },
    })).not.toThrow();

    expect(secondCleanup).toBeTypeOf('function');
  });
});
