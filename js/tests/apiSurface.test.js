// js/tests/apiSurface.test.js
//
// SPEC-API-50: freezes the wire:ghost directive's modifier vocabulary and
// the data-ghost compact-key map. Both live as unexported constants inside
// js/src/index.js and js/src/attributeConfig.js, so this test reads the
// source text directly rather than importing private internals.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('API surface freeze', () => {
  it('freezes the wire:ghost modifier vocabulary', () => {
    const src = readFileSync(path.join(dir, '../src/index.js'), 'utf8');
    const modifiers = [...src.matchAll(/modifier === '([a-z]+)'/g)].map((m) => m[1]);
    expect(modifiers.sort()).toEqual(['freeze', 'ignore', 'island', 'keep', 'off'].sort());

    // delay.<N>ms / hold.<N>ms / rows.<N> are pattern-matched, not literal —
    // assert the patterns themselves are still present, unchanged.
    expect(src).toContain("TIMED_MODIFIER_PATTERN = /^(delay|hold)\\.(\\d+)ms$/");
    expect(src).toContain("modifier.startsWith('rows.')");
  });

  it('freezes the data-ghost compact-key map', () => {
    const src = readFileSync(path.join(dir, '../src/attributeConfig.js'), 'utf8');
    const match = src.match(/KEY_MAP = \{([^}]+)\}/);
    expect(match).not.toBeNull();
    const pairs = match[1].split(',').map((s) => s.trim()).sort();
    expect(pairs).toEqual([
      'd: \'delay\'', 'h: \'hold\'', 'l: \'lazy\'', 'm: \'mode\'', 'o: \'only\'',
      'p: \'poll\'', 'r: \'rows\'', 's: \'sync\'', 'x: \'except\'',
    ].sort());
  });
});
