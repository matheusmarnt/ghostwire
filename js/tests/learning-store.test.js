import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLearningStore, STORAGE_KEY, SCHEMA_VERSION, BONE_TYPES } from '../src/learning/store.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

function fakeStorage(initial = null) {
  let raw = initial;
  return {
    getItem: () => raw,
    setItem: (_key, value) => { raw = value; },
    removeItem: () => { raw = null; },
    seed: (value) => { raw = value; },
    get raw() { return raw; },
  };
}

const TREE = [{ type: 'text', x: 12, y: 8, width: 240, height: 14 }];

describe('learning store', () => {
  let storage;
  let store;

  beforeEach(() => {
    storage = fakeStorage();
    store = createLearningStore({ storage, quotaBytes: 256 * 1024, now: () => 1000 });
  });

  it('round-trips a learned tree by component and band (SPEC-LRN-01)', () => {
    expect(store.put('orders-table', 3141592653, 'lg', { width: 960, height: 320 }, TREE)).toBe(true);

    expect(store.get('orders-table', 'lg')).toEqual({ width: 960, height: 320, bones: TREE });
  });

  it('indexes entries by signature and band, with a component pointer (SPEC-LRN-01)', () => {
    store.put('orders-table', 3141592653, 'lg', { width: 960, height: 320 }, TREE);

    const envelope = JSON.parse(storage.raw);
    expect(envelope.v).toBe(SCHEMA_VERSION);
    expect(Object.keys(envelope.e)).toEqual(['3141592653|lg']);
    expect(envelope.c['orders-table|lg']).toBe('3141592653');
  });

  it('returns null for an unknown component or band', () => {
    store.put('orders-table', 1, 'lg', { width: 10, height: 10 }, TREE);

    expect(store.get('orders-table', 'sm')).toBeNull();
    expect(store.get('other-table', 'lg')).toBeNull();
  });

  it('discards the whole store on a schema version mismatch (SPEC-SEC-04)', () => {
    storage.seed(JSON.stringify({ v: 999, e: { '1|lg': { t: 1, n: 'x', w: 1, h: 1, b: TREE } }, c: { 'x|lg': '1' } }));

    expect(store.get('x', 'lg')).toBeNull();
  });

  it('discards unparseable JSON silently (SPEC-SEC-04)', () => {
    storage.seed('}{ not json');

    expect(() => store.get('x', 'lg')).not.toThrow();
    expect(store.get('x', 'lg')).toBeNull();
  });

  it('drops only the corrupt entry, keeping valid siblings (SPEC-SEC-04)', () => {
    storage.seed(JSON.stringify({
      v: SCHEMA_VERSION,
      e: {
        '1|lg': { t: 1, n: 'good-one', w: 100, h: 50, b: TREE },
        '2|lg': { t: 1, n: 'bad-one', w: 100, h: 50, b: [{ type: 'text', x: 'NOPE', y: 0, width: 1, height: 1 }] },
      },
      c: { 'good-one|lg': '1', 'bad-one|lg': '2' },
    }));

    expect(store.get('good-one', 'lg')).not.toBeNull();
    expect(store.get('bad-one', 'lg')).toBeNull();
  });

  it('rejects a bone carrying an unknown type (SPEC-SEC-04)', () => {
    expect(store.put('x', 1, 'lg', { width: 10, height: 10 }, [{ type: 'script', x: 0, y: 0, width: 1, height: 1 }])).toBe(false);
  });

  it('rejects a bone carrying extra keys, so nothing smuggled survives (SPEC-SEC-04)', () => {
    expect(store.put('x', 1, 'lg', { width: 10, height: 10 }, [{ type: 'text', x: 0, y: 0, width: 1, height: 1, onclick: 'alert(1)' }])).toBe(false);
  });

  it('rejects a component name outside the allowed charset (SPEC-SEC-04)', () => {
    expect(store.put('<img src=x>', 1, 'lg', { width: 10, height: 10 }, TREE)).toBe(false);
  });

  it('clamps geometry read back out of the store (SPEC-SEC-04)', () => {
    storage.seed(JSON.stringify({
      v: SCHEMA_VERSION,
      e: { '1|lg': { t: 1, n: 'clampy', w: 1e9, h: 0, b: [{ type: 'text', x: -1e9, y: 0, width: 1e9, height: 0 }] } },
      c: { 'clampy|lg': '1' },
    }));

    const entry = store.get('clampy', 'lg');

    expect(entry.width).toBe(20000);
    expect(entry.bones[0].x).toBe(-20000);
    expect(entry.bones[0].width).toBe(20000);
  });

  // Ruling B: the brief's fixed `quotaBytes: 400` never trips — three of these
  // entries serialize to ~330 bytes together, so nothing is ever evicted and
  // the assertions below would fail against that literal. Calibrate instead:
  // measure one real entry's serialized footprint on a throwaway store, then
  // size the quota just above it so a second entry always forces an eviction.
  // The scenario and assertions (LRU order, that eviction happens, that the
  // survivor set is right) are otherwise unchanged from the brief's intent.
  it('evicts least-recently-used entries when over quota (SPEC-SEC-04)', () => {
    const probeStorage = fakeStorage();
    createLearningStore({ storage: probeStorage, now: () => 1000 })
      .put('first', 1, 'lg', { width: 10, height: 10 }, TREE);
    const quotaBytes = probeStorage.raw.length + 50; // room for exactly one entry, not two

    let clock = 1000;
    const tiny = createLearningStore({ storage, quotaBytes, now: () => clock });

    tiny.put('first', 1, 'lg', { width: 10, height: 10 }, TREE);
    clock = 2000;
    tiny.put('second', 2, 'lg', { width: 10, height: 10 }, TREE);
    clock = 3000;
    tiny.put('third', 3, 'lg', { width: 10, height: 10 }, TREE);

    expect(storage.raw.length).toBeLessThanOrEqual(quotaBytes);
    expect(tiny.get('third', 'lg')).not.toBeNull();
    expect(tiny.get('second', 'lg')).toBeNull();
    expect(tiny.get('first', 'lg')).toBeNull();
  });

  // Finding 3: this test's name promises "so a hot entry survives eviction",
  // but nothing here ever evicted anything, and the quota test above holds
  // only one entry - {third} is the survivor under LRU *and* under plain
  // insertion-order (FIFO) eviction, so LRU was never actually distinguished
  // from "evict whatever was put first". This version is the one scenario
  // where the two diverge: `hot` is put before `cold` but read again
  // afterwards, so correct LRU keeps `hot` and drops `cold` - the reverse of
  // what insertion-order eviction would do.
  it('refreshes the LRU timestamp on read so a hot entry survives eviction', () => {
    const probeStorage = fakeStorage();
    const probe = createLearningStore({ storage: probeStorage, now: () => 1000 });
    probe.put('hot', 1, 'lg', { width: 10, height: 10 }, TREE);
    probe.put('cold', 2, 'lg', { width: 10, height: 10 }, TREE);
    const quotaBytes = probeStorage.raw.length + 50; // room for two entries, not three

    let clock = 1000;
    const s = createLearningStore({ storage, quotaBytes, now: () => clock });

    s.put('hot', 1, 'lg', { width: 10, height: 10 }, TREE);
    clock = 2000;
    s.put('cold', 2, 'lg', { width: 10, height: 10 }, TREE);
    clock = 3000;
    s.get('hot', 'lg'); // touch hot - cold, not hot, is now the coldest entry
    expect(JSON.parse(storage.raw).e['1|lg'].t).toBe(3000);

    clock = 4000;
    s.put('fresh', 3, 'lg', { width: 10, height: 10 }, TREE); // now over quota: forces exactly one eviction

    expect(s.get('hot', 'lg')).not.toBeNull(); // survives: touched more recently than cold
    expect(s.get('cold', 'lg')).toBeNull(); // evicted: least-recently-used, despite being newer than hot by insertion order
    expect(s.get('fresh', 'lg')).not.toBeNull();
  });

  it('replaces a component-and-band entry rather than accumulating stale signatures', () => {
    store.put('orders-table', 111, 'lg', { width: 10, height: 10 }, TREE);
    store.put('orders-table', 222, 'lg', { width: 10, height: 10 }, TREE);

    expect(Object.keys(JSON.parse(storage.raw).e)).toEqual(['222|lg']);
  });

  it('survives a storage that throws on every access (private mode)', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    const s = createLearningStore({ storage: hostile, quotaBytes: 1024, now: () => 1 });

    expect(() => s.get('x', 'lg')).not.toThrow();
    expect(s.get('x', 'lg')).toBeNull();
    expect(s.put('x', 1, 'lg', { width: 1, height: 1 }, TREE)).toBe(false);
  });

  it('exposes the whole validated envelope for export (SPEC-LRN-03)', () => {
    store.put('orders-table', 7, 'lg', { width: 960, height: 320 }, TREE);

    const all = store.all();
    expect(all.v).toBe(SCHEMA_VERSION);
    expect(all.e['7|lg'].n).toBe('orders-table');
  });

  it('uses a versioned storage key', () => {
    expect(STORAGE_KEY).toBe('ghostwire.learned.v1');
  });

  // Ruling A (F2) / Finding 1: store.put() rejects an entry outright when any
  // bone's type falls outside BONE_TYPES, so if the synthesizer ever grows a
  // new bone type that whitelist doesn't know about, learning silently goes
  // dark for every component that produces it - no error, no signal. This
  // test is the alarm: it derives the real emittable vocabulary mechanically
  // from BOTH walk.js and emit.js source (never hand-copied - no hardcoded
  // "remaps" list, no matter which file introduces a new type or what shape
  // it takes) and fails the moment BONE_TYPES falls behind.
  //
  // What it deliberately excludes, and why: `container` and `repeat-extra`
  // are internal-only walk entry types that never reach emit.js as a bone's
  // own `type` - `container` is converted to `{type:'block'}` or recursed
  // into (walk.js:93-97, SPEC-SYN-13), and `repeat-extra` entries are
  // skipped by emit.js (emit.js:8) and expanded into bones carrying the
  // sampled template's own already-whitelisted type. Both are named here so
  // the next person to touch this vocabulary understands what the alarm
  // watches, and why these two specifically don't count as bone types.
  it('keeps BONE_TYPES a superset of what the synthesizer can actually emit', () => {
    const walkSrc = readFileSync(path.join(dir, '../src/synthesizer/walk.js'), 'utf8');
    const emitSrc = readFileSync(path.join(dir, '../src/synthesizer/emit.js'), 'utf8');

    // Every syntactic shape this codebase actually uses to name a bone's
    // type: classify()'s bare `return 'x';`, an object literal's `type: 'x'`,
    // a `type === 'x'` / `type !== 'x'` comparison, and a `cond ? 'x' : y`
    // remap (the exact shape emit.js's media->avatar remap uses). `[a-z-]+`
    // so a hyphenated type name - this codebase already has one,
    // `repeat-extra` - is never silently missed.
    const TYPE_LITERAL_PATTERNS = [
      /return\s+'([a-z-]+)';/g,
      /\btype:\s*'([a-z-]+)'/g,
      /\btype\s*[!=]==\s*'([a-z-]+)'/g,
      /\?\s*'([a-z-]+)'\s*:/g,
    ];

    function typeLiteralsIn(src) {
      const found = new Set();
      for (const pattern of TYPE_LITERAL_PATTERNS) {
        for (const match of src.matchAll(pattern)) found.add(match[1]);
      }
      return found;
    }

    const found = new Set([...typeLiteralsIn(walkSrc), ...typeLiteralsIn(emitSrc)]);

    const INTERNAL_ONLY = new Set([
      'container', // walk.js:93-97 (SPEC-SYN-13): converted to {type:'block'} or recursed into - never itself a bone type
      'repeat-extra', // walk.js:71, skipped by emit.js:8 and expanded into bones carrying the sampled template's own type
    ]);

    const emittable = [...found].filter((type) => !INTERNAL_ONLY.has(type));

    // Guards against the alarm going silently vacuous (e.g. a source reformat
    // that breaks every pattern above) rather than pinning its exact
    // contents - a content/order pin is exactly what made the previous
    // version of this test brittle.
    expect(emittable.length).toBeGreaterThan(0);

    for (const type of emittable) {
      expect(BONE_TYPES.has(type)).toBe(true);
    }
  });

  // Finding 2: store.js's BONE_KEYS hand-copies emit.js's toBone() shape, and
  // validBone() *rejects* a bone carrying any key toBone() doesn't produce
  // (store.js:31-32) - so a 6th field added to toBone() tomorrow would fail
  // every single put(), the identical silent-blackout failure mode Finding 1
  // guards against for bone *types*, left uncovered for bone *keys*. Reads
  // both sides from source rather than importing BONE_KEYS (which store.js
  // doesn't export) so this stays a source-level invariant, not a hand-copy.
  it("keeps store.js's bone key set in sync with emit.js's toBone() shape (SPEC-SEC-04)", () => {
    const storeSrc = readFileSync(path.join(dir, '../src/learning/store.js'), 'utf8');
    const emitSrc = readFileSync(path.join(dir, '../src/synthesizer/emit.js'), 'utf8');

    const boneKeysMatch = storeSrc.match(/BONE_KEYS = \[([^\]]+)\]/);
    expect(boneKeysMatch).not.toBeNull();
    const boneKeys = [...boneKeysMatch[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

    const toBoneMatch = emitSrc.match(/export function toBone\([^)]*\)\s*\{\s*return \{([^}]+)\}/);
    expect(toBoneMatch).not.toBeNull();
    const toBoneKeys = toBoneMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(':')[0].trim());

    expect(boneKeys.sort()).toEqual(toBoneKeys.sort());
  });
});
