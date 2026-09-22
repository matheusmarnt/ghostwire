import { hasDirectText } from './walk.js';

const PANEL_ALPHA_MIN = 0.05; // background alpha below this reads as "not really a surface" (blend-mode/hover artifacts)

function backgroundAlpha(colorString) {
  const numbers = colorString.match(/[\d.]+/g);
  if (!numbers || numbers.length < 4) return 1;
  const alpha = parseFloat(numbers[3]);
  return (Number.isNaN(alpha) || alpha < 0 || alpha > 1) ? 1 : alpha;
}

function isPanelSurface(style) {
  return backgroundAlpha(style.backgroundColor) >= PANEL_ALPHA_MIN
    || parseFloat(style.borderTopWidth) > 0
    || parseFloat(style.borderRightWidth) > 0
    || parseFloat(style.borderBottomWidth) > 0
    || parseFloat(style.borderLeftWidth) > 0
    || style.boxShadow !== 'none';
}

// `clipRootEl` is where computeClipRect() stops walking up. It defaults to
// host.el, which is correct for a whole-component skeleton: every candidate is
// a descendant of the host. On the island path it is NOT — those
// candidates come from the island's sibling range, so their ancestor chain may
// never pass through host.el at all, and the caller passes the island's own
// container instead (see synthesizer/index.js).
export function measure(host, candidates, regionRect = null, clipRootEl = null) {
  const hostRect = regionRect || host.el.getBoundingClientRect();
  const clipRoot = clipRootEl || host.el;
  const hostStyle = window.getComputedStyle(host.el);
  const clipCache = new Map(); // ancestor element -> clip info, scoped to this measure() call only
  // Issue #21: a resize re-synthesis runs while the skeleton is
  // showing — host.el (or, for a nested host, an ancestor host) carries
  // .gw-concealed, whose visibility: hidden every candidate inherits. That
  // hidden-ness is ours, not the author's, so it must not trip the filter in
  // emit.js, or every resize degrades the host to freeze. closest()
  // is a DOM-tree read, not a layout read (unaffected).
  // ponytail: the see-through is not scoped to the resize path — closest()
  // governs ANY measure() run under a concealed ancestor, which also covers
  // a nested inner host synthesizing at show time while an outer host is
  // already concealed. The island path's candidates outside host.el are the
  // one case it cannot reach: we never conceal those siblings, so they are
  // treated as visible either way. Wherever it does apply, an author's own
  // visibility: hidden on a descendant is indistinguishable from ours and
  // gets a bone — and a resize-synthesized tree reaches the learning store
  // through index.js's onSynthesized callback, so such a bone can be
  // persisted, not just painted. Add per-element detection if it ever
  // matters.
  const concealedByUs = host.el.closest('.gw-concealed') !== null;

  const results = candidates.map((candidate) => {
    const style = window.getComputedStyle(candidate.el);
    const entry = {
      el: candidate.el,
      type: candidate.type,
      depth: candidate.depth,
      rect: candidate.el.getBoundingClientRect(),
      visibility: concealedByUs && style.visibility === 'hidden' ? 'visible' : style.visibility,
      transform: style.transform,
      clipRect: computeClipRect(candidate.el, clipRoot, hostRect, clipCache),
    };
    if (candidate.repeatGroup) entry.repeatGroup = candidate.repeatGroup;
    if (candidate.type === 'text') entry.lineRects = measureTextLines(candidate.el);
    if (candidate.type === 'media') entry.borderRadius = style.borderRadius;
    if (candidate.type === 'container' && host.config.panels) {
      entry.isPanel = isPanelSurface(style);
      entry.borderRadius = style.borderRadius;
    }
    if (candidate.type === 'repeat-extra') entry.repeat = measureRepeat(candidate.repeatExtra);
    return entry;
  });

  return { hostRect, hostTransform: hostStyle.transform, results };
}

function measureTextLines(el) {
  const rects = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
  }
  return rects;
}

// A scrollable or otherwise clipping ancestor between a
// candidate and the skeleton's root hides content outside its own box even
// though getBoundingClientRect() still reports the (scrolled-out)
// coordinates. Walk the plain DOM chain — no recursion, cheap — intersecting
// every such ancestor's own rect into the root's, so emit() can exclude bones
// for content the user cannot actually see.
//
// `rootEl` is the ceiling, and it must be an ancestor of every candidate: an
// ancestor at or above it is outside the skeleton's own coordinate space and
// must not clip it. Walking past the ceiling would fold a page shell's own
// clipping (e.g. `html, body { overflow: hidden }` around a scrolling
// `<main>`) into every bone and drop the ones currently out of viewport.
function computeClipRect(el, rootEl, hostRect, cache) {
  let clip = hostRect;
  let ancestor = el.parentElement;
  while (ancestor && ancestor !== rootEl) {
    let info;
    if (cache.has(ancestor)) {
      info = cache.get(ancestor);
    } else {
      const style = window.getComputedStyle(ancestor);
      const clips = style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible';
      info = clips ? { rect: ancestor.getBoundingClientRect() } : null;
      cache.set(ancestor, info);
    }
    if (info) clip = intersectRects(clip, info.rect);
    ancestor = ancestor.parentElement;
  }
  return clip;
}

function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

// Pitch is the real measured spacing between the last two
// sampled siblings, so cloned "extra" bones land where the real items would
// be — not at a guessed uniform offset.
function measureRepeat(repeatExtra) {
  const rects = repeatExtra.sampleEls.map((el) => el.getBoundingClientRect());
  const last = rects[rects.length - 1];
  let pitch = { x: 0, y: last.height };
  if (rects.length >= 2) {
    const prev = rects[rects.length - 2];
    pitch = { x: last.left - prev.left, y: last.top - prev.top };
  }
  const extraTextBones = (repeatExtra.extraEls || []).map((el) => measureShallowTextBones(el));
  return { count: repeatExtra.count, pitch, itemRect: last, extraTextBones };
}

// A cloned repeat bone approximates a repeat item's
// geometry from its sampled template, EXCEPT text — real content width
// varies row-to-row, so text is measured directly for every occurrence, the
// same way it already is for sampled items, never geometrically
// approximated. This is a shallow (non-recursive-into-containers) scan: it
// covers the shapes a repeat item actually takes in this codebase's
// fixtures — the item itself is the text leaf (e.g. a plain `<li>` row), or
// the item is a container whose direct children are text leaves (e.g. a
// `<tr>` of `<td>` cells) — without walking arbitrarily deep, which would
// defeat the point of sampling in the first place.
function measureShallowTextBones(el) {
  if (hasDirectText(el)) return [measureTextLines(el)];
  return Array.from(el.children)
    .filter((child) => hasDirectText(child))
    .map((child) => measureTextLines(child));
}
