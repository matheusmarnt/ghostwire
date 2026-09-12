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

  // SPEC-PERF-01/02: split into an independent read (measure) and write
  // (apply) half so a caller looping over several hosts on the same
  // component (js/src/index.js's onPostPaint) can measure every host first
  // and only then write any of them — otherwise host N+1's read lands right
  // after host N's write in the same loop, forcing a synchronous reflow per
  // host after the first. repositionLayer stays as a single-host convenience
  // wrapper composing the two; no other caller needs to change.
  function measureHostRect(host) {
    if (!host.layer) return null;
    return host.el.getBoundingClientRect();
  }

  function applyLayerRect(host, rect) {
    if (!host.layer || !rect) return;
    host.layer.style.top = `${rect.top}px`;
    host.layer.style.left = `${rect.left}px`;
    host.layer.style.width = `${rect.width}px`;
    host.layer.style.height = `${rect.height}px`;
  }

  function repositionLayer(host) {
    applyLayerRect(host, measureHostRect(host));
  }

  // SPEC-SEC-04: the only path that turns a Bone Tree into DOM, for both the
  // Ghost Layer (renderBones, live-synthesized) and a lazy placeholder root
  // (js/src/index.js's paintLazyPlaceholders, painted from persisted data).
  // Every write is createElement + a numeric style property — bone.type is
  // drawn from the store's closed BONE_TYPES whitelist and every geometry
  // value is a clamped number by the time it reaches here, so this can never
  // become an HTML or selector sink regardless of which caller fed it.
  function paintBones(container, boneTree) {
    if (!container) return;

    container.textContent = '';

    for (const bone of boneTree) {
      const el = document.createElement('div');
      el.className = `gw-bone gw-bone--${bone.type}`;
      el.style.left = `${bone.x}px`;
      el.style.top = `${bone.y}px`;
      el.style.width = `${bone.width}px`;
      el.style.height = `${bone.height}px`;
      container.appendChild(el);
    }
  }

  function renderBones(host, boneTree) {
    paintBones(host.layer, boneTree);
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
  //
  // Both are idempotent, split into two independent halves:
  //   - the DOM attribute is ALWAYS written, on every call, because Livewire's
  //     morph attribute diffing (patchAttributes) strips aria-busy off the live
  //     node the moment a morph touches the host — index.js's `morphed` hook
  //     reapplies it by calling markBusy() again mid-busy-period, so a guarded
  //     setAttribute would never restore it.
  //   - the busyCount/announcement bookkeeping happens at most once per busy
  //     period, gated on host.busy, so those repeat calls can't double-count
  //     (which would strand busyCount above 0 forever and kill every future
  //     announcement) or re-announce "Loading". The same flag makes clearBusy
  //     safe to call unconditionally from teardown, whether or not the host was
  //     ever busy (SPEC-A11Y-04).
  function markBusy(host) {
    host.el.setAttribute('aria-busy', 'true');
    if (host.busy) return;
    host.busy = true;
    busyCount += 1;
    if (busyCount === 1) announce(window.Ghostwire?.messages?.busy ?? 'Loading');
  }

  function clearBusy(host) {
    host.el.removeAttribute('aria-busy');
    if (!host.busy) return;
    host.busy = false;
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

  // Only restores focus that the ghosting itself took away. If anything else
  // holds focus by now — the user tabbed into a .gw-kept region, clicked
  // another component, anything — that's a deliberate move and stealing it
  // back on hide would be a worse regression than not restoring at all. Focus
  // genuinely lost to the forced blur lands on <body> (or nowhere), so that's
  // the only state we act on.
  function restoreFocus(host) {
    const el = host.savedFocus;
    host.savedFocus = null;
    if (!el) return;
    const focusWasLost = !document.activeElement || document.activeElement === document.body;
    if (focusWasLost && document.body.contains(el) && typeof el.focus === 'function') {
      el.focus();
    }
  }

  return { mountLayer, repositionLayer, measureHostRect, applyLayerRect, renderBones, paintBones, removeLayer, freeze, unfreeze, markBusy, clearBusy, captureFocus, restoreFocus };
}
