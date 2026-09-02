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
});
