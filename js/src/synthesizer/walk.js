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

const REPEAT_MIN_RUN = 3; // SPEC-SYN-11: "≥ 3 ocorrências"
const REPEAT_HEIGHT_TOLERANCE = 0.15; // relative height variance allowed before a same-tag/class run is judged non-uniform and walked in full — protects fixtures like the M2 CardGrid, whose cards deliberately have unequal heights

export function collectAndClassify(host, registry, maxDepth = 12, repeatSampleSize = 3) {
  const candidates = [];
  const state = { groupSeq: 0 };
  visit(host.el, registry, candidates, 0, maxDepth, repeatSampleSize, state, null, host.el);
  return candidates;
}

// SPEC-SYN-13: depth and candidate-count are both hard-capped; exceeding
// either degrades to one aggregated 'block' bone (see the count-cap branch
// below: gated by out.capped so at most one is ever pushed, sized to the
// whole host via rootEl — this is the Task 1 fix, preserved here).
// SPEC-SYN-11: a run of >= REPEAT_MIN_RUN uniform-height siblings sharing a
// tag+class signature is sampled instead of walked in full.
function visit(node, registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl) {
  const children = [];
  for (const child of node.children) {
    if (registry.hostFor(child)) continue; // SPEC-API-03: nested wire:ghost host is a boundary
    if (child.getAttribute('aria-hidden') === 'true') continue;
    children.push(child);
  }

  let i = 0;
  while (i < children.length) {
    if (out.length >= MAX_CANDIDATES) {
      if (!out.capped) {
        out.push({ type: 'block', el: rootEl, depth: 0 });
        out.capped = true;
      }
      return;
    }

    const runLength = matchingRunLength(children, i);
    // Nested repeat detection is deliberately disabled while already inside a
    // sampled repeat item (repeatGroup is set): a repeat-of-repeats is rare,
    // and tagging every candidate with only its innermost group keeps the
    // clone step in emit.js (a later task) simple. A nested run in that
    // position is just walked in full instead of being sampled again.
    if (!repeatGroup && runLength >= REPEAT_MIN_RUN && isUniformHeightRun(children, i, runLength)) {
      const groupId = state.groupSeq++;
      const sampleSize = Math.min(repeatSampleSize, runLength);
      for (let s = 0; s < sampleSize; s++) {
        processChild(children[i + s], registry, out, depth, maxDepth, repeatSampleSize, state, { id: groupId, index: s }, rootEl);
      }
      const extraCount = runLength - sampleSize;
      if (extraCount > 0) {
        out.push({
          type: 'repeat-extra',
          el: children[i + sampleSize - 1],
          depth,
          repeatGroup: { id: groupId, index: sampleSize - 1 },
          repeatExtra: { count: extraCount, sampleEls: children.slice(i, i + sampleSize) },
        });
      }
      i += runLength;
      continue;
    }

    processChild(children[i], registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl);
    i += 1;
  }
}

function processChild(child, registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl) {
  const type = classify(child);
  if (type === 'container') {
    if (depth < maxDepth) {
      visit(child, registry, out, depth + 1, maxDepth, repeatSampleSize, state, repeatGroup, rootEl);
    } else {
      const block = { type: 'block', el: child, depth: depth + 1 }; // SPEC-SYN-13
      if (repeatGroup) block.repeatGroup = repeatGroup;
      out.push(block);
    }
    return;
  }
  if (type === null) return;
  const candidate = { el: child, type, depth };
  if (repeatGroup) candidate.repeatGroup = repeatGroup;
  out.push(candidate);
}

function matchingRunLength(children, start) {
  const signature = siblingSignature(children[start]);
  let end = start + 1;
  while (end < children.length && siblingSignature(children[end]) === signature) end++;
  return end - start;
}

function siblingSignature(el) {
  return `${el.tagName}.${normalizeClassName(el.className)}`;
}

function normalizeClassName(className) {
  return String(className).trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

// SPEC-SYN-11 sampling is only safe when the run is visually uniform — two
// same-tag/same-class siblings can still render at very different heights
// (e.g. a card whose body text wraps to more lines than its neighbor's).
// This is a deliberate, bounded exception to "layout reads live only in
// measure.js": reading a run's heights up front is strictly cheaper than the
// alternative (walking and fully measuring every sibling individually), and
// it happens before any DOM write anywhere in the pipeline, so SPEC-SYN-01's
// read-before-write ordering still holds.
function isUniformHeightRun(children, start, runLength) {
  let min = Infinity;
  let max = 0;
  for (let k = 0; k < runLength; k++) {
    const height = children[start + k].getBoundingClientRect().height;
    if (height < min) min = height;
    if (height > max) max = height;
  }
  if (max === 0) return false;
  return (max - min) / max <= REPEAT_HEIGHT_TOLERANCE;
}
