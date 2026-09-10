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

  it('only activates a host targeted by wire:ghost="name" when the triggering action matches (SPEC-API grammar §10.1)', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    registeredCallback({
      el,
      directive: { modifiers: [], expression: 'save, delete' },
      component: { id: 'c1', el },
      cleanup: () => {},
    });

    const scheduler = schedulerInstances.at(-1);

    // Non-matching action: the host must not activate.
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'other' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: () => {},
    });
    expect(scheduler.messageStart).not.toHaveBeenCalled();

    // Matching action: the host must activate.
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: () => {},
    });
    expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
  });

  // Critical fix (post-Task-6 review): v4's synchronous Renderless signal
  // (a `.renderless` directive modifier sets action.metadata.renderless
  // before onStart even runs) made onStart correctly skip
  // scheduler.messageStart for that host, but onPostPaint/onFinish didn't
  // check isRenderless at all — they unconditionally called
  // scheduler.messagePostPaint/messageFinish for the same host. In
  // isolation that's a no-op (pending floors at 0), but a genuine, still
  // in-flight message on the SAME host would have its host.pending
  // decremented by the renderless message's spurious finish, silently
  // cancelling it. index.js now snapshots ctx.isRenderless into
  // ctx._gwSkippedRenderless the moment onStart runs (before either bridge
  // can ever mutate it) and gates onPostPaint/onFinish on that frozen
  // snapshot, so a message onStart skipped can never desync the ones it
  // didn't.
  it('a synchronous-Renderless message does not desync host.pending for a genuine concurrent message on the same host (Critical fix)', () => {
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
    const registry = registryInstances.at(-1);
    const host = [...registry.hostsFor('c1')][0];

    // A genuine message starts first and is left in flight (its onFinish is
    // captured, not invoked yet).
    let realFinish;
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save', metadata: {} }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => { realFinish = cb; },
    });
    expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
    expect(host.pending).toBe(1);

    // A `.renderless`-modified message fires and fully resolves on the same
    // host while the genuine message above is still in flight.
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'upload', metadata: { renderless: true } }] },
      onSuccess: (cb) => cb({ payload: { effects: {} }, onRender: (fn) => fn() }),
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    // onStart already skipped this message entirely -- onPostPaint/onFinish
    // must not have touched the scheduler for it either.
    expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
    expect(scheduler.messageFinish).not.toHaveBeenCalled();
    expect(host.pending).toBe(1); // the genuine message's pending count survived untouched

    // Finishing the genuine message is the actual regression check: before
    // the fix, the renderless message's spurious messageFinish would already
    // have decremented pending to 0 and reset the host to 'idle'.
    realFinish();

    expect(scheduler.messageFinish).toHaveBeenCalledTimes(1);
    expect(host.pending).toBe(0);
  });

  // Same bug class as above, for host.targetActions (Task 5): onStart skips
  // scheduler.messageStart when the triggering action doesn't match, but
  // targetActions never mutates after ctx is built, so mirroring the check
  // live in onPostPaint/onFinish (no snapshot needed) is enough.
  it('a non-matching wire:ghost="name" message does not desync host.pending for a genuine concurrent matching message on the same host', () => {
    boot();
    const el = document.createElement('div');
    document.body.appendChild(el);
    registeredCallback({
      el,
      directive: { modifiers: [], expression: 'save' },
      component: { id: 'c1', el },
      cleanup: () => {},
    });

    const scheduler = schedulerInstances.at(-1);
    const registry = registryInstances.at(-1);
    const host = [...registry.hostsFor('c1')][0];

    let realFinish;
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
      onSuccess: () => {},
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => { realFinish = cb; },
    });
    expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
    expect(host.pending).toBe(1);

    // A non-matching action fires and fully resolves on the same host while
    // the matching message above is still in flight.
    interceptedCallback({
      message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'other' }] },
      onSuccess: (cb) => cb({ payload: {}, onRender: (fn) => fn() }),
      onError: () => {},
      onFailure: () => {},
      onCancel: () => {},
      onFinish: (cb) => cb(),
    });

    expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
    expect(scheduler.messageFinish).not.toHaveBeenCalled();
    expect(host.pending).toBe(1);

    realFinish();

    expect(scheduler.messageFinish).toHaveBeenCalledTimes(1);
    expect(host.pending).toBe(0);
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

  describe('method-level #[Ghost] override application (SPEC-API-10 runtime)', () => {
    it('applies a method-level override to host.config for the duration of the matching commit, then restores it', () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"a":{"increment":{"m":"freeze"}}}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: [], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const scheduler = schedulerInstances.at(-1);
      const registry = registryInstances.at(-1);
      const host = [...registry.hostsFor('c1')][0];
      const baseMode = host.config.mode;
      expect(baseMode).toBe('synthesize'); // pre-override value, no directive/attribute mode set

      let finishCb;
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'increment' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: (cb) => { finishCb = cb; },
      });

      expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
      expect(scheduler.messageStart.mock.calls[0][0].config.mode).toBe('freeze');
      expect(host.config.mode).toBe('freeze');

      finishCb();

      expect(scheduler.messageFinish).toHaveBeenCalledTimes(1);
      expect(host.config.mode).toBe(baseMode); // restored after the commit finishes
    });

    it('lets an explicit directive value outrank a conflicting method-level override', () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"a":{"increment":{"m":"off"}}}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: ['freeze'], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const host = [...registry.hostsFor('c1')][0];
      expect(host.config.mode).toBe('freeze'); // directive already won at parse time

      let finishCb;
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'increment' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: (cb) => { finishCb = cb; },
      });

      expect(host.config.mode).toBe('freeze'); // still freeze, not the method-level "off"

      finishCb();
      expect(host.config.mode).toBe('freeze');
    });

    // Fix-round regression (coordinator-reported): a method-level override
    // can dynamically flip an already-attached, non-off host's
    // host.config.mode to 'off' for one commit. onStart already skips
    // scheduler.messageStart for that host (mode === 'off' gate), but
    // onPostPaint/onFinish did not check mode at all -- a stale assumption
    // from when mode:'off' hosts could never exist in the registry (true
    // only for the STATIC attach-time case). This must skip all three
    // scheduler calls, exactly as if the host had genuinely never started,
    // AND the override must still be restored afterward (not leaked
    // permanently into host.config just because scheduler bookkeeping was
    // skipped).
    it('skips messageStart, messagePostPaint, AND messageFinish when a method-level override dynamically sets mode to off for the triggering action', () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"a":{"archive":{"m":"off"}}}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: [], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const scheduler = schedulerInstances.at(-1);
      const registry = registryInstances.at(-1);
      const host = [...registry.hostsFor('c1')][0];
      expect(host.config.mode).toBe('synthesize'); // statically attached, non-off

      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'archive' }] },
        onSuccess: (cb) => cb({ payload: { effects: { html: '<div></div>' } }, onRender: (fn) => fn() }),
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: (cb) => cb(),
      });

      expect(scheduler.messageStart).not.toHaveBeenCalled();
      expect(scheduler.messagePostPaint).not.toHaveBeenCalled();
      expect(scheduler.messageFinish).not.toHaveBeenCalled();
      expect(host.config.mode).toBe('synthesize'); // override restored, not leaked permanently
    });
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

    // Finding 1 (final whole-branch review): host.config.only/except were
    // transported from #[Ghost(...)] all the way onto the merged host
    // config, but nothing in index.js ever read them, so a component
    // activated purely via attribute-only auto-attach (no wire:ghost in the
    // view at all) still ghosted on every action regardless of only/except.
    // These two tests drive the auto-attach path specifically (not the
    // directive path, which already had its own targetActions coverage
    // above) to prove the gate now applies there too.
    it('enforces data-ghost "o" (only) via the attribute-only auto-attach path (no wire:ghost in the view)', () => {
      boot();
      const root = document.createElement('div');
      root.setAttribute('data-ghost', '{"o":["save"]}');
      document.body.appendChild(root);

      componentInitCallback()({
        component: { id: 'c5', el: root },
        cleanup: () => {},
      });

      const scheduler = schedulerInstances.at(-1);

      // Non-matching action: "only" must keep the host silent.
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c5' }, getActions: () => [{ name: 'refreshBadge' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: () => {},
      });
      expect(scheduler.messageStart).not.toHaveBeenCalled();

      // Matching action: "only" must let the host activate.
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c5' }, getActions: () => [{ name: 'save' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: () => {},
      });
      expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
    });

    it('enforces data-ghost "x" (except) via the attribute-only auto-attach path (no wire:ghost in the view)', () => {
      boot();
      const root = document.createElement('div');
      root.setAttribute('data-ghost', '{"x":["refreshBadge"]}');
      document.body.appendChild(root);

      componentInitCallback()({
        component: { id: 'c6', el: root },
        cleanup: () => {},
      });

      const scheduler = schedulerInstances.at(-1);

      // Excluded action: "except" must keep the host silent.
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c6' }, getActions: () => [{ name: 'refreshBadge' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: () => {},
      });
      expect(scheduler.messageStart).not.toHaveBeenCalled();

      // Any action not on the except list: must let the host activate.
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c6' }, getActions: () => [{ name: 'save' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: () => {},
      });
      expect(scheduler.messageStart).toHaveBeenCalledTimes(1);
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

    // Final-whole-branch-review regression (SPEC-API-13): tests/Browser/
    // Fixtures/views/demo-table.blade.php is the real, pre-existing pattern
    // this reproduces — wire:ghost lives only on descendants (#summary,
    // #list), never on the component root itself. hasGhostDirective() used
    // to check only the root element's own attributes, missed the
    // descendant-only directive, and let component.init auto-attach a
    // spurious extra host at the root — concealing the real directive-
    // created descendant host(s) underneath it. The guard must scan the
    // whole component subtree (root + every descendant), mirroring
    // js/src/bridge/v3.js's isPolledMethod.
    it('skips auto-attach when wire:ghost lives only on a descendant, not the root (SPEC-API-13, demo-table.blade.php pattern)', () => {
      boot();
      const root = document.createElement('div');
      root.setAttribute('data-ghost', '{"h":500}');
      const child = document.createElement('div');
      child.setAttribute('wire:ghost.freeze', '');
      root.appendChild(child);
      document.body.appendChild(root);
      const component = { id: 'c7', el: root };

      let autoAttachCleanupCalled = false;
      componentInitCallback()({
        component,
        cleanup: () => { autoAttachCleanupCalled = true; },
      });
      expect(autoAttachCleanupCalled).toBe(false); // hasGhostDirective() must have short-circuited before registering any cleanup
      expect(registryInstances.at(-1).attach).not.toHaveBeenCalled();

      // The descendant's own wire:ghost directive still creates its host
      // normally — the guard must not suppress the real, directive-owned
      // element, only the spurious root auto-attach.
      let directiveCleanup;
      registeredCallback({
        el: child,
        directive: { modifiers: ['freeze'], expression: '' },
        component,
        cleanup: (fn) => { directiveCleanup = fn; },
      });
      expect(directiveCleanup).toBeTypeOf('function');
      expect(registryInstances.at(-1).attach).toHaveBeenCalledTimes(1);
      const [attachedEl] = registryInstances.at(-1).attach.mock.calls.at(-1);
      expect(attachedEl).toBe(child);
    });
  });
});
