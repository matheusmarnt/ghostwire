import { collectAndClassify } from './walk.js';
import { measure } from './measure.js';
import { emit } from './emit.js';
import { createSignatureCache } from './signature.js';

const LONG_SYNTHESIS_THRESHOLD_MS = 50; // SPEC-PERF-07: a synthesis that already took this long once is treated as structurally too expensive to repeat, and freezes instead

export function createSynthesizer(registry, defaults = { maxDepth: 12, repeatSampleSize: 3 }, onResize, now = () => performance.now()) {
  const cache = createSignatureCache();
  const lastDuration = new WeakMap(); // host -> ms; SPEC-PERF-07 adaptive freeze trigger

  function synthesize(host) {
    if ((lastDuration.get(host) || 0) > LONG_SYNTHESIS_THRESHOLD_MS) return null; // SPEC-PERF-07: skip straight to freeze

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
    lastDuration.set(host, ms);
    if (typeof window !== 'undefined') window.__ghostwireLastSynthesisMs = ms; // debug bridge for the SPEC-PERF-03/04 browser perf suite
  }

  function forget(host) {
    cache.invalidate(host);
    lastDuration.delete(host);
  }

  return { synthesize, forget };
}
