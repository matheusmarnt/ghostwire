import { describe, it, expect, beforeEach } from 'vitest';
import { createRenderer } from '../src/renderer.js';

function makeHost() {
  const parent = document.createElement('div');
  const el = document.createElement('section');
  parent.appendChild(el);
  document.body.appendChild(parent);
  return { el, component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
}

describe('renderer', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('mountLayer inserts a sibling element right after the host, never inside it', () => {
    const renderer = createRenderer();
    const host = makeHost();

    const layer = renderer.mountLayer(host);

    expect(host.layer).toBe(layer);
    expect(layer.previousSibling).toBe(host.el);
    expect(host.el.contains(layer)).toBe(false);
    expect(layer.classList.contains('gw-layer')).toBe(true);
    expect(layer.getAttribute('aria-hidden')).toBe('true');
  });

  it('removeLayer detaches the layer from the DOM and clears host.layer', () => {
    const renderer = createRenderer();
    const host = makeHost();
    renderer.mountLayer(host);

    renderer.removeLayer(host);

    expect(host.layer).toBeNull();
    expect(host.el.parentNode.querySelector('.gw-layer')).toBeNull();
  });

  it('freeze adds the frozen class to the host and does not create a layer', () => {
    const renderer = createRenderer();
    const host = makeHost();

    renderer.freeze(host);

    expect(host.el.classList.contains('gw-frozen')).toBe(true);
    expect(host.layer).toBeNull();
  });

  it('unfreeze removes the frozen class', () => {
    const renderer = createRenderer();
    const host = makeHost();
    renderer.freeze(host);

    renderer.unfreeze(host);

    expect(host.el.classList.contains('gw-frozen')).toBe(false);
  });

  it('freeze/unfreeze never mutate host innerHTML (SPEC-MORPH-03 acceptance check)', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.innerHTML = '<p>content</p>';
    const before = host.el.outerHTML.replace(/\s*class="[^"]*"/, '');

    renderer.freeze(host);
    renderer.unfreeze(host);

    const after = host.el.outerHTML.replace(/\s*class="[^"]*"/, '');
    expect(after).toBe(before);
  });

  it('repositionLayer matches the layer geometry to the host bounding rect', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 10, left: 20, width: 100, height: 50 });
    renderer.mountLayer(host);

    renderer.repositionLayer(host);

    expect(host.layer.style.top).toBe('10px');
    expect(host.layer.style.left).toBe('20px');
    expect(host.layer.style.width).toBe('100px');
    expect(host.layer.style.height).toBe('50px');
  });
});
