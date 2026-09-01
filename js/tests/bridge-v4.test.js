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
    expect(captured[0]).toEqual({ component: { id: 'c1' }, actionNames: [], isSync: true });
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

  it('skips onStart entirely for a poll-originated message (SPEC-API-21, native v4 metadata)', () => {
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

    expect(onStart).not.toHaveBeenCalled();
  });

  it('does not silence a message with a real action just because a poll-metadata action is also present', () => {
    const captured = fireMessage(fakeMessage({
      actions: [{ name: 'refresh', metadata: { type: 'poll' } }, { name: 'save', metadata: {} }],
    }));

    expect(captured).toHaveLength(1);
    expect(captured[0].isSync).toBe(false);
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

  it('wires onFinish for the error, failure, cancel, and finish paths (SPEC-INT-05, single finalization point)', () => {
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

  it('subscribe returns the unsubscribe function from Livewire.interceptMessage', () => {
    const unsub = () => {};
    global.Livewire = { interceptMessage: () => unsub };

    const returned = createV4Bridge().subscribe({ onStart: () => {}, onPostPaint: () => {}, onFinish: () => {} });

    expect(returned).toBe(unsub);
  });
});
