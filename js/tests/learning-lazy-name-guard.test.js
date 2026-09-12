import { describe, it, expect, vi, afterEach } from 'vitest';

// Isolated in its own file: createLearningStore must be mocked to intercept
// the exact instance boot() constructs internally, and vi.mock is
// file-scoped and hoisted — co-locating this with learning-lazy.test.js's
// real-store tests would silently replace their real import too (same
// reasoning as learning-persist-warning.test.js mocking the synthesizer).
//
// Finding 2: learningStore.get() already returns null for a name that fails
// the charset (store.js's `c` index lookup simply misses), so asserting
// "nothing was painted" can't tell that apart from "the LAZY_NAME_PATTERN
// guard in index.js did its job" — deleting the guard leaves every other
// test in this suite green. This is the one test that actually observes the
// guard: get is a spy, and the assertion is that it is never consulted at
// all for a charset-invalid data-ghost-lazy value.
const getSpy = vi.fn(() => null);

vi.mock('../src/learning/store.js', () => ({
  createLearningStore: () => ({ get: getSpy, put: () => false, all: () => ({ v: 1, e: {}, c: {} }), clear: () => {} }),
  MAX_BONES: 300,
}));

import { boot } from '../src/index.js';

function fakeLivewire() {
  return { interceptMessage: () => () => {}, hook: () => {}, directive: () => {} };
}

describe('paintLazyPlaceholders name-charset guard (Finding 2)', () => {
  afterEach(() => {
    delete window.Livewire;
    delete window.Ghostwire;
    document.body.innerHTML = '';
    getSpy.mockClear();
  });

  // F9 (final review): this test's only assertion was that get() was never called,
  // which "the guard skipped the bad name" and "paintLazyPlaceholders is dead code"
  // cannot be told apart. Adding a valid-name element in the same execution and
  // asserting get() WAS called, exactly once, for it — not for the invalid one — is
  // the positive control that discriminates the two (same shape as learning-lazy.test.js's
  // own control-painted tests).
  it('never consults the store for a data-ghost-lazy value that fails the component-name charset, but does for a valid one', () => {
    window.Livewire = fakeLivewire();
    const invalid = document.createElement('div');
    invalid.setAttribute('data-ghost-lazy', '<script>alert(1)</script>');
    document.body.appendChild(invalid);

    const valid = document.createElement('div');
    valid.setAttribute('data-ghost-lazy', 'orders-table');
    document.body.appendChild(valid);

    boot();

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls[0][0]).toBe('orders-table');
  });
});
