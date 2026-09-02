export function emit(host, measured, rowsHint) {
  if (isNonAxisAligned(measured.hostTransform)) return null; // SPEC-SYN-16: degrade to freeze

  const bones = [];
  for (const entry of measured.results) {
    if (!isVisible(entry)) continue; // SPEC-SYN-12
    if (!rectIntersectsHost(entry.rect, measured.hostRect)) continue; // SPEC-SYN-12
    if (isNonAxisAligned(entry.transform)) continue; // SPEC-SYN-16: skip just this one bone

    if (entry.type === 'text') {
      const lines = (entry.lineRects || []).filter((r) => r.width > 0 && r.height > 0);
      for (const rect of lines) bones.push(toBone('text', rect, measured.hostRect));
      continue;
    }

    const type = entry.type === 'media' && isAvatar(entry) ? 'avatar' : entry.type;
    bones.push(toBone(type, entry.rect, measured.hostRect));
  }

  if (bones.length > 0) return bones;
  if (rowsHint > 0) return syntheticRows(measured.hostRect, rowsHint); // SPEC-SYN-17
  return null; // SPEC-SYN-17: empty host, no hint -> degrade to freeze
}

function isVisible(entry) {
  return entry.visibility !== 'hidden' && entry.rect.width > 0 && entry.rect.height > 0;
}

export function rectIntersectsHost(rect, hostRect) {
  return rect.right > hostRect.left && rect.left < hostRect.right &&
    rect.bottom > hostRect.top && rect.top < hostRect.bottom;
}

export function toBone(type, rect, hostRect) {
  return {
    type,
    x: rect.left - hostRect.left,
    y: rect.top - hostRect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function isAvatar(entry) {
  const { width, height } = entry.rect;
  if (width === 0 || height === 0) return false;
  const aspectDelta = Math.abs(width - height) / Math.max(width, height);
  const radius = entry.borderRadius || '';
  const isCircular = radius.trim().endsWith('%')
    ? parseFloat(radius) >= 50
    : parseFloat(radius) >= Math.min(width, height) / 2;
  return aspectDelta < 0.1 && isCircular;
}

export function isNonAxisAligned(transformValue) {
  if (!transformValue || transformValue === 'none') return false;
  if (transformValue.startsWith('matrix3d')) return true; // conservative: full 3D matrix, degrade
  const match = transformValue.match(/^matrix\(([^)]+)\)$/);
  if (!match) return true; // unrecognized form, degrade conservatively
  const [, b, c] = match[1].split(',').map(Number);
  return b !== 0 || c !== 0;
}

export function syntheticRows(hostRect, count) {
  const gap = 8;
  const available = hostRect.height - gap * (count - 1);
  const rowHeight = available > 0 ? available / count : 16;
  const bones = [];
  for (let i = 0; i < count; i++) {
    bones.push({ type: 'text', x: 0, y: i * (rowHeight + gap), width: hostRect.width, height: rowHeight });
  }
  return bones;
}
