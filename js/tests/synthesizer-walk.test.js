import { describe, it, expect, beforeEach } from 'vitest';
import { collectAndClassify, collectAndClassifyRange, classify } from '../src/synthesizer/walk.js';
import { createRegistry } from '../src/registry.js';

function makeHost(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
}

function makeUniformHost(count, tag = 'li', className = 'row') {
  const el = document.createElement('div');
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = `Item ${i}`;
    item.getBoundingClientRect = () => ({ top: i * 24, left: 0, right: 100, bottom: i * 24 + 20, width: 100, height: 20 });
    el.appendChild(item);
    items.push(item);
  }
  document.body.appendChild(el);
  return { host: { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null }, items };
}

describe('synthesizer/walk', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('classify tags media, control, heading, icon by tagName', () => {
    expect(classify(document.createElement('img'))).toBe('media');
    expect(classify(document.createElement('button'))).toBe('control');
    expect(classify(document.createElement('h2'))).toBe('heading');
    expect(classify(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))).toBe('icon');
  });

  it('classify tags [role=button] as control', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'button');
    expect(classify(el)).toBe('control');
  });

  it('classify tags an element with direct non-empty text as text', () => {
    const el = document.createElement('p');
    el.textContent = 'hello';
    expect(classify(el)).toBe('text');
  });

  it('classify tags an element with only element children as container', () => {
    const el = document.createElement('div');
    el.appendChild(document.createElement('span'));
    expect(classify(el)).toBe('container');
  });

  it('classify returns null for an empty leaf (no text, no children)', () => {
    expect(classify(document.createElement('div'))).toBeNull();
  });

  it('collectAndClassify recurses into containers and classifies leaves', () => {
    const host = makeHost('<div><h2>Title</h2><p>Body text</p></div>');
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    expect(candidates.map((c) => c.type)).toEqual(['heading', 'text']);
    expect(candidates[0].depth).toBe(1);
  });

  it('collectAndClassify stops at a nested wire:ghost host', () => {
    const host = makeHost('<div><p>outer</p><section><p>inner</p></section></div>');
    const registry = createRegistry();
    const innerSection = host.el.querySelector('section');
    registry.attach(innerSection, { id: 'c2' }, {});

    const candidates = collectAndClassify(host, registry, 12);

    expect(candidates.some((c) => c.el.textContent === 'inner')).toBe(false);
    expect(candidates.some((c) => c.el.textContent === 'outer')).toBe(true);
  });

  it('collectAndClassify skips aria-hidden elements', () => {
    const host = makeHost('<div><p aria-hidden="true">hidden</p><p>visible</p></div>');
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    expect(candidates.map((c) => c.el.textContent)).toEqual(['visible']);
  });

  it('collectAndClassify degrades to a block bone when maxDepth is exceeded', () => {
    const host = makeHost('<div><div><div><p>deep</p></div></div></div>');
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 1);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('block');
  });

  it('stops at MAX_CANDIDATES without emitting an aggregate block bone', () => {
    const el = document.createElement('div');
    for (let i = 0; i < 1505; i++) {
      const p = document.createElement('p');
      p.textContent = `row ${i}`;
      el.appendChild(p);
    }
    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // The cap trips after exactly 1500 real leaf candidates; the remaining 5
    // children are discarded instead of being flattened into a host-sized
    // block that would paint over the 1500 already collected.
    expect(candidates).toHaveLength(1500);
    expect(candidates[0].type).toBe('text');
    expect(candidates.filter((c) => c.el === host.el)).toHaveLength(0);
  }, 15000);

  it('the count cap discards the un-walked tail instead of covering it with an aggregate block', () => {
    const el = document.createElement('div');
    const a = document.createElement('div'); // container A: fills the cap exactly on its own
    for (let i = 0; i < 1500; i++) {
      const p = document.createElement('p');
      p.textContent = `a-row ${i}`;
      a.appendChild(p);
    }
    el.appendChild(a);
    const b = document.createElement('div'); // sibling of A, never gets individually walked
    const bp = document.createElement('p');
    bp.textContent = 'b-row';
    b.appendChild(bp);
    el.appendChild(b);
    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // No aggregate block at all: A's 1500 children are all present and intact,
    // B's content is simply absent — the cheaper, more-legible tradeoff over
    // a host-sized block that would cover A's real bones.
    expect(candidates.filter((c) => c.type === 'block')).toHaveLength(0);
    expect(candidates).toHaveLength(1500);
    expect(candidates.every((c) => c.el.textContent.startsWith('a-row'))).toBe(true);
    expect(candidates.some((c) => c.el.textContent === 'b-row')).toBe(false);
  }, 15000);

  it('prunes a display:none subtree before it can spend the candidate budget, so a visible block after it is still found', () => {
    const el = document.createElement('div');

    const hidden = document.createElement('div'); // e.g. a mobile-nav duplicate of a responsive header
    hidden.style.display = 'none';
    for (let i = 0; i < 1505; i++) {
      const p = document.createElement('p');
      p.textContent = `hidden row ${i}`;
      hidden.appendChild(p);
    }
    el.appendChild(hidden);

    const visible = document.createElement('div');
    const visibleText = document.createElement('p');
    visibleText.textContent = 'visible content';
    visible.appendChild(visibleText);
    el.appendChild(visible);

    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // Without the display:none prune, the hidden subtree alone (1505
    // candidates) would exhaust MAX_CANDIDATES before the walk ever reaches
    // `visible`, which sits later in the DOM than the hidden block.
    expect(candidates.some((c) => c.el === visibleText)).toBe(true);
    expect(candidates.some((c) => c.el.textContent.startsWith('hidden row'))).toBe(false);
  }, 15000);

  it('does not prune a display:contents wrapper, so its children still appear as candidates (regression guard: a bounding-rect-based check would false-positive here)', () => {
    const el = document.createElement('div');

    const before = document.createElement('p');
    before.textContent = 'before';
    el.appendChild(before);

    const wrapper = document.createElement('div'); // e.g. a @foreach/x-for grouping wrapper with no box of its own
    wrapper.style.display = 'contents';
    const wrapped = document.createElement('p');
    wrapped.textContent = 'wrapped';
    wrapper.appendChild(wrapped);
    el.appendChild(wrapper);

    const after = document.createElement('p');
    after.textContent = 'after';
    el.appendChild(after);

    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // display:contents reports a zero-size bounding rect by spec, exactly
    // like display:none — the two are only distinguishable via computed
    // display, which is why isCollapsed() checks that instead of a rect.
    expect(candidates.map((c) => c.el.textContent)).toEqual(['before', 'wrapped', 'after']);
  });

  // The next three pin that the candidate cap is enforced on candidates
  // actually collected, never on how many raw siblings were scanned. A
  // scan-count cutoff looks equivalent for a flat list of distinct leaves,
  // but silently loses real content whenever siblings and candidates stop
  // being one-to-one: a uniform run costs only a few candidates however many
  // siblings it spans, and some siblings classify as nothing at all.
  it('samples a uniform run far longer than the candidate budget against its full length, not a truncated prefix', () => {
    const { host, items } = makeUniformHost(2000);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    // 3 samples + 1 repeat-extra marker: the cap is nowhere near tripping, so
    // the marker must describe every real row, through to the very last one.
    expect(candidates).toHaveLength(4);
    const extras = candidates.filter((c) => c.type === 'repeat-extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].repeatExtra.count).toBe(1997);
    expect(extras[0].repeatExtra.extraEls).toHaveLength(1997);
    expect(extras[0].repeatExtra.extraEls[1996]).toBe(items[1999]);
  }, 15000);

  it('still collects content that follows a uniform run longer than the candidate budget', () => {
    const { host } = makeUniformHost(1600);
    const footer = document.createElement('p');
    footer.className = 'footer';
    footer.textContent = 'footer';
    host.el.appendChild(footer);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    // The whole 1600-row run costs 4 candidates, leaving ample budget for
    // the footer after it.
    expect(candidates).toHaveLength(5);
    expect(candidates.find((c) => c.type === 'repeat-extra').repeatExtra.count).toBe(1597);
    expect(candidates.some((c) => c.el === footer && c.type === 'text')).toBe(true);
  }, 15000);

  it('siblings that yield no candidate (e.g. <hr> separators) do not shrink how many real candidates the budget admits', () => {
    const el = document.createElement('div');
    for (let i = 0; i < 2000; i++) {
      const item = document.createElement('div');
      item.className = `item item-${i}`; // distinct classes: never sampled as a repeat run, every item walked individually
      item.textContent = `Item ${i}`;
      el.appendChild(item);
      el.appendChild(document.createElement('hr')); // classifies as nothing
    }
    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // 4000 siblings, half of which produce no candidate: the cap still trips
    // on 1500 real items, not after 1500 scanned siblings (750 items).
    expect(candidates).toHaveLength(1500);
    expect(candidates.every((c) => c.type === 'text')).toBe(true);
    expect(candidates[1499].el.textContent).toBe('Item 1499');
  }, 15000);

  it('the depth cap still aggregates per-container, independent of the count cap', () => {
    // Two sibling containers, each nested exactly at maxDepth (maxDepth: 1
    // here, mirroring the single-container depth-cap test above), each with
    // content below that depth. Proves the depth cap is still container-
    // scoped (block.el is each container, not host.el) and unaffected by
    // the count-cap change above.
    const host = makeHost('<div><div><p>deep A</p></div><div><p>deep B</p></div></div>');
    const registry = createRegistry();
    const containerA = host.el.children[0].children[0];
    const containerB = host.el.children[0].children[1];

    const candidates = collectAndClassify(host, registry, 1);

    const blocks = candidates.filter((c) => c.type === 'block');
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.el)).toEqual([containerA, containerB]);
    expect(blocks.every((b) => b.depth === 2)).toBe(true);
  });

  it('samples the first repeatSampleSize items of a uniform run of >= 3 siblings', () => {
    const { host } = makeUniformHost(6);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    const sampled = candidates.filter((c) => c.type === 'text' && c.repeatGroup);
    const extras = candidates.filter((c) => c.type === 'repeat-extra');
    expect(sampled).toHaveLength(3);
    expect(sampled.map((c) => c.repeatGroup.index)).toEqual([0, 1, 2]);
    expect(extras).toHaveLength(1);
    expect(extras[0].repeatExtra.count).toBe(3);
    expect(extras[0].repeatGroup).toEqual({ id: 0, index: 2 });
  });

  it('a run exactly at the sample size produces no repeat-extra marker', () => {
    const { host } = makeUniformHost(3);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates.filter((c) => c.type === 'repeat-extra')).toHaveLength(0);
    expect(candidates.filter((c) => c.repeatGroup)).toHaveLength(3);
  });

  it('a run below the 3-sibling minimum is walked individually, untagged', () => {
    const { host } = makeUniformHost(2);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => !c.repeatGroup)).toBe(true);
  });

  it('an unequal-height run is walked individually, not sampled (protects fixtures like CardGrid)', () => {
    const { host, items } = makeUniformHost(3);
    items[1].getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 80, width: 100, height: 80 }); // 4x its siblings' height
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates.filter((c) => c.type === 'repeat-extra')).toHaveLength(0);
    expect(candidates.every((c) => !c.repeatGroup)).toBe(true);
    expect(candidates).toHaveLength(3);
  });

  it('SVG siblings with different classes are not folded into the same repeat group (className is an SVGAnimatedString on SVG elements, not a plain string)', () => {
    const el = document.createElement('div');
    const svgNS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 3; i++) {
      const icon = document.createElementNS(svgNS, 'svg');
      icon.setAttribute('class', `icon icon-${i}`); // genuinely distinct classes
      icon.getBoundingClientRect = () => ({ top: 0, left: i * 20, right: i * 20 + 16, bottom: 16, width: 16, height: 16 });
      el.appendChild(icon);
    }
    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates).toHaveLength(3); // each icon walked individually, not sampled
    expect(candidates.every((c) => !c.repeatGroup)).toBe(true);
    expect(candidates.every((c) => c.type === 'icon')).toBe(true);
  });

  it('siblings with the same tag/class but different child counts are not folded into the same repeat group (protects layouts like a colspan group-header row mixed with data rows)', () => {
    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('td');
    headerCell.textContent = 'Group header';
    headerCell.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 });
    headerRow.appendChild(headerCell);
    headerRow.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 });
    table.appendChild(headerRow);

    const dataRows = [];
    for (let i = 0; i < 5; i++) {
      const row = document.createElement('tr');
      row.getBoundingClientRect = () => ({ top: (i + 1) * 20, left: 0, right: 100, bottom: (i + 1) * 20 + 20, width: 100, height: 20 });
      for (let c = 0; c < 2; c++) {
        const cell = document.createElement('td');
        cell.textContent = `cell ${i}-${c}`;
        cell.getBoundingClientRect = () => ({ top: (i + 1) * 20, left: c * 50, right: c * 50 + 50, bottom: (i + 1) * 20 + 20, width: 50, height: 20 });
        row.appendChild(cell);
      }
      table.appendChild(row);
      dataRows.push(row);
    }
    document.body.appendChild(table);
    const host = { el: table, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    const headerCandidates = candidates.filter((c) => c.el === headerCell);
    expect(headerCandidates).toHaveLength(1);
    expect(headerCandidates[0].repeatGroup).toBeUndefined();

    const extras = candidates.filter((c) => c.type === 'repeat-extra');
    expect(extras).toHaveLength(1);
    expect(extras[0].repeatExtra.count).toBe(2);
    expect(extras[0].repeatExtra.sampleEls).toEqual(dataRows.slice(0, 3));
    expect(extras[0].repeatExtra.extraEls).toEqual(dataRows.slice(3, 5));

    const sampledTextCandidates = candidates.filter(
      (c) => c.type === 'text' && c.repeatGroup && dataRows.includes(c.el.parentElement)
    );
    expect(sampledTextCandidates).toHaveLength(6); // 3 sampled rows x 2 cells each
    expect(new Set(sampledTextCandidates.map((c) => c.repeatGroup.index))).toEqual(new Set([0, 1, 2]));
  });

  it('pushes a container as a real candidate when panels is enabled, before recursing into its children', () => {
    const el = document.createElement('div');
    const card = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = 'hello';
    card.appendChild(text);
    el.appendChild(card);
    document.body.appendChild(el);

    const host = { el, component: { id: 'c1' }, config: { panels: true }, state: 'idle', pending: 0, layer: null };
    const candidates = collectAndClassify(host, createRegistry());

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ el: card, type: 'container' });
    expect(candidates[1]).toMatchObject({ el: text, type: 'text' });
  });

  it('does not push a container as a candidate when panels is disabled (default, regression guard)', () => {
    const el = document.createElement('div');
    const card = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = 'hello';
    card.appendChild(text);
    el.appendChild(card);
    document.body.appendChild(el);

    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const candidates = collectAndClassify(host, createRegistry());

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ el: text, type: 'text' });
  });

  it('a container candidate still counts toward MAX_CANDIDATES when panels is enabled', () => {
    const el = document.createElement('div');
    for (let i = 0; i < 5; i++) {
      const card = document.createElement('div');
      const text = document.createElement('p');
      text.textContent = `item ${i}`;
      card.appendChild(text);
      el.appendChild(card);
    }
    document.body.appendChild(el);

    const host = { el, component: { id: 'c1' }, config: { panels: true }, state: 'idle', pending: 0, layer: null };
    const candidates = collectAndClassify(host, createRegistry(), 12, 3);

    // 5 cards + 5 text children = 10 candidates, none of them a repeat run
    // (each card has a unique child, no repeated tag+class+childCount signature).
    expect(candidates).toHaveLength(10);
  });

  it('collectAndClassifyRange also pushes container candidates when panels is enabled (island path)', () => {
    const start = document.createComment('start');
    const end = document.createComment('end');
    const parent = document.createElement('div');
    const card = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = 'hello';
    card.appendChild(text);
    parent.appendChild(start);
    parent.appendChild(card);
    parent.appendChild(end);
    document.body.appendChild(parent);

    const host = { el: card, component: { id: 'c1' }, config: { panels: true }, state: 'idle', pending: 0, layer: null };
    const candidates = collectAndClassifyRange(start, end, host, createRegistry());

    expect(candidates.some((c) => c.type === 'container')).toBe(true);
  });
});

describe('collectAndClassifyRange', () => {
  it('collects candidates only from the sibling range between the two markers, not from outside it', () => {
    const registry = createRegistry();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<span id="before">before</span>';
    const start = document.createComment('[if FRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    wrapper.appendChild(start);
    const host = { el: document.createElement('div'), config: {} };
    host.el.innerHTML = '<p>inside island</p>';
    wrapper.appendChild(host.el);
    const end = document.createComment('[if ENDFRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    wrapper.appendChild(end);
    wrapper.insertAdjacentHTML('beforeend', '<span id="after">after</span>');
    document.body.appendChild(wrapper);

    const candidates = collectAndClassifyRange(start, end, host, registry);

    expect(candidates.some((c) => c.el.textContent === 'before')).toBe(false);
    expect(candidates.some((c) => c.el.textContent === 'after')).toBe(false);
    expect(candidates.some((c) => c.el.tagName === 'P')).toBe(true);
  });

  it('does not treat the target host itself as a nested-host boundary, but still stops at a different nested host', () => {
    const registry = createRegistry();
    const wrapper = document.createElement('div');
    const start = document.createComment('[if FRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    wrapper.appendChild(start);

    const host = { el: document.createElement('div'), config: {} };
    const wrapperOfHost = document.createElement('section');
    wrapperOfHost.appendChild(host.el);
    host.el.innerHTML = '<p id="own-content">mine</p>';
    wrapper.appendChild(wrapperOfHost);
    registry.attach(host.el, { id: 'c1' }, {});

    const otherHost = document.createElement('div');
    otherHost.innerHTML = '<p id="other-content">not mine</p>';
    wrapper.appendChild(otherHost);
    registry.attach(otherHost, { id: 'c1' }, {});

    const end = document.createComment('[if ENDFRAGMENT:type=island|name=t|token=t1|mode=morph]><![endif]');
    wrapper.appendChild(end);
    document.body.appendChild(wrapper);

    const candidates = collectAndClassifyRange(start, end, host, registry);

    expect(candidates.some((c) => c.el.id === 'own-content')).toBe(true);
    expect(candidates.some((c) => c.el.id === 'other-content')).toBe(false);
  });

  it('stops at MAX_CANDIDATES even when collecting panel container siblings in an island range', () => {
    const registry = createRegistry();
    const wrapper = document.createElement('div');
    const start = document.createComment('start');
    wrapper.appendChild(start);

    for (let i = 0; i < 1525; i++) {
      const container = document.createElement('div');
      const text = document.createElement('p');
      text.textContent = `item ${i}`;
      container.appendChild(text);
      container.getBoundingClientRect = () => ({ top: i * 30, left: 0, right: 100, bottom: i * 30 + 28, width: 100, height: 28 });
      wrapper.appendChild(container);
    }

    const end = document.createComment('end');
    wrapper.appendChild(end);
    document.body.appendChild(wrapper);

    const host = { el: document.createElement('div'), config: { panels: true }, component: { id: 'c1' }, state: 'idle', pending: 0, layer: null };

    const candidates = collectAndClassifyRange(start, end, host, registry, 12, 3);

    expect(candidates).toHaveLength(1500);
    expect(candidates.every((c) => c.type === 'container' || c.type === 'text')).toBe(true);
  }, 15000);

  it('prunes a display:none sibling within the range before it can spend the candidate budget, so visible content later in the range is still found', () => {
    const registry = createRegistry();
    const wrapper = document.createElement('div');
    const start = document.createComment('start');
    wrapper.appendChild(start);

    const hidden = document.createElement('div'); // e.g. a closed dropdown or an off-screen panel sitting inside the island range
    hidden.style.display = 'none';
    for (let i = 0; i < 1505; i++) {
      const p = document.createElement('p');
      p.textContent = `hidden row ${i}`;
      hidden.appendChild(p);
    }
    wrapper.appendChild(hidden);

    const visible = document.createElement('div');
    const visibleText = document.createElement('p');
    visibleText.textContent = 'visible content';
    visible.appendChild(visibleText);
    wrapper.appendChild(visible);

    const end = document.createComment('end');
    wrapper.appendChild(end);
    document.body.appendChild(wrapper);

    const host = { el: document.createElement('div'), config: {}, component: { id: 'c1' }, state: 'idle', pending: 0, layer: null };

    const candidates = collectAndClassifyRange(start, end, host, registry);

    // Without the range loop's own isCollapsed check, `hidden` would still be
    // handed to visit(), which would recurse into its 1505-element subtree
    // and exhaust MAX_CANDIDATES before the loop's nextSibling walk ever
    // reaches `visible` — the same starvation bug as visit()'s children
    // loop, one level shallower (at sibling-iteration instead of recursion).
    expect(candidates.some((c) => c.el === visibleText)).toBe(true);
    expect(candidates.some((c) => c.el.textContent.startsWith('hidden row'))).toBe(false);
  }, 15000);
});
