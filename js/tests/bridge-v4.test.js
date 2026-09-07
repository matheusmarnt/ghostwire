import { describe, it, expect, vi } from 'vitest';
import { createV4Bridge } from '../src/bridge/v4.js';

function fakeMessage({ actions = [], isSkipped = false } = {}) {
  return {
    component: { id: 'c1' },
    getActions: () => actions,
    isSkipped: () => isSkipped,
  };
}

function fireMessage(message) {
  const captured = [];
  global.Livewire = {
    interceptMessage(cb) {
      cb({
        message,
        onSuccess: () => {}, onError: () => {}, onFailure: () => {},
        onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
      });
      return () => {};
    },
  };
  createV4Bridge().subscribe({ onStart: (ctx) => captured.push(ctx), onPostPaint: () => {}, onFinish: () => {} });
  return captured;
}

describe('bridge v4', () => {
  it('exposes name "v4"', () => {
    expect(createV4Bridge().name).toBe('v4');
  });

  it('calls onStart with component, action names, and isSync derived from an empty action list', () => {
    const captured = [];
    global.Livewire = {
      interceptMessage(cb) {
        const message = fakeMessage({ actions: [] });
        cb({
          message,
          onSuccess: () => {},
          onError: () => {},
          onFailure: () => {},
          onCancel: () => {},
          onSkipped: () => {},
          onFinish: () => {},
        });
        return () => {};
      },
    };
    const bridge = createV4Bridge();

    bridge.subscribe({
      onStart: (ctx) => captured.push(ctx),
      onPostPaint: () => {},
      onFinish: () => {},
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      component: { id: 'c1' },
      actionNames: [],
      isSync: true,
      isPoll: false,
      isRenderless: false,
    });
  });

  it('isSync is false when the message carries at least one action call', () => {
    const captured = [];
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ actions: [{ name: 'save' }] }),
          onSuccess: () => {}, onError: () => {}, onFailure: () => {},
          onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
        });
        return () => {};
      },
    };
    const bridge = createV4Bridge();

    bridge.subscribe({ onStart: (ctx) => captured.push(ctx), onPostPaint: () => {}, onFinish: () => {} });

    expect(captured[0].actionNames).toEqual(['save']);
    expect(captured[0].isSync).toBe(false);
  });

  it('isSync is true when every action is the magic $set property-sync action (SPEC-API-20)', () => {
    const captured = fireMessage(fakeMessage({ actions: [{ name: '$set' }] }));

    expect(captured[0].actionNames).toEqual(['$set']);
    expect(captured[0].isSync).toBe(true);
  });

  it('isSync is false when a real action is mixed in alongside $set', () => {
    const captured = fireMessage(fakeMessage({ actions: [{ name: '$set' }, { name: 'save' }] }));

    expect(captured[0].isSync).toBe(false);
  });

  it('isSync is true when every action is the magic $commit action (wire:model.live sync, SPEC-API-20)', () => {
    const captured = fireMessage(fakeMessage({ actions: [{ name: '$commit' }] }));

    expect(captured[0].actionNames).toEqual(['$commit']);
    expect(captured[0].isSync).toBe(true);
  });

  it('isSync is false when a real action is mixed in alongside $commit', () => {
    const captured = fireMessage(fakeMessage({ actions: [{ name: '$commit' }, { name: 'save' }] }));

    expect(captured[0].isSync).toBe(false);
  });

  it('reports isPoll true for a poll-originated message but still calls onStart (SPEC-API-21, native v4 metadata) — index.js decides silence now', () => {
    const onStart = vi.fn();
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ actions: [{ name: 'refresh', metadata: { type: 'poll' } }] }),
          onSuccess: () => {}, onError: () => {}, onFailure: () => {},
          onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].isPoll).toBe(true);
  });

  it('does not silence a message with a real action just because a poll-metadata action is also present', () => {
    const captured = fireMessage(fakeMessage({
      actions: [{ name: 'refresh', metadata: { type: 'poll' } }, { name: 'save', metadata: {} }],
    }));

    expect(captured).toHaveLength(1);
    expect(captured[0].isSync).toBe(false);
  });

  // SPEC-API-22: confirmed via grepping the installed livewire/livewire ^4.0
  // dist/livewire.esm.js — a `wire:click.renderless="method"` directive
  // modifier sets action.metadata.renderless = true client-side before the
  // request is even sent, so this case is knowable synchronously, same
  // timing as isPoll.
  it('reports isRenderless true at onStart when every action carries metadata.renderless (the .renderless directive modifier, known synchronously)', () => {
    const onStart = vi.fn();
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ actions: [{ name: 'save', metadata: { renderless: true } }] }),
          onSuccess: () => {}, onError: () => {}, onFailure: () => {},
          onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].isRenderless).toBe(true);
  });

  // SPEC-API-22: a #[Renderless]-attributed PHP method invoked via a *plain*
  // wire:click carries no client-side marker at all (confirmed by a real
  // capture, see the Task 6 report) — action.metadata is `{}`, same as any
  // ordinary action. The only reliable signal is the response shape: the
  // effects object never gets an "html" key (HandleComponents::render()
  // returns nothing once the server decided to skip rendering). That's only
  // knowable in onSuccess, after onStart already ran.
  it('reports isRenderless false at onStart (not yet knowable) and true by onFinish/onPostPaint when the response has no "html" effect (plain #[Renderless] PHP attribute, no directive modifier)', () => {
    // ctx is one shared, mutable object across onStart/onSuccess/onPostPaint/
    // onFinish -- capture its isRenderless value at the moment onStart fires
    // into a plain local (not the object reference) so a later mutation
    // can't retroactively change what this assertion saw.
    let isRenderlessAtStart = null;
    let onFinishCtx = null;
    let onPostPaintCtx = null;
    let capturedRenderCb;
    let capturedFinishCb;
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ actions: [{ name: 'renderlessBump', metadata: {} }] }),
          onSuccess: (successCb) => {
            successCb({ payload: { effects: { returns: [null] } }, onSync: () => {}, onMorph: () => {}, onRender: (fn) => { capturedRenderCb = fn; } });
          },
          onError: () => {}, onFailure: () => {}, onCancel: () => {}, onSkipped: () => {},
          onFinish: (fn) => { capturedFinishCb = fn; },
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({
      onStart: (ctx) => { isRenderlessAtStart = ctx.isRenderless; },
      onPostPaint: (ctx) => { onPostPaintCtx = ctx; },
      onFinish: (ctx) => { onFinishCtx = ctx; },
    });

    expect(isRenderlessAtStart).toBe(false);

    capturedRenderCb();
    capturedFinishCb();

    expect(onPostPaintCtx.isRenderless).toBe(true);
    expect(onFinishCtx.isRenderless).toBe(true);
  });

  it('reports isRenderless false when the response has an "html" effect (ordinary action)', () => {
    let onFinishCtx = null;
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ actions: [{ name: 'save', metadata: {} }] }),
          onSuccess: (successCb) => {
            successCb({ payload: { effects: { returns: [null], html: '<div></div>' } }, onSync: () => {}, onMorph: () => {}, onRender: () => {} });
          },
          onError: () => {}, onFailure: () => {}, onCancel: () => {}, onSkipped: () => {},
          onFinish: (fn) => fn(),
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: (ctx) => { onFinishCtx = ctx; } });

    expect(onFinishCtx.isRenderless).toBe(false);
  });

  it('skips onStart entirely when the message is already skipped (Tier C, SPEC-INT-06)', () => {
    const onStart = vi.fn();
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage({ isSkipped: true }),
          onSuccess: () => {}, onError: () => {}, onFailure: () => {},
          onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart, onPostPaint: () => {}, onFinish: () => {} });

    expect(onStart).not.toHaveBeenCalled();
  });

  it('wires onPostPaint through onSuccess -> onRender (post-paint removal timing, SPEC-INT-04)', () => {
    const onPostPaint = vi.fn();
    let capturedRenderCb;
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage(),
          onSuccess: (successCb) => {
            successCb({ payload: {}, onSync: () => {}, onMorph: () => {}, onRender: (fn) => { capturedRenderCb = fn; } });
          },
          onError: () => {}, onFailure: () => {}, onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart: () => {}, onPostPaint, onFinish: () => {} });

    capturedRenderCb();

    expect(onPostPaint).toHaveBeenCalledOnce();
  });

  it('wires onFinish for the error, failure, cancel, and finish paths individually (SPEC-INT-05)', () => {
    for (const hook of ['onError', 'onFailure', 'onCancel', 'onFinish']) {
      const onFinish = vi.fn();
      let capturedHookCb;
      global.Livewire = {
        interceptMessage(cb) {
          const registrars = {
            onSuccess: () => {}, onError: () => {}, onFailure: () => {},
            onCancel: () => {}, onSkipped: () => {}, onFinish: () => {},
          };
          registrars[hook] = (fn) => { capturedHookCb = fn; };
          cb({ message: fakeMessage(), ...registrars });
          return () => {};
        },
      };
      createV4Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish });

      capturedHookCb();

      expect(onFinish).toHaveBeenCalledOnce();
    }
  });

  // Regression test for M1 final review Fix 2: real Livewire internals call
  // the message's own invokeOnFinish() from within invokeOnCancel(),
  // invokeOnFailure(), and invokeOnError() (see
  // vendor/livewire/livewire/dist/livewire.esm.js, Message class, lines
  // ~12123-12151), which fires the onFinish interceptor callback in addition
  // to the terminal hook's own callback. The test above only ever fires ONE
  // registered callback per iteration, so it cannot catch a double-invocation
  // bug. This test fires TWO terminal callbacks for the SAME message, as
  // Livewire's real internals do, and asserts handlers.onFinish still runs
  // exactly once (single finalization point, actually enforced).
  it('calls handlers.onFinish exactly once when Livewire fires two terminal hooks for the same message (e.g. onError then onFinish, SPEC-INT-05)', () => {
    const onFinish = vi.fn();
    let capturedOnError;
    let capturedOnFinish;
    global.Livewire = {
      interceptMessage(cb) {
        cb({
          message: fakeMessage(),
          onSuccess: () => {},
          onError: (fn) => { capturedOnError = fn; },
          onFailure: () => {},
          onCancel: () => {},
          onSkipped: () => {},
          onFinish: (fn) => { capturedOnFinish = fn; },
        });
        return () => {};
      },
    };
    createV4Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish });

    // Mirrors Message.invokeOnError() calling this.invokeOnFinish() itself.
    capturedOnError();
    capturedOnFinish();

    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('subscribe returns the unsubscribe function from Livewire.interceptMessage', () => {
    const unsub = () => {};
    global.Livewire = { interceptMessage: () => unsub };

    const returned = createV4Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: () => {} });

    expect(returned).toBe(unsub);
  });
});
