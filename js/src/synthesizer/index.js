import { collectAndClassify } from './walk.js';
import { measure } from './measure.js';
import { emit } from './emit.js';
import { createSignatureCache } from './signature.js';

const LONG_SYNTHESIS_THRESHOLD_MS = 50; // SPEC-PERF-07: a synthesis that takes this long, twice in a row, is treated as structurally too expensive to repeat, and freezes instead
const SLOW_STREAK_LIMIT = 2; // SPEC-PERF-07: two consecutive slow syntheses, not one — a lone sample can be dominated by GC/engine jitter rather than being genuinely structural (see ComplexityTest.php's own median-of-7 rationale)

export function createSynthesizer(registry, defaults = { maxDepth: 12, repeatSampleSize: 3 }, onResize, now = () => performance.now()) {
  const cache = createSignatureCache();
  const slowStreak = new WeakMap(); // host -> consecutive slow-synthesis count; SPEC-PERF-07 adaptive freeze trigger

  function synthesize(host) {
    if ((slowStreak.get(host) || 0) >= SLOW_STREAK_LIMIT) return null; // SPEC-PERF-07: skip straight to freeze

    const startedAt = now();
    const candidates = collectAndClassify(host, registry, defaults.maxDepth, defaults.repeatSampleSize);
    const signature = cache.computeSignature(candidates);

    const cached = cache.get(host, signature);
    if (cached) {
      recordDuration(host, now() - startedAt);
      return cached;
    }

    const measured = measure(host, candidates);
    const boneTree = emit(host, measured, host.config.rows);

    if (boneTree) cache.set(host, signature, boneTree, () => onResize?.(host));
    else cache.invalidate(host);

    recordDuration(host, now() - startedAt);
    return boneTree;
  }

  function recordDuration(host, ms) {
    if (ms > LONG_SYNTHESIS_THRESHOLD_MS) {
      slowStreak.set(host, (slowStreak.get(host) || 0) + 1);
    } else {
      slowStreak.delete(host); // a fast synthesis resets the streak — isolated jitter never accumulates toward freeze
    }
    if (typeof window !== 'undefined') window.__ghostwireLastSynthesisMs = ms; // debug bridge for the SPEC-PERF-03/04 browser perf suite — unaffected by the streak logic, always the raw measured duration
  }

  function forget(host) {
    cache.invalidate(host);
    slowStreak.delete(host);
  }

  return { synthesize, forget };
}
