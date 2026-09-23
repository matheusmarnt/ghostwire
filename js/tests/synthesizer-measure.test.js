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

  it('computes a clipRect equal to the host rect when no ancestor clips', () => {
    const host = makeHost();
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    host.el.appendChild(p);

    const measured = measure(host, [{ el: p, type: 'text', depth: 1 }]);

    expect(measured.results[0].clipRect).toEqual(host.el.getBoundingClientRect());
  });

  it('intersects clipRect with a scrollable ancestor between the candidate and the host', () => {
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

  it('measures pitch and item rect for a repeat-extra candidate', () => {
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
      repeatExtra: { count: 4, sampleEls: items, extraEls: [] },
    }]);

    expect(measured.results[0].repeat.count).toBe(4);
    expect(measured.results[0].repeat.pitch).toEqual({ x: 0, y: 20 });
    expect(measured.results[0].repeatGroup).toEqual({ id: 0, index: 2 });
  });

  it('measures real text line rects for a repeat-extra whose item itself is the text leaf', () => {
    const host = makeHost();
    const sampleEls = [0, 1, 2].map((i) => {
      const li = document.createElement('li');
      li.textContent = `Item ${i}`;
      li.getBoundingClientRect = () => ({ top: i * 20, left: 0, right: 100, bottom: i * 20 + 18, width: 100, height: 18 });
      host.el.appendChild(li);
      return li;
    });
    const extraLi = document.createElement('li');
    extraLi.textContent = 'Extra item with a longer label';
    extraLi.getBoundingClientRect = () => ({ top: 60, left: 0, right: 100, bottom: 78, width: 100, height: 18 });
    host.el.appendChild(extraLi);

    const extraRect = { top: 60, left: 0, right: 140, bottom: 78, width: 140, height: 18 };
    vi.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: () => {},
      getClientRects: () => [extraRect],
    });

    const measured = measure(host, [{
      type: 'repeat-extra',
      el: extraLi,
      depth: 1,
      repeatGroup: { id: 0, index: 2 },
      repeatExtra: { count: 1, sampleEls, extraEls: [extraLi] },
    }]);

    expect(measured.results[0].repeat.extraTextBones).toEqual([[[extraRect]]]);
  });

  it('measures real text line rects per cell for a repeat-extra whose item is a container of text-leaf children', () => {
    const host = makeHost();
    const sampleEls = [0, 1, 2].map((i) => {
      const row = document.createElement('tr');
      row.getBoundingClientRect = () => ({ top: i * 20, left: 0, right: 100, bottom: i * 20 + 18, width: 100, height: 18 });
      host.el.appendChild(row);
      return row;
    });
    const extraRow = document.createElement('tr');
    extraRow.getBoundingClientRect = () => ({ top: 60, left: 0, right: 100, bottom: 78, width: 100, height: 18 });
    const cellA = document.createElement('td');
    cellA.textContent = 'Ada Lovelace';
    const cellB = document.createElement('td');
    cellB.textContent = 'ada@example.test';
    extraRow.appendChild(cellA);
    extraRow.appendChild(cellB);
    host.el.appendChild(extraRow);

    const rectA = [{ top: 60, left: 0, right: 80, bottom: 78, width: 80, height: 18 }];
    const rectB = [{ top: 60, left: 80, right: 180, bottom: 78, width: 100, height: 18 }];
    let call = 0;
    vi.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents: () => {},
      getClientRects: () => (call++ === 0 ? rectA : rectB),
    }));

    const measured = measure(host, [{
      type: 'repeat-extra',
      el: extraRow,
      depth: 1,
      repeatGroup: { id: 0, index: 2 },
      repeatExtra: { count: 1, sampleEls, extraEls: [extraRow] },
    }]);

    expect(measured.results[0].repeat.extraTextBones).toEqual([[rectA, rectB]]);
  });

  it('uses the given regionRect as hostRect instead of host.el.getBoundingClientRect() when provided', () => {
    const host = { el: document.createElement('div') };
    document.body.appendChild(host.el);
    const regionRect = { top: 10, left: 20, width: 100, height: 50, right: 120, bottom: 60 };

    const result = measure(host, [], regionRect);

    expect(result.hostRect).toBe(regionRect);
  });

  it('falls back to host.el.getBoundingClientRect() when no regionRect is given (unchanged default behavior)', () => {
    const host = { el: document.createElement('div') };
    document.body.appendChild(host.el);

    const result = measure(host, []);

    expect(result.hostRect).toEqual(host.el.getBoundingClientRect());
  });

  // An island-scoped candidate is a SIBLING of the
  // host, not a descendant, so the clip walk would never reach host.el and
  // would run all the way to <html>, folding an app shell's own
  // `overflow: hidden` into every island bone and dropping the ones currently
  // scrolled out of view. The island's container is the correct ceiling.
  it('stops the clip walk at clipRootEl, so an island-scoped candidate is not clipped by ancestors above the island', () => {
    const host = makeHost(); // host.el is a sibling of the island content, not its parent

    const appShell = document.createElement('div'); // stands in for a page shell with overflow:hidden
    appShell.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40 });
    const islandContainer = document.createElement('div');
    const p = document.createElement('p');
    p.getBoundingClientRect = () => ({ top: 60, left: 10, right: 90, bottom: 80, width: 80, height: 20 }); // below appShell's box
    islandContainer.appendChild(p);
    appShell.appendChild(islandContainer);
    document.body.appendChild(appShell);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === appShell) return { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const regionRect = { top: 50, left: 0, right: 200, bottom: 100, width: 200, height: 50 };
    const candidates = [{ el: p, type: 'text', depth: 0 }];

    const scoped = measure(host, candidates, regionRect, islandContainer);
    expect(scoped.results[0].clipRect).toEqual(regionRect); // ceiling honored — appShell never intersected

    // Without the ceiling the walk escapes past the island and appShell clips
    // the bone away entirely — the bug this parameter exists to prevent.
    const unbounded = measure(host, candidates, regionRect);
    expect(unbounded.results[0].clipRect.bottom).toBe(40);
    expect(unbounded.results[0].clipRect.height).toBe(0);
  });
});

// Issue #21: a resize re-synthesis runs while the skeleton is
// showing, i.e. with .gw-concealed on host.el. Its `visibility: hidden` is
// inherited by every candidate, and the filter would drop them
// all — the host would degrade to freeze on every resize. Hidden-ness that
// comes from Ghostwire's own concealment is not the author's and must not
// count; an author's own visibility: hidden on a non-concealed host must.
describe('visibility under Ghostwire\'s own concealment (issue #21)', () => {
  let style;

  beforeEach(() => {
    document.body.innerHTML = '';
    style = document.createElement('style');
    style.textContent = '.gw-concealed { visibility: hidden; } .author-hidden { visibility: hidden; }';
    document.head.appendChild(style);
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [{ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 }];
    }
  });

  afterEach(() => { style.remove(); });

  function hostWith(html, hostClass = '') {
    const el = document.createElement('div');
    el.className = hostClass;
    el.innerHTML = html;
    el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100 });
    document.body.appendChild(el);
    for (const child of el.querySelectorAll('*')) {
      child.getBoundingClientRect = () => ({ top: 10, left: 10, right: 90, bottom: 30, width: 80, height: 20 });
    }
    return { el, config: {} };
  }

  it('records a candidate hidden only by the host\'s .gw-concealed as visible', () => {
    const host = hostWith('<p>Hello world</p>', 'gw-concealed');
    const candidates = [{ el: host.el.firstElementChild, type: 'text', depth: 0 }];
    expect(window.getComputedStyle(host.el.firstElementChild).visibility).toBe('hidden'); // precondition: jsdom really inherits it

    const measured = measure(host, candidates);

    expect(measured.results[0].visibility).toBe('visible');
  });

  it('records a candidate hidden by a concealed ANCESTOR host as visible too (nested hosts)', () => {
    const outer = hostWith('<div id="inner"><p>Nested</p></div>', 'gw-concealed');
    const innerEl = outer.el.querySelector('#inner');
    const inner = { el: innerEl, config: {} };
    const candidates = [{ el: innerEl.firstElementChild, type: 'text', depth: 0 }];

    const measured = measure(inner, candidates);

    expect(measured.results[0].visibility).toBe('visible');
  });

  it('still records an author\'s own visibility: hidden on a host that is not concealed', () => {
    const host = hostWith('<p class="author-hidden">Hidden by the app</p>');
    const candidates = [{ el: host.el.firstElementChild, type: 'text', depth: 0 }];

    const measured = measure(host, candidates);

    expect(measured.results[0].visibility).toBe('hidden');
  });
});

describe('synthesizer/measure — panel detection', () => {
  it('marks a container candidate isPanel when its background alpha meets the 0.05 floor', () => {
    const host = makeHost();
    host.config = { panels: true };
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === card) return { backgroundColor: 'rgba(0, 0, 0, 0.05)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', boxShadow: 'none', borderRadius: '0px', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].isPanel).toBe(true);
  });

  it('does not mark isPanel when background alpha is below the 0.05 floor and there is no border/shadow', () => {
    const host = makeHost();
    host.config = { panels: true };
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === card) return { backgroundColor: 'rgba(0, 0, 0, 0.02)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', boxShadow: 'none', borderRadius: '0px', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].isPanel).toBe(false);
  });

  it('marks isPanel via border width alone, transparent background', () => {
    const host = makeHost();
    host.config = { panels: true };
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === card) return { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '1px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', boxShadow: 'none', borderRadius: '0px', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].isPanel).toBe(true);
  });

  it('marks isPanel via box-shadow alone, transparent background, no border', () => {
    const host = makeHost();
    host.config = { panels: true };
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === card) return { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', borderRadius: '0px', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].isPanel).toBe(true);
  });

  it('does not compute isPanel at all for a container when panels is disabled', () => {
    const host = makeHost();
    host.config = {};
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].isPanel).toBeUndefined();
  });

  it('captures the computed border-radius on a promoted panel candidate', () => {
    const host = makeHost();
    host.config = { panels: true };
    const card = document.createElement('div');
    card.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 50, width: 100, height: 50 });
    host.el.appendChild(card);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === card) return { backgroundColor: 'rgb(255, 255, 255)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', boxShadow: 'none', borderRadius: '12px', transform: 'none', visibility: 'visible' };
      return { overflow: 'visible', overflowX: 'visible', overflowY: 'visible', transform: 'none', visibility: 'visible' };
    });

    const measured = measure(host, [{ el: card, type: 'container', depth: 1 }]);

    expect(measured.results[0].borderRadius).toBe('12px');
  });
});
