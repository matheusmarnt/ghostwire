import { describe, it, expect, beforeEach } from 'vitest';
import { collectAndClassify, classify } from '../src/synthesizer/walk.js';
import { createRegistry } from '../src/registry.js';

function makeHost(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
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
});
