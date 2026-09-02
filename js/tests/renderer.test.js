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

  it('mountLayer appends the layer to document.body, never inside the host', () => {
    const renderer = createRenderer();
    const host = makeHost();

    const layer = renderer.mountLayer(host);

    expect(host.layer).toBe(layer);
    expect(layer.parentNode).toBe(document.body);
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
    expect(document.body.querySelector('.gw-layer')).toBeNull();
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

  it('repositionLayer replicates the host border-radius and clips overflow (SPEC-RND-02)', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 10, left: 20, width: 100, height: 50 });
    host.el.style.borderRadius = '8px';
    host.el.style.overflow = 'hidden';
    renderer.mountLayer(host);

    renderer.repositionLayer(host);

    expect(host.layer.style.borderRadius).toBe('8px');
    expect(host.layer.style.overflow).toBe('hidden');
  });

  it('repositionLayer leaves the layer unclipped when the host overflow is visible', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 50 });
    renderer.mountLayer(host);

    renderer.repositionLayer(host);

    expect(host.layer.style.overflow).toBe('visible');
  });

  it('renderBones paints one .gw-bone element per bone, positioned in host-relative coordinates', () => {
    const renderer = createRenderer();
    const host = makeHost();
    renderer.mountLayer(host);

    renderer.renderBones(host, [
      { type: 'text', x: 4, y: 8, width: 100, height: 16 },
      { type: 'avatar', x: 0, y: 0, width: 40, height: 40 },
    ]);

    const bones = host.layer.querySelectorAll('.gw-bone');
    expect(bones).toHaveLength(2);
    expect(bones[0].classList.contains('gw-bone--text')).toBe(true);
    expect(bones[0].style.left).toBe('4px');
    expect(bones[0].style.top).toBe('8px');
    expect(bones[1].classList.contains('gw-bone--avatar')).toBe(true);
  });

  it('renderBones clears any previously rendered bones before repainting', () => {
    const renderer = createRenderer();
    const host = makeHost();
    renderer.mountLayer(host);
    renderer.renderBones(host, [{ type: 'text', x: 0, y: 0, width: 10, height: 10 }]);

    renderer.renderBones(host, [{ type: 'control', x: 0, y: 0, width: 10, height: 10 }]);

    expect(host.layer.querySelectorAll('.gw-bone')).toHaveLength(1);
    expect(host.layer.querySelector('.gw-bone--text')).toBeNull();
  });
});
