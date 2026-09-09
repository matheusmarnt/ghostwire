export function createRenderer() {
  let liveRegion = null;
  let busyCount = 0;

  function ensureLiveRegion() {
    if (liveRegion) return liveRegion;
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('role', 'status');
    liveRegion.className = 'gw-sr-only';
    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  // SPEC-A11Y-04: "traduzível e desativável" — window.Ghostwire is this
  // package's only global config surface (deliberately not a Laravel config
  // key: announcements are a client-only concern, and this keeps the PHP
  // config file untouched by M5).
  function announce(message) {
    if (window.Ghostwire?.announcements === false) return;
    ensureLiveRegion().textContent = message;
  }

  function mountLayer(host) {
    const layer = document.createElement('div');
    layer.className = 'gw-layer';
    layer.setAttribute('aria-hidden', 'true');

    // SPEC-PERF-01/02: read everything about the host BEFORE any DOM-tree
    // write. Writes to `layer` here are safe pre-append — it isn't in the
    // document tree yet, so setting its style doesn't dirty document layout.
    // ponytail: host's own border-radius/overflow can't change between mount
    // and unmount, so read them once here rather than on every
    // repositionLayer() call (SPEC-RND-02).
    const style = window.getComputedStyle(host.el);
    layer.style.borderRadius = style.borderRadius;
    layer.style.overflow = style.overflow === 'visible' ? 'visible' : 'hidden';

    const rect = host.el.getBoundingClientRect();
    layer.style.top = `${rect.top}px`;
    layer.style.left = `${rect.left}px`;
    layer.style.width = `${rect.width}px`;
    layer.style.height = `${rect.height}px`;

    document.body.appendChild(layer); // SPEC-MORPH-01: mounted outside the reconciled tree entirely; also the ONLY DOM-tree write in this function, last
    host.layer = layer;
    return layer;
  }

  function repositionLayer(host) {
    if (!host.layer) return;
    const rect = host.el.getBoundingClientRect();
    host.layer.style.top = `${rect.top}px`;
    host.layer.style.left = `${rect.left}px`;
    host.layer.style.width = `${rect.width}px`;
    host.layer.style.height = `${rect.height}px`;
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

  // SPEC-A11Y-01: busy-ness tracks the scheduler's own VISIBLE state,
  // independent of render mode — freeze/synthesize/keep/ignore hosts all
  // reach onShow/onHide (js/src/index.js), so all of them get aria-busy.
  // Only mode: 'off' hosts never call this at all (onStart skips
  // scheduler.messageStart for them).
  function markBusy(host) {
    host.el.setAttribute('aria-busy', 'true');
    busyCount += 1;
    if (busyCount === 1) announce(window.Ghostwire?.messages?.busy ?? 'Loading');
  }

  function clearBusy(host) {
    host.el.removeAttribute('aria-busy');
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) announce(window.Ghostwire?.messages?.idle ?? 'Content updated');
  }

  // SPEC-A11Y-03: only the concealed (visibility: hidden) path needs this —
  // freeze uses opacity/pointer-events only (SPEC-MORPH-03), which never
  // forces the browser to blur an already-focused descendant, so freeze has
  // nothing to restore. A visibility: hidden host DOES force a blur, so the
  // focused element is captured right before .gw-concealed is applied and
  // refocused right after it's removed.
  function captureFocus(host) {
    if (host.el.contains(document.activeElement)) {
      host.savedFocus = document.activeElement;
    }
  }

  function restoreFocus(host) {
    const el = host.savedFocus;
    host.savedFocus = null;
    if (el && document.body.contains(el) && typeof el.focus === 'function') {
      el.focus();
    }
  }

  return { mountLayer, repositionLayer, renderBones, removeLayer, freeze, unfreeze, markBusy, clearBusy, captureFocus, restoreFocus };
}
