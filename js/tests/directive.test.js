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

// Spies on the two renderer/synthesizer entry points island regions are wired
// into, so the .island tests below can assert on the exact arguments each
// received. What these tests own is the region PLUMBING; the walk/measure/emit
// pipeline behind synthesize() has its own tests, and is not re-proven here.
vi.mock('../src/synthesizer/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  const instances = [];
  return {
    createSynthesizer: (...args) => {
      const real = actual.createSynthesizer(...args);
      const spied = {
        ...real,
        synthesize: vi.fn(real.synthesize),
      };
      instances.push(spied);
      return spied;
    },
    __instances: instances,
  };
});

vi.mock('../src/renderer.js', async (importOriginal) => {
  const actual = await importOriginal();
  const instances = [];
  return {
    createRenderer: (...args) => {
      const real = actual.createRenderer(...args);
      const spied = {
        ...real,
        mountLayer: vi.fn(real.mountLayer),
        measureHostRect: vi.fn(real.measureHostRect),
      };
      instances.push(spied);
      return spied;
    },
    __instances: instances,
  };
});

// SPEC-INT-22: `.island` is a permanent no-op on the v3 bridge, and the only
// thing enforcing that is boot()'s `bridgeName !== 'v4'` check. Wrapping
// detectBridge() lets one test below override just the NAME while keeping the
// real bridge object, so it exercises that check and nothing else. Default
// behavior is the real detectBridge(), so every other test is unaffected.
vi.mock('../src/bridge/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    detectBridge: vi.fn(actual.detectBridge),
    __realDetectBridge: actual.detectBridge,
  };
});

import { boot } from '../src/index.js';
import { detectBridge, __realDetectBridge } from '../src/bridge/index.js';
import { __instances as schedulerInstances } from '../src/scheduler.js';
import { __instances as registryInstances } from '../src/registry.js';
import { __instances as synthesizerInstances } from '../src/synthesizer/index.js';
import { __instances as rendererInstances } from '../src/renderer.js';

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

    // Fix-round regression (final whole-branch review, Critical): this
    // codebase does NOT guarantee single-flight messages per host --
    // scheduler.js's host.pending counter exists precisely because a
    // genuinely concurrent, non-skipped message on the same host is a
    // real, already-handled case. The original applyActionOverride()
    // stored the true base directly on host._gwBaseConfig, a single slot
    // -- a second, overlapping message on the same host would overwrite
    // it before the first message's onFinish restored from it, leaving
    // nothing correct to restore (permanently fatal if the clobbered
    // override was mode:'off'). The base must be recorded per-message (on
    // ctx, not on host), guarded so only one message's override is active
    // on a host at a time.
    it('does not let a second overlapping message on the same host clobber the first message\'s override, and restores correctly regardless of finish order', () => {
      boot();
      const el = document.createElement('div');
      el.setAttribute('data-ghost', '{"a":{"actionA":{"m":"freeze"},"actionB":{"m":"off"}}}');
      document.body.appendChild(el);
      registeredCallback({
        el,
        directive: { modifiers: [], expression: '' },
        component: { id: 'c1', el },
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const host = [...registry.hostsFor('c1')][0];
      const baseMode = host.config.mode;
      expect(baseMode).toBe('synthesize');

      // Message A starts first, targeting actionA -> freeze.
      let finishA;
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'actionA' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: (cb) => { finishA = cb; },
      });
      expect(host.config.mode).toBe('freeze');

      // Message B starts on the SAME host before A finishes, targeting
      // actionB -> off. B's override must NOT apply while A's is active
      // (host._gwOverrideActive guard) -- it must not clobber A's saved
      // base, and it must not even touch host.config.
      let finishB;
      interceptedCallback({
        message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'actionB' }] },
        onSuccess: () => {},
        onError: () => {},
        onFailure: () => {},
        onCancel: () => {},
        onFinish: (cb) => { finishB = cb; },
      });
      expect(host.config.mode).toBe('freeze'); // still A's override, B's did not apply

      // B finishes first -- B never recorded a base for this host (its
      // override was skipped by the guard), so this must be a no-op for
      // host.config.
      finishB();
      expect(host.config.mode).toBe('freeze');

      // A finishes -- must restore the TRUE original base, not something
      // corrupted by B, regardless of B having finished first.
      finishA();
      expect(host.config.mode).toBe(baseMode);
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

  describe('.island scoping into the show/reposition lifecycle (SPEC-INT-13)', () => {
    function appendMarker(parent, kind, meta) {
      parent.appendChild(document.createComment(`[if ${kind}:${meta}]><![endif]`));
    }

    // Places `el` (the wire:ghost host) as a direct sibling BETWEEN a
    // FRAGMENT/ENDFRAGMENT comment pair, inside a wrapper appended to
    // document.body. This is the structure closestIslandRange() actually
    // looks for — it walks OUTWARD from el's own preceding siblings (and
    // then each ancestor's), never into el's children (confirmed against
    // islands.test.js's own fixtures) — so the markers must enclose el from
    // outside, not live inside it.
    function wrapInIsland(el) {
      const meta = 'type=island|name=t|token=t1|mode=morph';
      const wrapper = document.createElement('div');
      appendMarker(wrapper, 'FRAGMENT', meta);
      const start = wrapper.lastChild;
      wrapper.appendChild(el);
      appendMarker(wrapper, 'ENDFRAGMENT', meta);
      const end = wrapper.lastChild;
      document.body.appendChild(wrapper);
      return { start, end };
    }

    it('sets config.island = true for the .island modifier (SPEC-INT-13)', () => {
      boot();
      const el = document.createElement('div');
      document.body.appendChild(el);
      const component = { id: 'c1', el };
      registeredCallback({
        el,
        directive: { modifiers: ['island'], expression: '' },
        component,
        cleanup: () => {},
      });

      const registry = registryInstances.at(-1);
      const host = registry.hostFor(el);

      expect(host.config.island).toBe(true);
    });

    // De-wiring check: with the region plumbing removed (call sites reverted
    // to synthesize(host)/mountLayer(host), no region argument at all), both
    // assertions below fail — synthesize is recorded with only ONE argument
    // (never matching a 2-arg toHaveBeenCalledWith), and mountLayer receives
    // no rect at all rather than the island's. Confirmed empirically by
    // temporarily reverting index.js's three call sites and re-running this
    // file: this test and the two below it failed for exactly that reason,
    // while every other test (including the config.island one above) still
    // passed.
    it('scopes the show path to the enclosing island: synthesize() gets the region, mountLayer() gets its rect, not the whole host (SPEC-INT-13)', () => {
      vi.useFakeTimers();
      const origRangeRect = Range.prototype.getBoundingClientRect;
      try {
        boot();
        const el = document.createElement('div');
        const { start, end } = wrapInIsland(el);

        const islandRect = { top: 5, left: 5, right: 85, bottom: 25, width: 80, height: 20 };
        Range.prototype.getBoundingClientRect = () => islandRect;

        const component = { id: 'c1', el };
        registeredCallback({
          el,
          directive: { modifiers: ['island'], expression: '' },
          component,
          cleanup: () => {},
        });

        const registry = registryInstances.at(-1);
        const host = registry.hostFor(el);
        const synthesizer = synthesizerInstances.at(-1);
        const renderer = rendererInstances.at(-1);
        // The walk/measure/emit pipeline has its own tests — stub a fixed,
        // valid Bone Tree so this test's only concern is the region plumbing.
        synthesizer.synthesize.mockReturnValue([{ type: 'text', x: 0, y: 0, width: 50, height: 10 }]);

        interceptedCallback({
          message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
          onSuccess: () => {},
          onError: () => {},
          onFailure: () => {},
          onCancel: () => {},
          onFinish: () => {},
        });
        vi.advanceTimersByTime(120); // scheduler's default delay -> the real onShow fires

        // The shape distinction: synthesize() gets the whole region object...
        expect(synthesizer.synthesize).toHaveBeenCalledWith(host, { startNode: start, endNode: end, rect: islandRect });
        // ...mountLayer() gets only its bare rect.
        expect(renderer.mountLayer).toHaveBeenCalledWith(host, islandRect);
      } finally {
        // Both restores live in ONE finally spanning the whole test body
        // (not just the interceptedCallback call), so a throw anywhere above
        // — not only inside interceptedCallback — still restores the Range
        // patch. vi.useRealTimers() also discards the host's still-pending
        // fake timeoutTimer (scheduler.js's 15s hard cap, never reached in
        // this test): a fake timer never fired by real-time advancement is
        // simply dropped on uninstall, never converted into a real one, so
        // nothing here can fire later against a since-restored Range patch
        // (see the sibling onPostPaint test below for the real-timer version
        // of this leak, and its fix).
        Range.prototype.getBoundingClientRect = origRangeRect;
        vi.useRealTimers();
      }
    });

    it('scopes the onPostPaint reposition read to the enclosing island too (SPEC-INT-13)', () => {
      // Fake timers here too, and not incidentally: onStart's
      // scheduler.messageStart() arms a real ~120ms delayTimer regardless of
      // whether this test ever cares about the show itself. Without fake
      // timers, that delayTimer survives past this test's own teardown and
      // fires for real later — invoking the genuine onShow -> regionForHost
      // -> domRange.getBoundingClientRect() with THIS test's Range patch
      // already restored (and jsdom's Range has no native
      // getBoundingClientRect of its own), crashing as an uncaught exception
      // in whatever test happens to be running (or none) when it fires.
      // vi.useRealTimers() in the finally below discards that still-pending
      // fake timer outright rather than letting it become a real one.
      vi.useFakeTimers();
      const origRangeRect = Range.prototype.getBoundingClientRect;
      try {
        boot();
        const el = document.createElement('div');
        wrapInIsland(el);

        const islandRect = { top: 5, left: 5, right: 85, bottom: 25, width: 80, height: 20 };
        Range.prototype.getBoundingClientRect = () => islandRect;

        const component = { id: 'c1', el };
        registeredCallback({
          el,
          directive: { modifiers: ['island'], expression: '' },
          component,
          cleanup: () => {},
        });

        const registry = registryInstances.at(-1);
        const host = registry.hostFor(el);
        const renderer = rendererInstances.at(-1);

        // onSuccess -> onRender fires onPostPaint synchronously (mirrors the
        // "method-level #[Ghost] override" tests above) — no timer advance
        // needed since onPostPaint doesn't depend on the show delay; fake
        // timers are only here to make the delayTimer armed by onStart inert
        // (see comment above).
        interceptedCallback({
          message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
          onSuccess: (cb) => cb({ payload: { effects: { html: '<div></div>' } }, onRender: (fn) => fn() }),
          onError: () => {},
          onFailure: () => {},
          onCancel: () => {},
          onFinish: () => {},
        });

        expect(renderer.measureHostRect).toHaveBeenCalledWith(host, islandRect);
      } finally {
        Range.prototype.getBoundingClientRect = origRangeRect;
        vi.useRealTimers();
      }
    });

    it('falls back to the whole-host skeleton when .island is set but no enclosing island exists (SPEC-INT-13 SHOULD, not MUST — must never throw)', () => {
      vi.useFakeTimers();
      try {
        boot();
        const el = document.createElement('div');
        el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 50, width: 200, height: 50 });
        document.body.appendChild(el); // no FRAGMENT/ENDFRAGMENT markers anywhere

        const component = { id: 'c1', el };
        registeredCallback({
          el,
          directive: { modifiers: ['island'], expression: '' },
          component,
          cleanup: () => {},
        });

        const registry = registryInstances.at(-1);
        const host = registry.hostFor(el);
        const synthesizer = synthesizerInstances.at(-1);
        synthesizer.synthesize.mockReturnValue([{ type: 'text', x: 0, y: 0, width: 50, height: 10 }]);

        expect(() => {
          interceptedCallback({
            message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
            onSuccess: () => {},
            onError: () => {},
            onFailure: () => {},
            onCancel: () => {},
            onFinish: () => {},
          });
          vi.advanceTimersByTime(120);
        }).not.toThrow();

        // regionForHost() resolved cleanly to null (no enclosing island) and
        // that null reached synthesize() unchanged — exactly pre-M9 behavior.
        expect(synthesizer.synthesize).toHaveBeenCalledWith(host, null);
        expect(host.layer).not.toBeNull();
        expect(host.layer.style.top).toBe('0px'); // fell back to host.el's own rect
      } finally {
        vi.useRealTimers();
      }
    });

    // SPEC-INT-22 regression guard. `.island` is a documented no-op on the v3
    // bridge, permanently, and boot()'s `bridgeName !== 'v4'` check is the only
    // thing enforcing it. That expression is reachable-wrong in both
    // directions: comparing the wrong value against 'v4' disables scoping
    // everywhere (a silent no-op on v4 too), and dropping the check enables a
    // walk Livewire 3 can never satisfy. The v4 tests above cover the first
    // direction; this one covers the second — delete the check and it fails.
    it('is a documented no-op on the v3 bridge: .island never resolves a region there (SPEC-INT-22)', () => {
      vi.useFakeTimers();
      const origRangeRect = Range.prototype.getBoundingClientRect;
      try {
        // The real bridge object (window.Livewire.interceptMessage is what
        // drives this test either way), reported under the v3 name — the name
        // string is the single thing under test here.
        detectBridge.mockImplementationOnce(() => ({ ...__realDetectBridge(), name: 'v3' }));
        boot();

        const el = document.createElement('div');
        el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 50, width: 200, height: 50 });
        wrapInIsland(el); // a genuine, resolvable island really does enclose the host

        // Never reached while the check holds (regionForHost() returns before
        // building a Range). Patched anyway so that a regression fails on the
        // assertions below rather than throwing — jsdom's Range has no
        // getBoundingClientRect of its own.
        Range.prototype.getBoundingClientRect = () => ({ top: 5, left: 5, right: 85, bottom: 25, width: 80, height: 20 });

        registeredCallback({
          el,
          directive: { modifiers: ['island'], expression: '' },
          component: { id: 'c1', el },
          cleanup: () => {},
        });

        const registry = registryInstances.at(-1);
        const host = registry.hostFor(el);
        const synthesizer = synthesizerInstances.at(-1);
        synthesizer.synthesize.mockReturnValue([{ type: 'text', x: 0, y: 0, width: 50, height: 10 }]);

        interceptedCallback({
          message: { isSkipped: () => false, component: { id: 'c1' }, getActions: () => [{ name: 'save' }] },
          onSuccess: () => {},
          onError: () => {},
          onFailure: () => {},
          onCancel: () => {},
          onFinish: () => {},
        });
        vi.advanceTimersByTime(120);

        expect(host.config.island).toBe(true); // the modifier still parses...
        expect(synthesizer.synthesize).toHaveBeenCalledWith(host, null); // ...and still resolves to nothing
        expect(host.layer.style.top).toBe('0px'); // whole-host rect, not the island's 5px top
      } finally {
        Range.prototype.getBoundingClientRect = origRangeRect;
        vi.useRealTimers();
      }
    });
  });
});
