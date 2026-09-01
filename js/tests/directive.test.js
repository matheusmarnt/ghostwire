import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { boot } from '../src/index.js';

describe('directive registration and modifier parsing', () => {
  let registeredCallback;

  beforeEach(() => {
    document.body.innerHTML = '';
    registeredCallback = null;
    window.Livewire = {
      interceptMessage: () => () => {},
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
});
