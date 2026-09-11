import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolated in its own file: createSynthesizer must be mocked to capture the
// onSynthesized callback boot() constructs, and vi.mock is file-scoped and
// hoisted — co-locating this with learning-wiring.test.js's real-synthesizer
// tests would silently replace their real import too. learning/store.js is
// deliberately left unmocked: put()'s over-cap rejection below is real
// (Task 2's own MAX_BONES validation), not simulated.
vi.mock('../src/synthesizer/index.js', () => {
  const captured = { onSynthesized: null };
  return {
    createSynthesizer: (registry, defaults, onResize, now, onSynthesized) => {
      captured.onSynthesized = onSynthesized;
      return { synthesize: () => null, forget: () => {} };
    },
    __captured: captured,
  };
});

import { boot } from '../src/index.js';
import { __captured } from '../src/synthesizer/index.js';
import { MAX_BONES } from '../src/learning/store.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

// Finding 2: put() fails silently by design (SPEC-SEC-04) — this exercises the
// call site's own responsibility to surface that failure to a developer.
describe('learning persist-failure warning (Finding 2)', () => {
  beforeEach(() => {
    window.Livewire = { interceptMessage: () => () => {}, hook: () => {}, directive: () => {} };
    vi.stubGlobal('localStorage', fakeStorage());
  });

  afterEach(() => {
    delete window.Livewire;
    delete window.Ghostwire;
    vi.unstubAllGlobals();
  });

  it('warns with the component name, the real bone count, and the cap when put() rejects an over-cap tree', () => {
    boot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const host = { config: { learning: true, name: 'huge-table' } };
    const oversized = Array.from({ length: MAX_BONES + 1 }, (_, i) => ({ type: 'text', x: i, y: 0, width: 10, height: 10 }));

    __captured.onSynthesized(host, 123, oversized, { width: 200, height: 100 });

    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0];
    expect(message).toContain('huge-table');
    expect(message).toContain(String(MAX_BONES + 1));
    expect(message).toContain(String(MAX_BONES));

    warn.mockRestore();
  });

  it('does not warn when put() succeeds', () => {
    boot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const host = { config: { learning: true, name: 'small-table' } };
    const small = [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }];

    __captured.onSynthesized(host, 123, small, { width: 200, height: 100 });

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('does not call put() at all when the host opted out of learning', () => {
    boot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const host = { config: { learning: false, name: null } };
    __captured.onSynthesized(host, 123, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }], { width: 200, height: 100 });

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
