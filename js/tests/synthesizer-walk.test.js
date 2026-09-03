import { describe, it, expect, beforeEach } from 'vitest';
import { collectAndClassify, classify } from '../src/synthesizer/walk.js';
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

  it('collectAndClassify stops at a nested wire:ghost host (SPEC-API-03)', () => {
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

  it('collectAndClassify degrades to a block bone when maxDepth is exceeded (SPEC-SYN-13)', () => {
    const host = makeHost('<div><div><div><p>deep</p></div></div></div>');
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 1);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('block');
  });

  it('collectAndClassify degrades to a block bone when MAX_CANDIDATES is exceeded (SPEC-SYN-13)', () => {
    const el = document.createElement('div');
    for (let i = 0; i < 305; i++) {
      const p = document.createElement('p');
      p.textContent = `row ${i}`;
      el.appendChild(p);
    }
    document.body.appendChild(el);
    const host = { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12);

    // 300 real leaf candidates are pushed before the cap trips on the 301st
    // child; that trip aggregates the remaining 4 children into one block.
    expect(candidates).toHaveLength(301);
    expect(candidates[0].type).toBe('text');
    expect(candidates.at(-1).type).toBe('block');
  });

  it('SPEC-SYN-13: exactly one block is produced when the count cap trips inside a nested container with siblings still pending', () => {
    const el = document.createElement('div');
    const a = document.createElement('div'); // container A: fills the cap exactly on its own
    for (let i = 0; i < 300; i++) {
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

    const blocks = candidates.filter((c) => c.type === 'block');
    expect(blocks).toHaveLength(1); // not one per ancestor level
    expect(blocks[0].el).toBe(host.el); // covers the whole host, so B's un-walked content isn't left with zero coverage
  });

  it('SPEC-SYN-11: samples the first repeatSampleSize items of a uniform run of >= 3 siblings', () => {
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

  it('SPEC-SYN-11: a run exactly at the sample size produces no repeat-extra marker', () => {
    const { host } = makeUniformHost(3);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates.filter((c) => c.type === 'repeat-extra')).toHaveLength(0);
    expect(candidates.filter((c) => c.repeatGroup)).toHaveLength(3);
  });

  it('SPEC-SYN-11: a run below the 3-sibling minimum is walked individually, untagged', () => {
    const { host } = makeUniformHost(2);
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => !c.repeatGroup)).toBe(true);
  });

  it('SPEC-SYN-11: an unequal-height run is walked individually, not sampled (protects fixtures like CardGrid)', () => {
    const { host, items } = makeUniformHost(3);
    items[1].getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 80, width: 100, height: 80 }); // 4x its siblings' height
    const registry = createRegistry();

    const candidates = collectAndClassify(host, registry, 12, 3);

    expect(candidates.filter((c) => c.type === 'repeat-extra')).toHaveLength(0);
    expect(candidates.every((c) => !c.repeatGroup)).toBe(true);
    expect(candidates).toHaveLength(3);
  });

  it('SPEC-SYN-11: SVG siblings with different classes are not folded into the same repeat group (className is an SVGAnimatedString on SVG elements, not a plain string)', () => {
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

  it('SPEC-SYN-11: siblings with the same tag/class but different child counts are not folded into the same repeat group (protects layouts like a colspan group-header row mixed with data rows)', () => {
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
});
