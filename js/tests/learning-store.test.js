import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLearningStore, STORAGE_KEY, SCHEMA_VERSION, BONE_TYPES, MAX_BONES } from '../src/learning/store.js';

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

// Bounded extraction of toBone()'s own function body, by counting brace
// depth from its opening `{` rather than a regex heuristic (e.g. matching up
// to the next bare `\n}`) - a plain lazy regex scan has no way to tell "the
// nearest `if (...) bone.x = ...;` after the signature" from "the nearest
// one anywhere in the rest of the file", so it can walk straight past
// toBone()'s real closing brace into a later function and match a decoy
// there instead. Counting depth by hand also stays correct if toBone()'s own
// body ever grows a nested block (e.g. `if (x) { ... }`), which a `\n}`
// heuristic would break on immediately.
function extractToBoneBody(emitSrc) {
  const sigMatch = emitSrc.match(/export function toBone\([^)]*\)\s*\{/);
  if (!sigMatch) return null;

  const start = sigMatch.index + sigMatch[0].length;
  let depth = 1;
  let i = start;
  for (; i < emitSrc.length && depth > 0; i++) {
    if (emitSrc[i] === '{') depth++;
    else if (emitSrc[i] === '}') depth--;
  }
  if (depth !== 0) return null; // unbalanced - source doesn't parse as expected

  return emitSrc.slice(start, i - 1); // i-1 excludes toBone()'s own closing brace
}

const TREE = [{ type: 'text', x: 12, y: 8, width: 240, height: 14 }];

describe('learning store', () => {
  let storage;
  let store;

  beforeEach(() => {
    storage = fakeStorage();
    store = createLearningStore({ storage, quotaBytes: 256 * 1024, now: () => 1000 });
  });

  it('round-trips a learned tree by component and band', () => {
    expect(store.put('orders-table', 3141592653, 'lg', { width: 960, height: 320 }, TREE)).toBe(true);

    expect(store.get('orders-table', 'lg')).toEqual({ width: 960, height: 320, bones: TREE });
  });

  it('indexes entries by signature and band, with a component pointer', () => {
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

  it('discards the whole store on a schema version mismatch', () => {
    storage.seed(JSON.stringify({ v: 999, e: { '1|lg': { t: 1, n: 'x', w: 1, h: 1, b: TREE } }, c: { 'x|lg': '1' } }));

    expect(store.get('x', 'lg')).toBeNull();
  });

  // F15: SCHEMA_VERSION has no migration by design (the entries are a derived
  // cache, cheap to re-learn), but that used to leave the orphaned blob sitting
  // in localStorage forever once a bump made it unreadable. read() now clears it.
  it('removes the orphaned blob from storage on a schema version mismatch', () => {
    storage.seed(JSON.stringify({
      v: SCHEMA_VERSION + 1,
      e: { '1|lg': { t: 1, n: 'x', w: 1, h: 1, b: TREE } },
      c: { 'x|lg': '1' },
    }));

    store.all();

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps a valid envelope on read', () => {
    const store = createLearningStore({ storage, quotaBytes: 256 * 1024, now: () => 1000 });
    store.put('orders-table', 42, 'md', { width: 100, height: 50 }, [
      { type: 'text', x: 0, y: 0, width: 10, height: 4 },
    ]);

    store.all();

    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('discards unparseable JSON silently', () => {
    storage.seed('}{ not json');

    expect(() => store.get('x', 'lg')).not.toThrow();
    expect(store.get('x', 'lg')).toBeNull();
  });

  it('drops only the corrupt entry, keeping valid siblings', () => {
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

  it('rejects a bone carrying an unknown type', () => {
    expect(store.put('x', 1, 'lg', { width: 10, height: 10 }, [{ type: 'script', x: 0, y: 0, width: 1, height: 1 }])).toBe(false);
  });

  it('rejects a bone carrying extra keys, so nothing smuggled survives', () => {
    expect(store.put('x', 1, 'lg', { width: 10, height: 10 }, [{ type: 'text', x: 0, y: 0, width: 1, height: 1, onclick: 'alert(1)' }])).toBe(false);
  });

  it('accepts a panel bone carrying a valid borderRadius', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '8px' },
    ])).toBe(true);

    expect(store.get('card', 'lg').bones).toEqual([
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '8px' },
    ]);
  });

  it('accepts a panel bone with no borderRadius, using just the 5 base keys', () => {
    // The common case: most panels have no rounded corner at all, so toBone()
    // never adds the key in the first place.
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100 },
    ])).toBe(true);
  });

  it('accepts a multi-corner borderRadius (up to 4 space-separated tokens)', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '8px 4px 8px 4px' },
    ])).toBe(true);
  });

  it('rejects a panel bone whose borderRadius does not match the strict pattern', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '8px" onmouseover="alert(1)' },
    ])).toBe(false);
  });

  it('accepts a panel bone with scientific notation borderRadius (positive exponent)', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '3.35544e+07px' },
    ])).toBe(true);
  });

  it('accepts a panel bone with scientific notation borderRadius (negative exponent)', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '1.5e-3px' },
    ])).toBe(true);
  });

  it('accepts a panel bone with scientific notation borderRadius (unsigned exponent)', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '1.5e3px' },
    ])).toBe(true);
  });

  it('rejects injection payloads using exponent-like syntax with prohibited characters', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '1e"onmouseover="alert(1)px' },
    ])).toBe(false);
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '1e<svg>px' },
    ])).toBe(false);
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '1e;javascript:alert(1)px' },
    ])).toBe(false);
  });

  it('accepts a boneTree with multiple panel bones carrying scientific notation borderRadius', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 24, height: 24, borderRadius: '3.35544e+07px' },
      { type: 'panel', x: 30, y: 0, width: 24, height: 24, borderRadius: '9.99999e+06px' },
      { type: 'text', x: 60, y: 5, width: 100, height: 14 },
    ])).toBe(true);
  });

  it('rejects a panel bone carrying a 7th key beyond the 5 base keys plus borderRadius', () => {
    expect(store.put('card', 1, 'lg', { width: 200, height: 100 }, [
      { type: 'panel', x: 0, y: 0, width: 200, height: 100, borderRadius: '8px', onclick: 'alert(1)' },
    ])).toBe(false);
  });

  it('accepts a boneTree well over the old 300-bone cap but under the new MAX_BONES, and still rejects one over it', () => {
    const bone = { type: 'text', x: 0, y: 0, width: 1, height: 1 };

    const fiveHundredBones = Array.from({ length: 500 }, () => bone);
    expect(store.put('big-page', 1, 'lg', { width: 100, height: 100 }, fiveHundredBones)).toBe(true);

    const tooManyBones = Array.from({ length: MAX_BONES + 1 }, () => bone);
    expect(store.put('big-page', 2, 'lg', { width: 100, height: 100 }, tooManyBones)).toBe(false);
  });

  it('rejects a component name outside the allowed charset', () => {
    expect(store.put('<img src=x>', 1, 'lg', { width: 10, height: 10 }, TREE)).toBe(false);
  });

  it('clamps geometry read back out of the store', () => {
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
  it('evicts least-recently-used entries when over quota', () => {
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

  // Since the learning store no longer writes on every read, this test
  // used to prove get() refreshed LRU recency, keeping a re-read `hot` entry
  // alive over a never-re-read `cold` one. That write is gone - recency now
  // comes from put() alone - so this is the corrected counterpart: reading
  // `hot` must NOT protect it from eviction. `hot` is still the
  // least-recently-*written* entry, so it is the one evicted, even though it
  // was the one read most recently.
  it('does not refresh LRU recency on read, so a read entry can still be evicted', () => {
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
    s.get('hot', 'lg'); // reading hot must not refresh its recency
    expect(JSON.parse(storage.raw).e['1|lg'].t).toBe(1000); // untouched by the read

    clock = 4000;
    s.put('fresh', 3, 'lg', { width: 10, height: 10 }, TREE); // now over quota: forces exactly one eviction

    expect(s.get('hot', 'lg')).toBeNull(); // evicted: least-recently-written, despite being read most recently
    expect(s.get('cold', 'lg')).not.toBeNull(); // survives: written after hot
    expect(s.get('fresh', 'lg')).not.toBeNull();
  });

  it('does not write to storage on a read', () => {
    store.put('orders-table', 42, 'md', { width: 100, height: 50 }, [
      { type: 'text', x: 0, y: 0, width: 10, height: 4 },
    ]);

    const setItemSpy = vi.spyOn(storage, 'setItem');
    const learned = store.get('orders-table', 'md');

    expect(learned).not.toBeNull(); // positive control: the read really hit an entry
    expect(setItemSpy).not.toHaveBeenCalled();
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

  it('exposes the whole validated envelope for export', () => {
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
  // test is the alarm: it scans BOTH walk.js and emit.js source for every
  // occurrence of the four concrete syntactic shapes this codebase actually
  // uses to name a bone's type (see TYPE_LITERAL_PATTERNS below), never
  // hand-copying the result into a fixed list, and fails the moment
  // BONE_TYPES falls behind. Its boundary is exactly those four shapes - a
  // type introduced some other way (built from a variable, concatenated, or
  // read off an unrelated property) would not be seen.
  //
  // What it deliberately excludes, and why: `container` and `repeat-extra`
  // are internal-only walk entry types that never reach emit.js as a bone's
  // own `type` - `container` is converted to `{type:'block'}` or recursed
  // into (walk.js:93-97), and `repeat-extra` entries are
  // skipped by emit.js (emit.js:8) and expanded into bones carrying the
  // sampled template's own already-whitelisted type. Both are named here so
  // the next person to touch this vocabulary understands what the alarm
  // watches, and why these two specifically don't count as bone types.
  it('keeps BONE_TYPES a superset of what the synthesizer can actually emit', () => {
    const walkSrc = readFileSync(path.join(dir, '../src/synthesizer/walk.js'), 'utf8');
    const emitSrc = readFileSync(path.join(dir, '../src/synthesizer/emit.js'), 'utf8');

    // The four concrete syntactic shapes this codebase actually uses to name
    // a bone's type: classify()'s bare `return 'x';`, an object literal's
    // `type: 'x'`, a `type === 'x'` / `type !== 'x'` comparison, and a
    // `cond ? 'x' : y` remap (the exact shape emit.js's media->avatar remap
    // uses). `[a-z0-9-]+` so a type name containing a digit or a hyphen -
    // this codebase already has a hyphenated one, `repeat-extra` - is never
    // silently missed. These four shapes are the mechanism's real boundary:
    // a type spelled out any other way in source would not be caught.
    const TYPE_LITERAL_PATTERNS = [
      /return\s+'([a-z0-9-]+)';/g,
      /\btype:\s*'([a-z0-9-]+)'/g,
      /\btype\s*[!=]==\s*'([a-z0-9-]+)'/g,
      /\?\s*'([a-z0-9-]+)'\s*:/g,
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
      'container', // walk.js:93-97: converted to {type:'block'} or recursed into - never itself a bone type
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
  // validBone() *rejects* a bone carrying any base key toBone() doesn't
  // produce, or an unrecognized key beyond the recognized optional ones - so
  // a key added to toBone() tomorrow without a matching update here would
  // fail every single put() that key appears on, the identical
  // silent-blackout failure mode Finding 1 guards against for bone *types*,
  // left uncovered for bone *keys*. Reads both sides from source rather than
  // importing BONE_KEYS/OPTIONAL_BONE_KEYS (which store.js doesn't export)
  // so this stays a source-level invariant, not a hand-copy.
  //
  // toBone() sets its 5 base keys unconditionally and then, for a panel bone
  // with a real border-radius, adds an optional key
  // (`if (borderRadius) bone.borderRadius = borderRadius;`). This checks both
  // halves independently: the base object literal's keys against
  // store.js's BONE_KEYS, and the FULL SET of conditionally-assigned keys
  // (matchAll, not a single match - toBone() may grow more than one such
  // line, and a single match would only ever see the first, silently missing
  // any other) against store.js's OPTIONAL_BONE_KEYS - so either half
  // drifting out of sync (a new base key, a renamed optional key, a second
  // optional key added on only one side) fails this test instead of silently
  // going dark. The conditional scan is bounded to toBone()'s own body via
  // extractToBoneBody() (real brace-depth counting, not a `\n}` guess) so it
  // can never wander into a later function's own conditional if toBone()'s
  // real one were ever deleted.
  it("keeps store.js's bone key set in sync with emit.js's toBone() shape, base and optional", () => {
    const storeSrc = readFileSync(path.join(dir, '../src/learning/store.js'), 'utf8');
    const emitSrc = readFileSync(path.join(dir, '../src/synthesizer/emit.js'), 'utf8');

    const requiredKeysMatch = storeSrc.match(/BONE_KEYS = \[([^\]]+)\]/);
    expect(requiredKeysMatch).not.toBeNull();
    const requiredKeys = [...requiredKeysMatch[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);

    const optionalKeysMatch = storeSrc.match(/OPTIONAL_BONE_KEYS = \[([^\]]+)\]/);
    expect(optionalKeysMatch).not.toBeNull();
    const optionalKeys = [...optionalKeysMatch[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);

    const body = extractToBoneBody(emitSrc);
    expect(body).not.toBeNull();

    // body is already scoped to exactly toBone()'s own braces, so this can
    // only ever match that one object literal - no anchor prefix needed.
    const baseLiteralMatch = body.match(/const bone = \{([^}]+)\}/);
    expect(baseLiteralMatch).not.toBeNull();
    const baseKeys = baseLiteralMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(':')[0].trim());

    expect(requiredKeys.sort()).toEqual(baseKeys.sort());

    // Matched structurally (guard variable, assigned property, assigned-from
    // variable, all captured rather than hardcoded) so a harmless reformat
    // doesn't false-fail this test the way a brittle exact-string match
    // would - but the three occurrences of the identifier are still required
    // to agree on each match found. matchAll over the bounded body collects
    // EVERY such conditional, not just the first.
    const conditionalPattern = /if\s*\(\s*(\w+)\s*\)\s*bone\.(\w+)\s*=\s*\1\s*;/g;
    const assignedKeys = [...body.matchAll(conditionalPattern)].map(([, guardVar, assignedKey]) => {
      expect(assignedKey).toBe(guardVar); // the param, its guard, and the key it's assigned under all share one name
      return assignedKey;
    });

    expect(assignedKeys.sort()).toEqual([...optionalKeys].sort());
  });
});
