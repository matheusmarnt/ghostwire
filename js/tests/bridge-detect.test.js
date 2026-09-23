import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectBridge } from '../src/bridge/index.js';
import { setDebugForTests } from '../src/debug.js';

describe('detectBridge', () => {
  afterEach(() => {
    delete window.Livewire;
    setDebugForTests(false);
  });

  it('picks v4 when Livewire.interceptMessage is a function', () => {
    window.Livewire = { interceptMessage: () => {}, hook: () => {} };
    expect(detectBridge().name).toBe('v4');
  });

  it('picks v3 when only Livewire.hook is a function', () => {
    window.Livewire = { hook: () => {} };
    expect(detectBridge().name).toBe('v3');
  });

  it('returns null and warns when neither is present', () => {
    window.Livewire = {};
    setDebugForTests(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = detectBridge();
    expect(result.name).toBeNull();
    expect(result.bridge).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
