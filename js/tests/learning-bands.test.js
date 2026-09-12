import { describe, it, expect } from 'vitest';
import { BAND_NAMES, bandFor } from '../src/learning/bands.js';

describe('viewport bands', () => {
  it('freezes the band vocabulary', () => {
    expect(BAND_NAMES).toEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl']);
  });

  it('maps widths to bands at the documented thresholds', () => {
    expect(bandFor(0)).toBe('xs');
    expect(bandFor(639)).toBe('xs');
    expect(bandFor(640)).toBe('sm');
    expect(bandFor(767)).toBe('sm');
    expect(bandFor(768)).toBe('md');
    expect(bandFor(1023)).toBe('md');
    expect(bandFor(1024)).toBe('lg');
    expect(bandFor(1279)).toBe('lg');
    expect(bandFor(1280)).toBe('xl');
    expect(bandFor(1535)).toBe('xl');
    expect(bandFor(1536)).toBe('2xl');
    expect(bandFor(9999)).toBe('2xl');
  });

  it('falls back to xs for nonsense widths instead of throwing', () => {
    expect(bandFor(NaN)).toBe('xs');
    expect(bandFor(-100)).toBe('xs');
    expect(bandFor(undefined)).toBe('xs');
  });
});
