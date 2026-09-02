const LEAF_TAGS_MEDIA = ['IMG', 'VIDEO', 'PICTURE', 'CANVAS'];
const LEAF_TAGS_CONTROL = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'];
const MAX_CANDIDATES = 300; // SPEC-SYN-13 raw safety cap; block-aggregation degrade is M3 scope

export function classify(el) {
  if (el.tagName === 'svg' || el.tagName === 'SVG') return 'icon';
  if (LEAF_TAGS_MEDIA.includes(el.tagName)) return 'media';
  if (LEAF_TAGS_CONTROL.includes(el.tagName) || el.getAttribute('role') === 'button') return 'control';
  if (/^H[1-6]$/.test(el.tagName)) return 'heading';
  if (hasDirectText(el)) return 'text';
  if (el.children.length > 0) return 'container';
  return null;
}

function hasDirectText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') return true;
  }
  return false;
}

export function collectAndClassify(host, registry, maxDepth = 12) {
  const candidates = [];
  visit(host.el, registry, candidates, 0, maxDepth, host.el);
  return candidates;
}

// SPEC-SYN-13: depth and candidate-count are both hard-capped. Exceeding
// either must never silently drop content — it degrades to one aggregated
// 'block' bone standing in for whatever wasn't individually walked, so the
// host always ends up with *some* skeleton. The count cap specifically
// degrades to exactly ONE block for the whole host (never one per ancestor
// level it cascades through), sized to the host's own rect so no region is
// ever left with zero coverage.
function visit(node, registry, out, depth, maxDepth, rootEl) {
  for (const child of node.children) {
    if (out.length >= MAX_CANDIDATES) {
      if (!out.capped) {
        out.push({ type: 'block', el: rootEl, depth: 0 });
        out.capped = true;
      }
      return;
    }
    if (registry.hostFor(child)) continue; // SPEC-API-03: nested wire:ghost host is a boundary
    if (child.getAttribute('aria-hidden') === 'true') continue;

    const type = classify(child);
    if (type === 'container') {
      if (depth < maxDepth) {
        visit(child, registry, out, depth + 1, maxDepth, rootEl);
      } else {
        out.push({ type: 'block', el: child, depth: depth + 1 }); // SPEC-SYN-13: depth cap reached, aggregate this subtree
      }
      continue;
    }
    if (type === null) continue;
    out.push({ el: child, type, depth });
  }
}
