import { describe, it, expect } from 'vitest';
import { emit, isNonAxisAligned, isAvatar, rectIntersectsHost, toBone, syntheticRows } from '../src/synthesizer/emit.js';

const HOST_RECT = { top: 100, left: 50, right: 350, bottom: 300, width: 300, height: 200 };

function baseMeasured(results, hostTransform = 'none') {
  return { hostRect: HOST_RECT, hostTransform, results };
}

describe('synthesizer/emit — pure helpers', () => {
  it('isNonAxisAligned: none/identity matrix is axis-aligned', () => {
    expect(isNonAxisAligned('none')).toBe(false);
    expect(isNonAxisAligned('matrix(1, 0, 0, 1, 10, 20)')).toBe(false); // pure translate
    expect(isNonAxisAligned('matrix(2, 0, 0, 2, 0, 0)')).toBe(false); // pure scale
  });

  it('isNonAxisAligned: rotation/skew matrix (nonzero b or c) is not axis-aligned', () => {
    expect(isNonAxisAligned('matrix(0.7071, 0.7071, -0.7071, 0.7071, 0, 0)')).toBe(true);
  });

  it('isNonAxisAligned: matrix3d is conservatively treated as non-axis-aligned', () => {
    expect(isNonAxisAligned('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)')).toBe(true);
  });

  it('isAvatar: square media with radius >= half its size is an avatar', () => {
    expect(isAvatar({ rect: { width: 40, height: 40 }, borderRadius: '20px' })).toBe(true);
  });

  it('isAvatar: rectangular media is not an avatar even with large radius', () => {
    expect(isAvatar({ rect: { width: 100, height: 40 }, borderRadius: '20px' })).toBe(false);
  });

  it('isAvatar: square media with small radius is not an avatar', () => {
    expect(isAvatar({ rect: { width: 40, height: 40 }, borderRadius: '4px' })).toBe(false);
  });

  it('isAvatar: large square media (>100px) with a "50%" radius is an avatar (SPEC-SYN percentage fix)', () => {
    expect(isAvatar({ rect: { width: 150, height: 150 }, borderRadius: '50%' })).toBe(true);
  });

  it('isAvatar: square media with a small percentage radius is not an avatar', () => {
    expect(isAvatar({ rect: { width: 150, height: 150 }, borderRadius: '10%' })).toBe(false);
  });

  it('rectIntersectsHost: true when the rect overlaps the host rect', () => {
    expect(rectIntersectsHost({ top: 110, left: 60, right: 100, bottom: 130 }, HOST_RECT)).toBe(true);
  });

  it('rectIntersectsHost: false when the rect is entirely outside the host rect', () => {
    expect(rectIntersectsHost({ top: 0, left: 0, right: 10, bottom: 10 }, HOST_RECT)).toBe(false);
  });

  it('toBone: converts a viewport rect to host-relative coordinates', () => {
    const bone = toBone('text', { left: 60, top: 110, width: 80, height: 20 }, HOST_RECT);
    expect(bone).toEqual({ type: 'text', x: 10, y: 10, width: 80, height: 20 });
  });

  it('syntheticRows: produces N stacked bones spanning the host width', () => {
    const rows = syntheticRows(HOST_RECT, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].width).toBe(300);
    expect(rows[1].y).toBeGreaterThan(rows[0].y);
  });
});

describe('synthesizer/emit — emit()', () => {
  it('returns null (degrade) when the host itself is rotated/skewed (SPEC-SYN-16)', () => {
    const measured = baseMeasured([], 'matrix(0.7071, 0.7071, -0.7071, 0.7071, 0, 0)');
    expect(emit({}, measured, 0)).toBeNull();
  });

  it('drops a bone for a rotated descendant but keeps axis-aligned ones (SPEC-SYN-16)', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 110, left: 60, right: 160, bottom: 140, width: 100, height: 30 }, visibility: 'visible', transform: 'matrix(0.7071, 0.7071, -0.7071, 0.7071, 0, 0)' },
      { type: 'control', rect: { top: 150, left: 60, right: 160, bottom: 180, width: 100, height: 30 }, visibility: 'visible', transform: 'none' },
    ]);
    const bones = emit({}, measured, 0);
    expect(bones).toHaveLength(1);
    expect(bones[0].y).toBe(50);
  });

  it('skips hidden and zero-size candidates (SPEC-SYN-12)', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 110, left: 60, right: 160, bottom: 140, width: 100, height: 30 }, visibility: 'hidden', transform: 'none' },
      { type: 'control', rect: { top: 110, left: 60, right: 60, bottom: 140, width: 0, height: 30 }, visibility: 'visible', transform: 'none' },
    ]);
    expect(emit({}, measured, 0)).toBeNull();
  });

  it('skips candidates entirely outside the host rect (SPEC-SYN-12)', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 }, visibility: 'visible', transform: 'none' },
    ]);
    expect(emit({}, measured, 0)).toBeNull();
  });

  it('expands text candidates into one bone per line rect (SPEC-SYN-10)', () => {
    const measured = baseMeasured([
      {
        type: 'text',
        rect: { top: 110, left: 60, right: 260, bottom: 150, width: 200, height: 40 },
        visibility: 'visible',
        transform: 'none',
        lineRects: [
          { top: 110, left: 60, right: 260, bottom: 130, width: 200, height: 20 },
          { top: 130, left: 60, right: 140, bottom: 150, width: 80, height: 20 },
        ],
      },
    ]);
    const bones = emit({}, measured, 0);
    expect(bones).toHaveLength(2);
    expect(bones[1].width).toBe(80);
  });

  it('reclassifies square high-radius media as avatar', () => {
    const measured = baseMeasured([
      { type: 'media', rect: { top: 110, left: 60, right: 100, bottom: 150, width: 40, height: 40 }, visibility: 'visible', transform: 'none', borderRadius: '20px' },
    ]);
    const bones = emit({}, measured, 0);
    expect(bones[0].type).toBe('avatar');
  });

  it('SPEC-SYN-17: empty host with a rows hint synthesizes N placeholder rows', () => {
    const measured = baseMeasured([]);
    const bones = emit({}, measured, 4);
    expect(bones).toHaveLength(4);
    expect(bones.every((b) => b.type === 'text')).toBe(true);
  });

  it('SPEC-SYN-17: empty host with no hint returns null (degrade to freeze)', () => {
    const measured = baseMeasured([]);
    expect(emit({}, measured, 0)).toBeNull();
  });

  it('SPEC-SYN-13: emits a plain bone for a block-aggregated candidate', () => {
    const measured = baseMeasured([
      { type: 'block', rect: { top: 110, left: 60, right: 260, bottom: 200, width: 200, height: 90 }, visibility: 'visible', transform: 'none' },
    ]);
    const bones = emit({}, measured, 0);
    expect(bones).toHaveLength(1);
    expect(bones[0].type).toBe('block');
  });

  it('SPEC-SYN-14: excludes a candidate outside its own clipRect even though it is inside the host rect', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 250, left: 60, right: 160, bottom: 280, width: 100, height: 30 }, visibility: 'visible', transform: 'none', clipRect: { top: 100, left: 50, right: 350, bottom: 200 } },
    ]);
    expect(emit({}, measured, 0)).toBeNull();
  });

  it('SPEC-SYN-11: clones the last sampled item bones for each repeat-extra occurrence, translated by the measured pitch', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 110, left: 60, right: 160, bottom: 140, width: 100, height: 30 }, visibility: 'visible', transform: 'none', repeatGroup: { id: 0, index: 2 } },
      { type: 'repeat-extra', rect: { top: 110, left: 60, right: 160, bottom: 140, width: 100, height: 30 }, visibility: 'visible', transform: 'none', clipRect: HOST_RECT, repeatGroup: { id: 0, index: 2 }, repeat: { count: 2, pitch: { x: 0, y: 30 } } },
    ]);

    const bones = emit({}, measured, 0);

    expect(bones).toHaveLength(3); // 1 template bone + 2 clones
    expect(bones[1].y).toBe(bones[0].y + 30);
    expect(bones[2].y).toBe(bones[0].y + 60);
  });

  it('SPEC-SYN-11/14: cloned repeat-extra bones outside the clipRect are excluded', () => {
    const measured = baseMeasured([
      { type: 'control', rect: { top: 280, left: 60, right: 160, bottom: 298, width: 100, height: 18 }, visibility: 'visible', transform: 'none', repeatGroup: { id: 0, index: 2 } },
      { type: 'repeat-extra', rect: { top: 280, left: 60, right: 160, bottom: 298, width: 100, height: 18 }, visibility: 'visible', transform: 'none', clipRect: HOST_RECT, repeatGroup: { id: 0, index: 2 }, repeat: { count: 3, pitch: { x: 0, y: 18 } } },
    ]);

    const bones = emit({}, measured, 0);

    // HOST_RECT is { top: 100, left: 50, right: 350, bottom: 300 }, i.e. a
    // host-relative clip bottom of 200. Template bone: relative y=180,
    // height=18 (intersects, top=180<200). Clone k=1: y=198 (still
    // intersects, top=198<200). Clone k=2: y=216 (216 is not < 200: fully
    // past the clip, excluded). Clone k=3: y=234 (also excluded).
    expect(bones).toHaveLength(2);
    expect(bones[0].y).toBe(180); // the template bone itself, untranslated
    expect(bones[1].y).toBe(198); // exactly clone k=1, not k=2 or k=3 — proves the clip boundary, not just a coincidental count
  });

  it('SPEC-SYN-11: a repeat-extra with no template bones (e.g. an empty sampled item) clones nothing', () => {
    const measured = baseMeasured([
      { type: 'repeat-extra', rect: { top: 110, left: 60, right: 160, bottom: 140, width: 100, height: 30 }, visibility: 'visible', transform: 'none', clipRect: HOST_RECT, repeatGroup: { id: 0, index: 2 }, repeat: { count: 2, pitch: { x: 0, y: 30 } } },
    ]);
    expect(emit({}, measured, 0)).toBeNull();
  });
});
