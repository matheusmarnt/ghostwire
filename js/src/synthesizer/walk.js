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
  visit(host.el, registry, candidates, 0, maxDepth);
  return candidates;
}

function visit(node, registry, out, depth, maxDepth) {
  for (const child of node.children) {
    if (out.length >= MAX_CANDIDATES) return;
    if (registry.hostFor(child)) continue; // SPEC-API-03: nested wire:ghost host is a boundary
    if (child.getAttribute('aria-hidden') === 'true') continue;

    const type = classify(child);
    if (type === 'container') {
      if (depth < maxDepth) visit(child, registry, out, depth + 1, maxDepth);
      continue;
    }
    if (type === null) continue;
    out.push({ el: child, type, depth });
  }
}
