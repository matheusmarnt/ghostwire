import { collectAndClassify } from './walk.js';
import { measure } from './measure.js';
import { emit } from './emit.js';
import { createSignatureCache } from './signature.js';

export function createSynthesizer(registry, defaults = { maxDepth: 12 }) {
  const cache = createSignatureCache();

  function synthesize(host) {
    const candidates = collectAndClassify(host, registry, defaults.maxDepth);
    const signature = cache.computeSignature(candidates);

    const cached = cache.get(host, signature);
    if (cached) return cached;

    const measured = measure(host, candidates);
    const boneTree = emit(host, measured, host.config.rows);

    if (boneTree) cache.set(host, signature, boneTree, () => {});
    else cache.invalidate(host);

    return boneTree;
  }

  function forget(host) {
    cache.invalidate(host);
  }

  return { synthesize, forget };
}
