const RESIZE_THRESHOLD_PX = 4; // SPEC-SYN-21 default

export function createSignatureCache() {
  const cache = new WeakMap(); // host.el -> { signature, boneTree, observer, width }

  function computeSignature(candidates) {
    let hash = 2166136261; // FNV-1a offset basis
    for (const candidate of candidates) {
      const key = `${candidate.el.tagName}|${candidate.type}|${candidate.el.className}|${candidate.depth}`;
      for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return hash >>> 0;
  }

  function get(host, signature) {
    const entry = cache.get(host.el);
    if (entry && entry.signature === signature) return entry.boneTree;
    return null;
  }

  function set(host, signature, boneTree, onInvalidate) {
    const previous = cache.get(host.el);
    if (previous?.observer) previous.observer.disconnect();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry.borderBoxSize
        ? (Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0].inlineSize : entry.borderBoxSize.inlineSize)
        : entry.contentRect.width;
      const stored = cache.get(host.el);
      if (!stored) return;
      if (Math.abs(width - stored.width) >= RESIZE_THRESHOLD_PX) {
        observer.disconnect();
        cache.delete(host.el);
        onInvalidate?.(host);
      }
    });
    observer.observe(host.el, { box: 'border-box' });

    cache.set(host.el, { signature, boneTree, observer, width: host.el.getBoundingClientRect().width });
  }

  function invalidate(host) {
    const entry = cache.get(host.el);
    if (entry?.observer) entry.observer.disconnect();
    cache.delete(host.el);
  }

  return { computeSignature, get, set, invalidate };
}
