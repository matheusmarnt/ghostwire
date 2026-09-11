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

  it('never consults the store for a data-ghost-lazy value that fails the component-name charset', () => {
    window.Livewire = fakeLivewire();
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-ghost-lazy', '<script>alert(1)</script>');
    document.body.appendChild(placeholder);

    boot();

    expect(getSpy).not.toHaveBeenCalled();
  });
});
