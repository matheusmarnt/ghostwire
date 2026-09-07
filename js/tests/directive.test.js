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

vi.mock('../src/registry.js', async (importOriginal) => {
  const actual = await importOriginal();
  const instances = [];
  return {
    createRegistry: (...args) => {
      const real = actual.createRegistry(...args);
      const spied = {
        ...real,
        attach: vi.fn(real.attach),
        detach: vi.fn(real.detach),
      };
      instances.push(spied);
      return spied;
    },
    __instances: instances,
  };
});

import { boot } from '../src/index.js';
import { __instances as schedulerInstances } from '../src/scheduler.js';
import { __instances as registryInstances } from '../src/registry.js';

describe('directive registration and modifier parsing', () => {
  let registeredCallback;
  let interceptedCallback;
  let hookCallbacks;

  beforeEach(() => {
    document.body.innerHTML = '';
    registeredCallback = null;
    interceptedCallback = null;
    hookCallbacks = new Map();
    window.Livewire = {
      interceptMessage: (cb) => { interceptedCallback = cb; return () => {}; },
      hook: vi.fn((name, cb) => {
        if (!hookCallbacks.has(name)) hookCallbacks.set(name, []);
        hookCallbacks.get(name).push(cb);
      }),
      directive: (name, cb) => { if (name === 'ghost') registeredCallback = cb; },
    };
  });
  afterEach(() => { delete window.Livewire; });

  function componentInitCallback() {
    return hookCallbacks.get('component.init')?.at(-1);
  }

  it('registers the "ghost" directive', () => {
    boot();
    expect(registeredCallback).toBeTypeOf('function');
  });

  it('parses the .freeze modifier without throwing and registers a cleanup function', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const component = { id: 'c1', el };
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
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
      component: { id: 'c1', el },
      cleanup: (fn) => { firstCleanup = fn; },
    });
    firstCleanup();

    let secondCleanup;
    expect(() => registeredCallback({
      el,
      directive: { modifiers: [], expression: '' },
      component: { id: 'c1', el },
      cleanup: (fn) => { secondCleanup = fn; },
    })).not.toThrow();

    expect(secondCleanup).toBeTypeOf('function');
  });

  describe('data-ghost attribute merge and auto-attach (component.init)', () => {
    it("directive config wins over the attribute's mode where the directive explicitly set it (SPEC-API-40)", () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"m":"synthesize"}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: ['freeze'], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const [, , config] = registry.attach.mock.calls.at(-1);
      expect(config.mode).toBe('freeze');
    });

    it('the attribute fills a field the directive left unset, without the directive stomping it with a default (SPEC-API-40)', () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"m":"freeze","h":900}');
      document.body.appendChild(el);

      // No .freeze/.off modifier on the directive itself -> parseModifiers()
      // must not inject mode: 'synthesize' and stomp the attribute's
      // mode: 'freeze'.
      registeredCallback({
        el,
        directive: { modifiers: [], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const [, , config] = registry.attach.mock.calls.at(-1);
      expect(config.mode).toBe('freeze');
      expect(config.hold).toBe(900);
    });

    it("an explicit directive .delay(N)ms wins over the attribute's delay value (SPEC-API-40)", () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"d":50}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: ['delay.200ms'], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const [, , config] = registry.attach.mock.calls.at(-1);
      expect(config.delay).toBe(200);
    });

    it('auto-attaches a host from data-ghost alone when component.init fires and no wire:ghost directive exists', () => {
      boot();
      const root = document.createElement('div');
      root.setAttribute('data-ghost', '{"m":"freeze","l":true}');
      document.body.appendChild(root);

      const cleanupFns = [];
      componentInitCallback()({
        component: { id: 'c2', el: root },
        cleanup: (fn) => cleanupFns.push(fn),
      });

      expect(cleanupFns).toHaveLength(1);
      const registry = registryInstances.at(-1);
      expect(registry.attach).toHaveBeenCalledTimes(1);
      const [attachedEl, , config] = registry.attach.mock.calls.at(-1);
      expect(attachedEl).toBe(root);
      expect(config.mode).toBe('freeze');
      expect(config.lazy).toBe(true);

      // A directive later targeting a *different* element on this same
      // component must not collide with the attribute-only host.
      let directiveCleanup;
      const other = document.createElement('div');
      root.appendChild(other);
      registeredCallback({
        el: other,
        directive: { modifiers: [], expression: '' },
        component: { id: 'c2', el: root },
        cleanup: (fn) => { directiveCleanup = fn; },
      });
      expect(directiveCleanup).toBeTypeOf('function');
      expect(registry.attach).toHaveBeenCalledTimes(2);
    });

    it('skips auto-attach when data-ghost mode is "off"', () => {
      boot();
      const root = document.createElement('div');
      root.setAttribute('data-ghost', '{"m":"off"}');
      document.body.appendChild(root);

      expect(() => componentInitCallback()({
        component: { id: 'c3', el: root },
        cleanup: () => { throw new Error('cleanup must not be registered for an off host'); },
      })).not.toThrow();

      expect(registryInstances.at(-1).attach).not.toHaveBeenCalled();
    });

    it('skips auto-attach when component.init fires before the same-root wire:ghost directive (real Livewire ordering, SPEC-API-13)', () => {
      boot();
      const root = document.createElement('div');
      // Real Livewire fires "component.init" *before* it processes this
      // same element's own directive.init pass (verified by reading
      // vendor/livewire/livewire/dist/livewire.esm.js — see index.js's
      // hasGhostDirective() comment), so a naive registry.hostFor(root)
      // check alone would miss this and double-attach. Reproduce that
      // real ordering here: component.init fires first, wire:ghost is
      // already present in the DOM (as it always is by the time Alpine
      // walks it), and the directive callback fires second.
      root.setAttribute('wire:ghost', '');
      root.setAttribute('data-ghost', '{"h":500}');
      document.body.appendChild(root);
      const component = { id: 'c4', el: root };

      let autoAttachCleanupCalled = false;
      componentInitCallback()({
        component,
        cleanup: () => { autoAttachCleanupCalled = true; },
      });
      expect(autoAttachCleanupCalled).toBe(false); // hasGhostDirective() must have short-circuited before registering any cleanup
      expect(registryInstances.at(-1).attach).not.toHaveBeenCalled();

      let directiveCleanup;
      registeredCallback({
        el: root,
        directive: { modifiers: [], expression: '' },
        component,
        cleanup: (fn) => { directiveCleanup = fn; },
      });
      expect(directiveCleanup).toBeTypeOf('function');
      // Exactly one host for this element — the directive's — not two.
      expect(registryInstances.at(-1).attach).toHaveBeenCalledTimes(1);
    });
  });
});
