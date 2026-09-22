// The local Bone Tree store.
//
// Everything read back out of here is treated as hostile input: it may have been
// hand-edited, downgraded, or corrupted between page loads. Reads validate the
// whole envelope, drop whatever fails, and clamp every number that survives.
// The module returns plain data and nothing else - no HTML, no selectors, no
// callables - so nothing persisted can reach eval, Function or innerHTML.
//
// validBone/validEntry/validEnvelope below are mirrored independently in PHP by
// src/Support/LearnedTree.php, which re-validates the same envelope once it has
// left the browser (`ghost:export` reads a file from a developer's download
// directory, where none of this module's guarantees still hold). The two
// implementations cannot share code across the language boundary - when you
// change a rule or a constant here, change it there too.

import { bandFor, BAND_NAMES } from './bands.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'ghostwire.learned.v1';
export const MAX_COORD = 20000;
export const MAX_BONES = 300;
export const BONE_TYPES = new Set(['text', 'avatar', 'block', 'icon', 'media', 'control', 'heading', 'panel']);
export const NAME_PATTERN = /^[a-z0-9\-.]{1,64}$/;

const BONE_KEYS = ['type', 'x', 'y', 'width', 'height'];
// The one optional key a bone may carry beyond BONE_KEYS - toBone() (emit.js)
// only sets it for a panel bone, and only when the host actually has a
// border-radius. A real space, not \s: getComputedStyle(el).borderRadius
// only ever separates multi-corner tokens with a plain ASCII space, so \s's
// extra leniency (tab, newline, ...) would just be unneeded slack in an
// untrusted-input pattern. Elliptical radii ("10px 20px / 5px 10px") are
// deliberately NOT matched - real panels in practice use a single symmetric
// radius, and failing closed on the rare elliptical case only costs the
// whole entry (component+band) a missed learning opportunity, never a
// validation bypass.
const OPTIONAL_BONE_KEYS = ['borderRadius'];
const BORDER_RADIUS_PATTERN = /^\d+(\.\d+)?(px|%|em|rem)( \d+(\.\d+)?(px|%|em|rem)){0,3}$/;
const ENTRY_KEY_PATTERN = /^(\d{1,10})\|([a-z0-9]{2,3})$/;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;

  return Math.min(max, Math.max(min, value));
}

function validBone(bone) {
  if (bone === null || typeof bone !== 'object' || Array.isArray(bone)) return null;

  const keys = Object.keys(bone);
  if (keys.length < BONE_KEYS.length || keys.length > BONE_KEYS.length + OPTIONAL_BONE_KEYS.length) return null;
  if (!BONE_KEYS.every((key) => keys.includes(key))) return null;
  // Whatever isn't one of the 5 required keys must be exactly the one
  // recognized optional key - anything else (a typo, a smuggled field) is
  // rejected here rather than silently dropped, per this module's own rule to
  // fail closed on anything ambiguous.
  if (!keys.every((key) => BONE_KEYS.includes(key) || OPTIONAL_BONE_KEYS.includes(key))) return null;
  if (typeof bone.type !== 'string' || !BONE_TYPES.has(bone.type)) return null;

  const x = clamp(bone.x, -MAX_COORD, MAX_COORD);
  const y = clamp(bone.y, -MAX_COORD, MAX_COORD);
  const width = clamp(bone.width, 0, MAX_COORD);
  const height = clamp(bone.height, 0, MAX_COORD);

  if (x === null || y === null || width === null || height === null) return null;

  const valid = { type: bone.type, x, y, width, height };

  if (keys.includes('borderRadius')) {
    if (typeof bone.borderRadius !== 'string' || !BORDER_RADIUS_PATTERN.test(bone.borderRadius)) return null;
    valid.borderRadius = bone.borderRadius;
  }

  return valid;
}

function validEntry(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.n !== 'string' || !NAME_PATTERN.test(entry.n)) return null;
  if (!Array.isArray(entry.b) || entry.b.length === 0 || entry.b.length > MAX_BONES) return null;

  const t = clamp(entry.t, 0, Number.MAX_SAFE_INTEGER);
  const w = clamp(entry.w, 0, MAX_COORD);
  const h = clamp(entry.h, 0, MAX_COORD);

  if (t === null || w === null || h === null) return null;

  const bones = [];
  for (const bone of entry.b) {
    const valid = validBone(bone);
    if (valid === null) return null; // one bad bone discards the whole entry

    bones.push(valid);
  }

  return { t, n: entry.n, w, h, b: bones };
}

function emptyEnvelope() {
  return { v: SCHEMA_VERSION, e: {}, c: {} };
}

function validEnvelope(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyEnvelope();
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyEnvelope();
  if (parsed.v !== SCHEMA_VERSION) return emptyEnvelope();
  if (parsed.e === null || typeof parsed.e !== 'object' || Array.isArray(parsed.e)) return emptyEnvelope();

  const envelope = emptyEnvelope();

  for (const [key, entry] of Object.entries(parsed.e)) {
    const match = ENTRY_KEY_PATTERN.exec(key);
    if (!match || !BAND_NAMES.includes(match[2])) continue;

    const valid = validEntry(entry);
    if (valid === null) continue; // silent discard + re-synthesis

    envelope.e[key] = valid;
    envelope.c[`${valid.n}|${match[2]}`] = match[1];
  }

  return envelope;
}

export function createLearningStore({ storage, quotaBytes = 256 * 1024, now = () => Date.now() } = {}) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return emptyEnvelope();
    }

    if (typeof raw !== 'string' || raw === '') return emptyEnvelope();

    const envelope = validEnvelope(raw);

    // A schema bump discards every learned tree by design — they are a derived
    // cache and re-synthesis is cheap. Drop the orphaned blob rather than leaving
    // it in localStorage forever: STORAGE_KEY carries the version, so a future bump
    // would otherwise strand this one permanently. Only fires when a non-trivial
    // stored value validated down to zero entries: wrong schema version, corrupt
    // JSON, or every entry rejected — in all three the blob is already worthless.
    if (Object.keys(envelope.e).length === 0 && raw.length > 2) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // best-effort
      }
    }

    return envelope;
  }

  function write(envelope) {
    let serialized = JSON.stringify(envelope);

    // Quota with LRU eviction: drop the coldest entry until it fits.
    while (serialized.length > quotaBytes) {
      const keys = Object.keys(envelope.e);
      if (keys.length === 0) return false;

      const coldest = keys.reduce((a, b) => (envelope.e[a].t <= envelope.e[b].t ? a : b));
      const band = ENTRY_KEY_PATTERN.exec(coldest)[2];
      delete envelope.c[`${envelope.e[coldest].n}|${band}`];
      delete envelope.e[coldest];

      serialized = JSON.stringify(envelope);
    }

    try {
      storage.setItem(STORAGE_KEY, serialized);
    } catch {
      return false; // browser-level quota refusal, or storage unavailable
    }

    return true;
  }

  return {
    get(name, band) {
      const envelope = read();
      const signature = envelope.c[`${name}|${band}`];
      if (signature === undefined) return null;

      const entry = envelope.e[`${signature}|${band}`];
      if (entry === undefined) return null;

      // No write on read. Refreshing LRU recency here re-serialised the whole
      // envelope and did a synchronous setItem on the lazy-paint critical path, to
      // move one timestamp. Recency now comes from put() alone, which runs on every
      // successful synthesis — so eviction order degrades to
      // least-recently-*written*, which is sufficient: the quota only comes under
      // pressure while learning is collecting, and collection is refused in
      // production (GhostComponentHook::learningEnabled()).

      return { width: entry.w, height: entry.h, bones: entry.b };
    },

    put(name, signature, band, hostRect, boneTree) {
      if (typeof name !== 'string' || !NAME_PATTERN.test(name)) return false;
      if (!BAND_NAMES.includes(band)) return false;

      const sig = clamp(signature, 0, 4294967295);
      if (sig === null) return false;

      const candidate = validEntry({
        t: now(),
        n: name,
        w: hostRect?.width,
        h: hostRect?.height,
        b: boneTree,
      });
      if (candidate === null) return false;

      const envelope = read();
      const stamp = String(Math.trunc(sig));

      // A component keeps one tree per band; drop the stale pointer target.
      const previous = envelope.c[`${name}|${band}`];
      if (previous !== undefined && previous !== stamp) {
        delete envelope.e[`${previous}|${band}`];
      }

      envelope.e[`${stamp}|${band}`] = candidate;
      envelope.c[`${name}|${band}`] = stamp;

      return write(envelope);
    },

    all() {
      return read();
    },

    clear() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // best-effort by design: nothing to do if storage refuses
      }
    },
  };
}

export { bandFor };
