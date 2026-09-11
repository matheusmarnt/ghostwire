import { describe, it, expect, vi } from 'vitest';
import { parseAttributeConfig } from '../src/attributeConfig.js';

function elWithDataGhost(json) {
  const el = document.createElement('div');
  if (json !== undefined) el.setAttribute('data-ghost', json);
  return el;
}

describe('parseAttributeConfig', () => {
  it('returns null when data-ghost is absent (SPEC-API-32)', () => {
    expect(parseAttributeConfig(elWithDataGhost(undefined))).toBeNull();
  });

  it('parses a minimal payload, filling omitted keys with package defaults', () => {
    const config = parseAttributeConfig(elWithDataGhost('{"m":"synthesize"}'));
    expect(config).toEqual({
      mode: 'synthesize', only: null, except: null,
      delay: 120, hold: 300, rows: null, poll: false, sync: false, lazy: false,
      learning: false, name: null,
    });
  });

  it('maps every compact key to its field name', () => {
    const config = parseAttributeConfig(elWithDataGhost('{"m":"freeze","o":["a"],"d":200,"h":400,"r":5,"p":true,"s":true,"l":true,"g":true,"n":"orders-table"}'));
    expect(config).toMatchObject({ mode: 'freeze', only: ['a'], delay: 200, hold: 400, rows: 5, poll: true, sync: true, lazy: true, learning: true, name: 'orders-table' });
  });

  it('discards the whole payload on invalid JSON (SPEC-SEC-02)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseAttributeConfig(elWithDataGhost('not json'))).toBeNull();
    warn.mockRestore();
  });

  it('discards the whole payload on an unknown key (closed schema, SPEC-SEC-02)', () => {
    expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","z":1}'))).toBeNull();
  });

  it('discards the whole payload on a wrong-typed known key (SPEC-SEC-02)', () => {
    expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","d":"not-a-number"}'))).toBeNull();
  });

  it('clamps delay and hold to 0-60000ms (SPEC-SEC-03)', () => {
    expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","d":-5,"h":999999}'))).toMatchObject({ delay: 0, hold: 60000 });
  });

  it('clamps rows to 0-1000 (SPEC-SEC-03)', () => {
    expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","r":5000}'))).toMatchObject({ rows: 1000 });
  });

  it('discards action names in only/except over 64 chars or with invalid characters (SPEC-SEC-03)', () => {
    const tooLong = 'a'.repeat(65);
    const config = parseAttributeConfig(elWithDataGhost(`{"m":"synthesize","o":["${tooLong}","valid_Name1","bad-name"]}`));
    expect(config.only).toEqual(['valid_Name1']);
  });

  describe('"a" (method-level action overrides, SPEC-API-10)', () => {
    it('parses a valid "a" payload into config.actionOverrides with full field names and correct clamping', () => {
      const config = parseAttributeConfig(elWithDataGhost(
        '{"m":"synthesize","a":{"increment":{"m":"freeze","d":-5,"h":999999,"r":5000,"p":true,"s":true,"l":true}}}'
      ));
      expect(config.actionOverrides).toEqual({
        increment: { mode: 'freeze', delay: 0, hold: 60000, rows: 1000, poll: true, sync: true, lazy: true },
      });
    });

    it('discards the whole payload when an action entry has an unknown key (SPEC-SEC-02)', () => {
      expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","a":{"increment":{"z":1}}}'))).toBeNull();
    });

    it('discards the whole payload when "a" has an invalid action name (SPEC-SEC-02)', () => {
      expect(parseAttributeConfig(elWithDataGhost('{"m":"synthesize","a":{"bad-name!":{"m":"freeze"}}}'))).toBeNull();
    });

    it('leaves config.actionOverrides falsy when "a" is absent', () => {
      const config = parseAttributeConfig(elWithDataGhost('{"m":"synthesize"}'));
      expect(config.actionOverrides).toBeFalsy();
    });
  });
});
