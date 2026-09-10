const KEY_MAP = { m: 'mode', o: 'only', x: 'except', d: 'delay', h: 'hold', r: 'rows', p: 'poll', s: 'sync', l: 'lazy' };
// 'a' (per-action method-level overrides, SPEC-API-10) is a top-level key
// but not a compact-config field itself — it carries its own nested schema,
// validated separately below. It must still be a recognized top-level key
// here or the unknown-key loop discards the whole payload before ever
// reaching that validation (ponytail: one-line fix, not a KEY_MAP entry
// since 'a' has no scalar field/default of its own).
const KNOWN_COMPACT_KEYS = new Set([...Object.keys(KEY_MAP), 'a']);
const METHOD_OVERRIDE_KEYS = new Set(['m', 'd', 'h', 'r', 'p', 's', 'l']);
const ACTION_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

// Mirrors src/Support/ConfigResolver.php's literalDefaults() exactly — these
// are fixed literals, not config()-driven values. GhostComponentHook's
// compactPayload() omits a data-ghost field only when it matches
// literalDefaults(), specifically so the browser's fallback here is always
// correct even when a deployment customizes config/ghostwire.php. If either
// side's numbers change, update the other too.
const DEFAULTS = { mode: 'synthesize', only: null, except: null, delay: 120, hold: 300, rows: null, poll: false, sync: false, lazy: false };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeActionList(list) {
  if (!Array.isArray(list)) return undefined;
  const cleaned = list.filter((name) => typeof name === 'string' && ACTION_NAME_PATTERN.test(name));
  return cleaned.length > 0 ? cleaned : null;
}

function warn(message) {
  if (process.env.NODE_ENV !== 'production') console.warn(`[ghostwire] ${message}`);
}

export function parseAttributeConfig(el) {
  const raw = el.getAttribute('data-ghost');
  if (raw == null) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warn('data-ghost payload is not valid JSON — discarded, using defaults (SPEC-SEC-02)');
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn('data-ghost payload is not a JSON object — discarded, using defaults (SPEC-SEC-02)');
    return null;
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_COMPACT_KEYS.has(key)) {
      warn(`data-ghost payload has unknown key "${key}" — whole payload discarded (SPEC-SEC-02)`);
      return null;
    }
  }

  const config = { ...DEFAULTS };

  if ('m' in parsed) {
    if (typeof parsed.m !== 'string' || !['synthesize', 'freeze', 'off'].includes(parsed.m)) {
      warn('data-ghost "m" is not a valid mode — whole payload discarded (SPEC-SEC-02)');
      return null;
    }
    config.mode = parsed.m;
  }

  if ('d' in parsed) {
    if (typeof parsed.d !== 'number') { warn('data-ghost "d" is not a number — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.delay = clamp(parsed.d, 0, 60000);
  }

  if ('h' in parsed) {
    if (typeof parsed.h !== 'number') { warn('data-ghost "h" is not a number — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.hold = clamp(parsed.h, 0, 60000);
  }

  if ('r' in parsed) {
    if (typeof parsed.r !== 'number') { warn('data-ghost "r" is not a number — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.rows = clamp(parsed.r, 0, 1000);
  }

  if ('p' in parsed) {
    if (typeof parsed.p !== 'boolean') { warn('data-ghost "p" is not a boolean — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.poll = parsed.p;
  }

  if ('s' in parsed) {
    if (typeof parsed.s !== 'boolean') { warn('data-ghost "s" is not a boolean — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.sync = parsed.s;
  }

  if ('l' in parsed) {
    if (typeof parsed.l !== 'boolean') { warn('data-ghost "l" is not a boolean — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.lazy = parsed.l;
  }

  if ('o' in parsed) {
    const sanitized = sanitizeActionList(parsed.o);
    if (sanitized === undefined) { warn('data-ghost "o" is not an array — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.only = sanitized;
  }

  if ('x' in parsed) {
    const sanitized = sanitizeActionList(parsed.x);
    if (sanitized === undefined) { warn('data-ghost "x" is not an array — whole payload discarded (SPEC-SEC-02)'); return null; }
    config.except = sanitized;
  }

  if ('a' in parsed) {
    if (parsed.a === null || typeof parsed.a !== 'object' || Array.isArray(parsed.a)) {
      warn('data-ghost "a" is not a JSON object — whole payload discarded (SPEC-SEC-02)');
      return null;
    }
    const actionOverrides = {};
    for (const [action, fields] of Object.entries(parsed.a)) {
      if (!ACTION_NAME_PATTERN.test(action)) {
        warn(`data-ghost "a" has an invalid action name — whole payload discarded (SPEC-SEC-02)`);
        return null;
      }
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
        warn(`data-ghost "a.${action}" is not a JSON object — whole payload discarded (SPEC-SEC-02)`);
        return null;
      }
      const override = {};
      for (const [key, value] of Object.entries(fields)) {
        if (!METHOD_OVERRIDE_KEYS.has(key)) {
          warn(`data-ghost "a.${action}" has unknown key "${key}" — whole payload discarded (SPEC-SEC-02)`);
          return null;
        }
        if (key === 'm') {
          if (typeof value !== 'string' || !['synthesize', 'freeze', 'off'].includes(value)) {
            warn(`data-ghost "a.${action}.m" is not a valid mode — whole payload discarded (SPEC-SEC-02)`);
            return null;
          }
          override.mode = value;
        } else if (key === 'd' || key === 'h' || key === 'r') {
          if (typeof value !== 'number') {
            warn(`data-ghost "a.${action}.${key}" is not a number — whole payload discarded (SPEC-SEC-02)`);
            return null;
          }
          const field = key === 'd' ? 'delay' : key === 'h' ? 'hold' : 'rows';
          const max = key === 'r' ? 1000 : 60000;
          override[field] = clamp(value, 0, max);
        } else {
          if (typeof value !== 'boolean') {
            warn(`data-ghost "a.${action}.${key}" is not a boolean — whole payload discarded (SPEC-SEC-02)`);
            return null;
          }
          const field = key === 'p' ? 'poll' : key === 's' ? 'sync' : 'lazy';
          override[field] = value;
        }
      }
      actionOverrides[action] = override;
    }
    config.actionOverrides = actionOverrides;
  }

  return config;
}

export function resolveHostConfig(directiveConfig, attributeConfig) {
  const base = attributeConfig ?? DEFAULTS;
  return { ...base, ...directiveConfig };
}
