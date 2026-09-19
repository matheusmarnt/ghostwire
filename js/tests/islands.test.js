import { describe, it, expect } from 'vitest';
import { closestIslandRange } from '../src/islands.js';

function appendMarker(parent, kind, meta) {
  parent.appendChild(document.createComment(`[if ${kind}:${meta}]><![endif]`));
}

describe('closestIslandRange', () => {
  it('finds the island wrapping a direct child element', () => {
    const meta = 'type=island|name=test|token=t1|mode=morph';
    const wrapper = document.createElement('div');
    appendMarker(wrapper, 'FRAGMENT', meta);
    const host = document.createElement('div');
    host.id = 'host';
    wrapper.appendChild(host);
    appendMarker(wrapper, 'ENDFRAGMENT', meta);
    document.body.appendChild(wrapper);

    const range = closestIslandRange(host);

    expect(range.startNode.textContent).toContain('FRAGMENT:type=island');
    expect(range.endNode.textContent).toContain('ENDFRAGMENT:type=island');
  });

  it('finds the island wrapping a deeply nested element', () => {
    const meta = 'type=island|name=test|token=t1|mode=morph';
    const wrapper = document.createElement('div');
    appendMarker(wrapper, 'FRAGMENT', meta);
    wrapper.insertAdjacentHTML('beforeend', '<section><article><div id="host"></div></article></section>');
    appendMarker(wrapper, 'ENDFRAGMENT', meta);
    document.body.appendChild(wrapper);

    const range = closestIslandRange(wrapper.querySelector('#host'));

    expect(range.startNode.textContent).toContain('name=test');
  });

  it('returns null for an element outside any island', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    expect(closestIslandRange(el)).toBeNull();
  });

  it('returns null when the nearest enclosing fragment is not an island', () => {
    const meta = 'type=other|name=test|token=t1|mode=morph';
    const wrapper = document.createElement('div');
    appendMarker(wrapper, 'FRAGMENT', meta);
    const host = document.createElement('div');
    wrapper.appendChild(host);
    appendMarker(wrapper, 'ENDFRAGMENT', meta);
    document.body.appendChild(wrapper);

    expect(closestIslandRange(host)).toBeNull();
  });

  it('skips a fully-closed sibling fragment and finds the real enclosing island', () => {
    const outerMeta = 'type=island|name=outer|token=t1|mode=morph';
    const innerMeta = 'type=other|name=inner|token=t2|mode=morph';
    const wrapper = document.createElement('div');
    appendMarker(wrapper, 'FRAGMENT', outerMeta);
    appendMarker(wrapper, 'FRAGMENT', innerMeta);
    wrapper.appendChild(document.createElement('span'));
    appendMarker(wrapper, 'ENDFRAGMENT', innerMeta);
    const host = document.createElement('div');
    host.id = 'host';
    wrapper.appendChild(host);
    appendMarker(wrapper, 'ENDFRAGMENT', outerMeta);
    document.body.appendChild(wrapper);

    const range = closestIslandRange(host);

    expect(range.startNode.textContent).toContain('name=outer');
  });

  it('finds the nearest (innermost) island when islands are nested', () => {
    const outerMeta = 'type=island|name=outer|token=t1|mode=morph';
    const innerMeta = 'type=island|name=inner|token=t2|mode=morph';
    const wrapper = document.createElement('div');
    appendMarker(wrapper, 'FRAGMENT', outerMeta);
    appendMarker(wrapper, 'FRAGMENT', innerMeta);
    const host = document.createElement('div');
    host.id = 'host';
    wrapper.appendChild(host);
    appendMarker(wrapper, 'ENDFRAGMENT', innerMeta);
    appendMarker(wrapper, 'ENDFRAGMENT', outerMeta);
    document.body.appendChild(wrapper);

    const range = closestIslandRange(host);

    expect(range.startNode.textContent).toContain('name=inner');
  });
});
