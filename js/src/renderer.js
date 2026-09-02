export function createRenderer() {
  function mountLayer(host) {
    const layer = document.createElement('div');
    layer.className = 'gw-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer); // SPEC-MORPH-01: mounted outside the reconciled tree entirely, not as a DOM sibling of the host
    host.layer = layer;
    repositionLayer(host);
    return layer;
  }

  function repositionLayer(host) {
    if (!host.layer) return;
    const rect = host.el.getBoundingClientRect();
    const style = window.getComputedStyle(host.el);
    host.layer.style.top = `${rect.top}px`;
    host.layer.style.left = `${rect.left}px`;
    host.layer.style.width = `${rect.width}px`;
    host.layer.style.height = `${rect.height}px`;
    host.layer.style.borderRadius = style.borderRadius; // SPEC-RND-02
    host.layer.style.overflow = style.overflow === 'hidden' ? 'hidden' : 'visible'; // SPEC-RND-02
  }

  function renderBones(host, boneTree) {
    if (!host.layer) return;
    host.layer.textContent = '';
    for (const bone of boneTree) {
      const el = document.createElement('div');
      el.className = `gw-bone gw-bone--${bone.type}`;
      el.style.left = `${bone.x}px`;
      el.style.top = `${bone.y}px`;
      el.style.width = `${bone.width}px`;
      el.style.height = `${bone.height}px`;
      host.layer.appendChild(el);
    }
  }

  function removeLayer(host) {
    if (!host.layer) return;
    host.layer.remove();
    host.layer = null;
  }

  function freeze(host) {
    host.el.classList.add('gw-frozen');
  }

  function unfreeze(host) {
    host.el.classList.remove('gw-frozen');
  }

  return { mountLayer, repositionLayer, renderBones, removeLayer, freeze, unfreeze };
}
