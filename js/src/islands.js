// Island scoping is Tier C (Livewire 4 only). Livewire wraps
// every `@island`/`@endisland` block in a pair of HTML comments
// (vendor/livewire/livewire/src/Features/SupportIslands/HandlesIslands.php,
// wrapWithFragmentMarkers()): `<!--[if FRAGMENT:type=island|name=...|token=...|
// mode=...]><![endif]-->` ... content ... `<!--[if ENDFRAGMENT:...]><![endif]-->`.
// These markers persist in the live DOM for the life of the page — Livewire's
// own client re-locates islands by walking sibling comment nodes on every
// update, never strips them — so this is the same technique Livewire uses
// internally, reimplemented here because it isn't exposed on window.Livewire.
const FRAGMENT_MARKER = /\[if (FRAGMENT|ENDFRAGMENT):(.*?)\]/;

function fragmentMarkerInfo(node) {
  if (node.nodeType !== Node.COMMENT_NODE) return null;
  const match = FRAGMENT_MARKER.exec(node.textContent);
  if (!match) return null;
  const meta = {};
  for (const pair of match[2].split('|')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    meta[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { kind: match[1], meta };
}

function findMatchingEnd(startNode) {
  let depth = 0;
  let node = startNode.nextSibling;
  while (node) {
    const info = fragmentMarkerInfo(node);
    if (info) {
      if (info.kind === 'FRAGMENT') depth++;
      else if (depth === 0) return node;
      else depth--;
    }
    node = node.nextSibling;
  }
  return null;
}

// Walks outward from `el` (its own preceding siblings first, then each
// ancestor's preceding siblings) for the nearest enclosing FRAGMENT/
// ENDFRAGMENT pair. Returns the pair when it's an island; returns null when
// `el` isn't inside one (always null on v3 — it never emits these comments —
// and on v4 whenever `el` is outside any island or inside some other,
// non-island fragment type).
export function closestIslandRange(el) {
  let ancestor = el;
  while (ancestor) {
    let depth = 0;
    let sibling = ancestor.previousSibling;
    while (sibling) {
      const info = fragmentMarkerInfo(sibling);
      if (info) {
        if (info.kind === 'ENDFRAGMENT') {
          depth++;
        } else if (depth > 0) {
          depth--;
        } else {
          if (info.meta.type !== 'island') return null;
          const endNode = findMatchingEnd(sibling);
          return endNode ? { startNode: sibling, endNode } : null;
        }
      }
      sibling = sibling.previousSibling;
    }
    ancestor = ancestor.parentNode;
  }
  return null;
}
