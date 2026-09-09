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

  it('mountLayer replicates the host border-radius and clips overflow (SPEC-RND-02)', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 10, left: 20, width: 100, height: 50 });
    host.el.style.borderRadius = '8px';
    host.el.style.overflow = 'hidden';

    renderer.mountLayer(host);

    expect(host.layer.style.borderRadius).toBe('8px');
    expect(host.layer.style.overflow).toBe('hidden');
  });

  it('mountLayer leaves the layer unclipped when the host overflow is visible', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 50 });
    host.el.style.overflow = 'visible';

    renderer.mountLayer(host);

    expect(host.layer.style.overflow).toBe('visible');
  });

  it('repositionLayer does not re-read border-radius/overflow on later calls (mount-time only, no forced recalc per morph)', () => {
    const renderer = createRenderer();
    const host = makeHost();
    host.el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 50 });
    host.el.style.borderRadius = '8px';
    host.el.style.overflow = 'hidden';
    renderer.mountLayer(host);

    host.el.style.borderRadius = '0px'; // changed after mount — must not propagate on reposition
    host.el.style.overflow = 'visible';
    renderer.repositionLayer(host);

    expect(host.layer.style.borderRadius).toBe('8px');
    expect(host.layer.style.overflow).toBe('hidden');
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

  it('markBusy sets aria-busy on the host; clearBusy removes it', () => {
    const renderer = createRenderer();
    const host = makeHost();

    renderer.markBusy(host);
    expect(host.el.getAttribute('aria-busy')).toBe('true');

    renderer.clearBusy(host);
    expect(host.el.getAttribute('aria-busy')).toBeNull();
  });

  it('markBusy announces once via a single shared polite live region, even for multiple hosts', () => {
    const renderer = createRenderer();
    const hostA = makeHost();
    const hostB = makeHost();

    renderer.markBusy(hostA);
    renderer.markBusy(hostB);

    const regions = document.body.querySelectorAll('[aria-live="polite"]');
    expect(regions.length).toBe(1);
    expect(regions[0].textContent).toBe('Loading');

    renderer.clearBusy(hostA);
    expect(regions[0].textContent).toBe('Loading'); // one host still busy — no "idle" announcement yet

    renderer.clearBusy(hostB);
    expect(regions[0].textContent).toBe('Content updated');
  });

  it('markBusy/clearBusy respect window.Ghostwire.announcements === false', () => {
    window.Ghostwire = { announcements: false };
    const renderer = createRenderer();
    const host = makeHost();

    renderer.markBusy(host);

    expect(document.body.querySelector('[aria-live="polite"]')).toBeNull();

    delete window.Ghostwire;
  });

  it('captureFocus/restoreFocus preserve and restore focus that was inside the host', () => {
    const renderer = createRenderer();
    const host = makeHost();
    const input = document.createElement('input');
    host.el.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    renderer.captureFocus(host);
    input.remove(); // simulate the browser dropping focus once the host is hidden
    expect(document.activeElement).not.toBe(input);

    host.el.appendChild(input); // simulate the host becoming visible again
    renderer.restoreFocus(host);

    expect(document.activeElement).toBe(input);
    expect(host.savedFocus).toBeNull();
  });

  it('captureFocus is a no-op when focus is outside the host', () => {
    const renderer = createRenderer();
    const host = makeHost();
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();

    renderer.captureFocus(host);

    expect(host.savedFocus).toBeUndefined();
  });
});
