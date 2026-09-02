import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { measure } from '../src/synthesizer/measure.js';

function makeHost() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
  return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
}

describe('synthesizer/measure', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('captures host rect, host transform, and per-candidate rect/visibility/transform', () => {
    const host = makeHost();
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    host.el.appendChild(p);

    const measured = measure(host, [{ el: p, type: 'text', depth: 1 }]);

    expect(measured.hostRect.width).toBe(200);
    expect(measured.results).toHaveLength(1);
    expect(measured.results[0].rect.width).toBe(80);
    expect(measured.results[0].visibility).toBe('visible');
    expect(measured.results[0].type).toBe('text');
  });

  it('reads borderRadius only for media candidates', () => {
    const host = makeHost();
    const img = document.createElement('img');
    img.getBoundingClientRect = () => ({ top: 0, left: 0, right: 40, bottom: 40, width: 40, height: 40 });
    img.style.borderRadius = '20px';
    host.el.appendChild(img);
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 });
    host.el.appendChild(p);

    const measured = measure(host, [
      { el: img, type: 'media', depth: 1 },
      { el: p, type: 'text', depth: 1 },
    ]);

    expect(measured.results[0].borderRadius).toBe('20px');
    expect(measured.results[1].borderRadius).toBeUndefined();
  });

  it('collects line rects for text candidates via Range, one entry per direct text node', () => {
    const host = makeHost();
    const p = document.createElement('p');
    p.textContent = 'two lines of text';
    p.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 });
    host.el.appendChild(p);
    const fakeRects = [
      { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 },
      { top: 20, left: 0, right: 40, bottom: 40, width: 40, height: 20 },
    ];
    vi.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: () => {},
      getClientRects: () => fakeRects,
    });

    const measured = measure(host, [{ el: p, type: 'text', depth: 1 }]);

    expect(measured.results[0].lineRects).toEqual(fakeRects);
  });

  it('skips text nodes that are whitespace-only when collecting line rects', () => {
    const host = makeHost();
    const p = document.createElement('p');
    p.appendChild(document.createTextNode('   '));
    p.getBoundingClientRect = () => ({ top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 });
    host.el.appendChild(p);
    const spy = vi.spyOn(document, 'createRange');

    const measured = measure(host, [{ el: p, type: 'text', depth: 1 }]);

    expect(spy).not.toHaveBeenCalled();
    expect(measured.results[0].lineRects).toEqual([]);
  });

  it('computes a clipRect equal to the host rect when no ancestor clips (SPEC-SYN-14)', () => {
    const host = makeHost();
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    host.el.appendChild(p);

    const measured = measure(host, [{ el: p, type: 'text', depth: 1 }]);

    expect(measured.results[0].clipRect).toEqual(host.el.getBoundingClientRect());
  });

  it('intersects clipRect with a scrollable ancestor between the candidate and the host (SPEC-SYN-14)', () => {
    const host = makeHost();
    const scrollBox = document.createElement('div');
    scrollBox.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 50, width: 200, height: 50 });
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === scrollBox) return { overflow: 'auto', overflowX: 'auto', overflowY: 'auto', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });
    host.el.appendChild(scrollBox);
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 60, left: 10, right: 90, bottom: 80, width: 80, height: 20 }); // scrolled below scrollBox's own visible box
    scrollBox.appendChild(p);

    const measured = measure(host, [{ el: p, type: 'text', depth: 2 }]);

    expect(measured.results[0].clipRect.bottom).toBe(50); // clamped to the scrollable ancestor's own bottom edge
  });

  it('SPEC-SYN-11: measures pitch and item rect for a repeat-extra candidate', () => {
    const host = makeHost();
    const items = [0, 1, 2].map((i) => {
      const el = document.createElement('div');
      el.getBoundingClientRect = () => ({ top: i * 20, left: 0, right: 100, bottom: i * 20 + 18, width: 100, height: 18 });
      host.el.appendChild(el);
      return el;
    });

    const measured = measure(host, [{
      type: 'repeat-extra',
      el: items[2],
      depth: 1,
      repeatGroup: { id: 0, index: 2 },
      repeatExtra: { count: 4, sampleEls: items },
    }]);

    expect(measured.results[0].repeat.count).toBe(4);
    expect(measured.results[0].repeat.pitch).toEqual({ x: 0, y: 20 });
    expect(measured.results[0].repeatGroup).toEqual({ id: 0, index: 2 });
  });
});
