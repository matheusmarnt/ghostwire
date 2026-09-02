export function emit(host, measured, rowsHint) {
  if (isNonAxisAligned(measured.hostTransform)) return null; // SPEC-SYN-16: degrade to freeze

  const bones = [];
  const templatesByGroup = new Map(); // "groupId:index" -> Bone[]

  for (const entry of measured.results) {
    if (entry.type === 'repeat-extra') continue; // handled in the second pass, once every template is collected
    if (!isVisible(entry)) continue; // SPEC-SYN-12
    if (!rectIntersectsHost(entry.rect, entry.clipRect || measured.hostRect)) continue; // SPEC-SYN-12/14
    if (isNonAxisAligned(entry.transform)) continue; // SPEC-SYN-16: skip just this one bone

    const produced = [];
    if (entry.type === 'text') {
      const lines = (entry.lineRects || []).filter((r) => r.width > 0 && r.height > 0);
      for (const rect of lines) produced.push(toBone('text', rect, measured.hostRect));
    } else if (entry.type === 'block') {
      produced.push(toBone('block', entry.rect, measured.hostRect)); // SPEC-SYN-13
    } else {
      const type = entry.type === 'media' && isAvatar(entry) ? 'avatar' : entry.type;
      produced.push(toBone(type, entry.rect, measured.hostRect));
    }

    bones.push(...produced);
    if (entry.repeatGroup) {
      const key = `${entry.repeatGroup.id}:${entry.repeatGroup.index}`;
      if (!templatesByGroup.has(key)) templatesByGroup.set(key, []);
      templatesByGroup.get(key).push(...produced);
    }
  }

  // SPEC-SYN-11: clone the sampled template's bones for every unsampled
  // sibling, translated by the real measured pitch — preserving both the
  // real item count and real spacing without individually walking them.
  for (const entry of measured.results) {
    if (entry.type !== 'repeat-extra') continue;
    const key = `${entry.repeatGroup.id}:${entry.repeatGroup.index}`;
    const template = templatesByGroup.get(key);
    if (!template || template.length === 0) continue; // the sampled item produced no bones: nothing to clone

    const clip = relativeClip(entry.clipRect || measured.hostRect, measured.hostRect);
    for (let k = 1; k <= entry.repeat.count; k++) {
      const dx = entry.repeat.pitch.x * k;
      const dy = entry.repeat.pitch.y * k;
      for (const templateBone of template) {
        const bone = { type: templateBone.type, x: templateBone.x + dx, y: templateBone.y + dy, width: templateBone.width, height: templateBone.height };
        if (relativeRectIntersects(bone, clip)) bones.push(bone); // SPEC-SYN-14
      }
    }
  }

  if (bones.length > 0) return bones;
  if (rowsHint > 0) return syntheticRows(measured.hostRect, rowsHint); // SPEC-SYN-17
  return null; // SPEC-SYN-17: empty host, no hint -> degrade to freeze
}

function relativeClip(clipRect, hostRect) {
  return {
    left: clipRect.left - hostRect.left,
    top: clipRect.top - hostRect.top,
    right: clipRect.right - hostRect.left,
    bottom: clipRect.bottom - hostRect.top,
  };
}

function relativeRectIntersects(bone, clip) {
  return bone.x + bone.width > clip.left && bone.x < clip.right &&
    bone.y + bone.height > clip.top && bone.y < clip.bottom;
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
