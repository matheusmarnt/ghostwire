import { hasDirectText } from './walk.js';

export function measure(host, candidates) {
  const hostRect = host.el.getBoundingClientRect();
  const hostStyle = window.getComputedStyle(host.el);
  const clipCache = new Map(); // ancestor element -> clip info, scoped to this measure() call only

  const results = candidates.map((candidate) => {
    const style = window.getComputedStyle(candidate.el);
    const entry = {
      el: candidate.el,
      type: candidate.type,
      depth: candidate.depth,
      rect: candidate.el.getBoundingClientRect(),
      visibility: style.visibility,
      transform: style.transform,
      clipRect: computeClipRect(candidate.el, host.el, hostRect, clipCache),
    };
    if (candidate.repeatGroup) entry.repeatGroup = candidate.repeatGroup;
    if (candidate.type === 'text') entry.lineRects = measureTextLines(candidate.el);
    if (candidate.type === 'media') entry.borderRadius = style.borderRadius;
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

// SPEC-SYN-14: a scrollable or otherwise clipping ancestor between a
// candidate and its host hides content outside its own box even though
// getBoundingClientRect() still reports the (scrolled-out) coordinates.
// Walk the plain DOM chain — no recursion, cheap — intersecting every such
// ancestor's own rect into the host's, so emit() can exclude bones for
// content the user cannot actually see.
function computeClipRect(el, hostEl, hostRect, cache) {
  let clip = hostRect;
  let ancestor = el.parentElement;
  while (ancestor && ancestor !== hostEl) {
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

// SPEC-SYN-11: pitch is the real measured spacing between the last two
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

// SPEC-SYN-11/SPEC-SYN-10: a cloned repeat bone approximates a repeat item's
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
