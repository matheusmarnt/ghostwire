import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDebug, setDebugForTests } from '../src/debug.js';
import { parseAttributeConfig } from '../src/attributeConfig.js';

describe('developer warnings', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    setDebugForTests(false);
  });

  it('is off by default', () => {
    setDebugForTests(false);
    expect(isDebug()).toBe(false);
  });

  it('emits nothing for a malformed payload while debug is off', () => {
    setDebugForTests(false);
    const el = document.createElement('div');
    el.setAttribute('data-ghost', '{"m":"synthesize","zzz":1}');

    parseAttributeConfig(el);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits a warning for that same payload once debug is on', () => {
    setDebugForTests(true);
    const el = document.createElement('div');
    el.setAttribute('data-ghost', '{"m":"synthesize","zzz":1}');

    parseAttributeConfig(el);

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('[ghostwire]');
  });
});
