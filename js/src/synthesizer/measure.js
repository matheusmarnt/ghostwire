export function measure(host, candidates) {
  const hostRect = host.el.getBoundingClientRect();
  const hostStyle = window.getComputedStyle(host.el);

  const results = candidates.map((candidate) => {
    const style = window.getComputedStyle(candidate.el);
    const entry = {
      el: candidate.el,
      type: candidate.type,
      depth: candidate.depth,
      rect: candidate.el.getBoundingClientRect(),
      visibility: style.visibility,
      transform: style.transform,
    };
    if (candidate.type === 'text') entry.lineRects = measureTextLines(candidate.el);
    if (candidate.type === 'media') entry.borderRadius = style.borderRadius;
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
