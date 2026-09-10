(() => {
  // js/src/bridge/v4.js
  function createV4Bridge() {
    function subscribe(handlers) {
      return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
        if (message.isSkipped()) return;
        const isPoll = message.getActions().length > 0 && message.getActions().every((action) => action.metadata?.type === "poll");
        const actionNames = message.getActions().map((action) => action.name);
        const isSync = actionNames.length === 0 || actionNames.every((name) => name === "$set" || name === "$commit");
        const isRenderlessAtDispatch = message.getActions().length > 0 && message.getActions().every((action) => action.metadata?.renderless === true);
        const ctx = {
          component: message.component,
          actionNames,
          isSync,
          isPoll,
          isRenderless: isRenderlessAtDispatch
        };
        handlers.onStart(ctx);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          handlers.onFinish(ctx);
        };
        onSuccess(({ payload, onRender }) => {
          if (!ctx.isRenderless) {
            ctx.isRenderless = !Object.prototype.hasOwnProperty.call(payload?.effects ?? {}, "html");
          }
          onRender(() => handlers.onPostPaint(ctx));
        });
        onError(() => finish());
        onFailure(() => finish());
        onCancel(() => finish());
        onFinish(() => finish());
      });
    }
    return { name: "v4", subscribe };
  }

  // js/src/bridge/v3.js
  function isPolledMethod(component, methodName) {
    const root = component.el;
    if (!root) return true;
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    return elements.some((el) => {
      for (const attr of el.attributes) {
        if (attr.name === "wire:poll" || attr.name.startsWith("wire:poll.")) {
          return attr.value.trim() === methodName;
        }
      }
      return false;
    });
  }
  function createV3Bridge() {
    function subscribe(handlers) {
      window.Livewire.hook("commit", ({ component, commit, succeed, fail }) => {
        const actionNames = commit.calls.map((call) => call.method);
        const isSync = actionNames.length === 0;
        const looksLikePoll = actionNames.length > 0 && actionNames.every((name) => isPolledMethod(component, name));
        const ctx = { component, actionNames, isSync, isPoll: looksLikePoll, isRenderless: false };
        handlers.onStart(ctx);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          handlers.onFinish(ctx);
        };
        succeed((response) => {
          ctx.isRenderless = !Object.prototype.hasOwnProperty.call(response?.effects ?? {}, "html");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => handlers.onPostPaint(ctx));
          });
          finish();
        });
        fail(() => finish());
      });
      return () => {
      };
    }
    return { name: "v3", subscribe };
  }

  // js/src/bridge/index.js
  function detectBridge() {
    if (typeof window.Livewire?.interceptMessage === "function") {
      return { name: "v4", bridge: createV4Bridge() };
    }
    if (typeof window.Livewire?.hook === "function") {
      return { name: "v3", bridge: createV3Bridge() };
    }
    if (false) {
      console.warn("[ghostwire] neither Livewire.interceptMessage nor Livewire.hook was found \u2014 disabling (SPEC-INT-20)");
    }
    return { name: null, bridge: null };
  }

  // js/src/registry.js
  function createRegistry() {
    const byElement = /* @__PURE__ */ new WeakMap();
    const byComponentId = /* @__PURE__ */ new Map();
    function attach(el, component, config) {
      const host = { el, component, config, state: "idle", pending: 0, layer: null };
      byElement.set(el, host);
      const id = component.id;
      if (!byComponentId.has(id)) byComponentId.set(id, /* @__PURE__ */ new Set());
      byComponentId.get(id).add(host);
      return host;
    }
    function detach(host) {
      byElement.delete(host.el);
      const set = byComponentId.get(host.component.id);
      if (!set) return;
      set.delete(host);
      if (set.size === 0) byComponentId.delete(host.component.id);
    }
    function hostsFor(componentId) {
      return byComponentId.get(componentId) || /* @__PURE__ */ new Set();
    }
    function hostFor(el) {
      return byElement.get(el) || null;
    }
    return { attach, detach, hostsFor, hostFor };
  }

  // js/src/scheduler.js
  function createScheduler({ onShow, onHide }, defaults = { delay: 120, hold: 300, timeout: 15e3 }) {
    function messageStart(host, overrides = {}) {
      host.pending += 1;
      if (host.state !== "idle") return;
      host.cfg = { ...defaults, ...overrides };
      host.postPaintReceived = false;
      host.state = "pending";
      host.delayTimer = setTimeout(() => {
        if (host.state !== "pending") return;
        host.state = "visible";
        host.shownAt = Date.now();
        onShow(host);
        maybeSettle(host);
      }, host.cfg.delay);
      host.timeoutTimer = setTimeout(() => forceIdle(host), host.cfg.timeout);
    }
    function messagePostPaint(host) {
      host.postPaintReceived = true;
      maybeSettle(host);
    }
    function messageFinish(host) {
      host.pending = Math.max(0, host.pending - 1);
      if (host.pending > 0) return;
      if (host.state === "pending") {
        clearTimeout(host.delayTimer);
        clearTimeout(host.timeoutTimer);
        host.state = "idle";
        return;
      }
      maybeSettle(host);
    }
    function maybeSettle(host) {
      if (host.state !== "visible" || !host.postPaintReceived || host.pending > 0) return;
      const elapsed = Date.now() - host.shownAt;
      const remaining = Math.max(0, host.cfg.hold - elapsed);
      clearTimeout(host.holdTimer);
      host.holdTimer = setTimeout(() => {
        if (host.state !== "visible") return;
        clearTimeout(host.timeoutTimer);
        host.state = "settling";
        onHide(host);
        host.state = "idle";
      }, remaining);
    }
    function forceIdle(host) {
      clearTimeout(host.delayTimer);
      clearTimeout(host.holdTimer);
      const wasVisible = host.state === "visible" || host.state === "settling";
      host.state = "idle";
      host.pending = 0;
      if (wasVisible) onHide(host);
    }
    function cancel(host) {
      clearTimeout(host.delayTimer);
      clearTimeout(host.holdTimer);
      clearTimeout(host.timeoutTimer);
    }
    return { messageStart, messagePostPaint, messageFinish, forceIdle, cancel };
  }

  // js/src/renderer.js
  function createRenderer() {
    let liveRegion = null;
    let busyCount = 0;
    function ensureLiveRegion() {
      if (liveRegion) return liveRegion;
      liveRegion = document.createElement("div");
      liveRegion.setAttribute("aria-live", "polite");
      liveRegion.setAttribute("role", "status");
      liveRegion.className = "gw-sr-only";
      document.body.appendChild(liveRegion);
      return liveRegion;
    }
    function announce(message) {
      if (window.Ghostwire?.announcements === false) return;
      ensureLiveRegion().textContent = message;
    }
    function mountLayer(host) {
      const layer = document.createElement("div");
      layer.className = "gw-layer";
      layer.setAttribute("aria-hidden", "true");
      const style = window.getComputedStyle(host.el);
      layer.style.borderRadius = style.borderRadius;
      layer.style.overflow = style.overflow === "visible" ? "visible" : "hidden";
      const rect = host.el.getBoundingClientRect();
      layer.style.top = `${rect.top}px`;
      layer.style.left = `${rect.left}px`;
      layer.style.width = `${rect.width}px`;
      layer.style.height = `${rect.height}px`;
      document.body.appendChild(layer);
      host.layer = layer;
      return layer;
    }
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
    function renderBones(host, boneTree) {
      if (!host.layer) return;
      host.layer.textContent = "";
      for (const bone of boneTree) {
        const el = document.createElement("div");
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
      host.el.classList.add("gw-frozen");
    }
    function unfreeze(host) {
      host.el.classList.remove("gw-frozen");
    }
    function markBusy(host) {
      host.el.setAttribute("aria-busy", "true");
      if (host.busy) return;
      host.busy = true;
      busyCount += 1;
      if (busyCount === 1) announce(window.Ghostwire?.messages?.busy ?? "Loading");
    }
    function clearBusy(host) {
      host.el.removeAttribute("aria-busy");
      if (!host.busy) return;
      host.busy = false;
      busyCount = Math.max(0, busyCount - 1);
      if (busyCount === 0) announce(window.Ghostwire?.messages?.idle ?? "Content updated");
    }
    function captureFocus(host) {
      if (host.el.contains(document.activeElement)) {
        host.savedFocus = document.activeElement;
      }
    }
    function restoreFocus(host) {
      const el = host.savedFocus;
      host.savedFocus = null;
      if (!el) return;
      const focusWasLost = !document.activeElement || document.activeElement === document.body;
      if (focusWasLost && document.body.contains(el) && typeof el.focus === "function") {
        el.focus();
      }
    }
    return { mountLayer, repositionLayer, measureHostRect, applyLayerRect, renderBones, removeLayer, freeze, unfreeze, markBusy, clearBusy, captureFocus, restoreFocus };
  }

  // js/src/synthesizer/walk.js
  var LEAF_TAGS_MEDIA = ["IMG", "VIDEO", "PICTURE", "CANVAS"];
  var LEAF_TAGS_CONTROL = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"];
  var MAX_CANDIDATES = 300;
  function classify(el) {
    if (el.tagName === "svg" || el.tagName === "SVG") return "icon";
    if (LEAF_TAGS_MEDIA.includes(el.tagName)) return "media";
    if (LEAF_TAGS_CONTROL.includes(el.tagName) || el.getAttribute("role") === "button") return "control";
    if (/^H[1-6]$/.test(el.tagName)) return "heading";
    if (hasDirectText(el)) return "text";
    if (el.children.length > 0) return "container";
    return null;
  }
  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") return true;
    }
    return false;
  }
  var REPEAT_MIN_RUN = 3;
  var REPEAT_HEIGHT_TOLERANCE = 0.15;
  function collectAndClassify(host, registry, maxDepth = 12, repeatSampleSize = 3) {
    const candidates = [];
    const state = { groupSeq: 0 };
    visit(host.el, registry, candidates, 0, maxDepth, repeatSampleSize, state, null, host.el);
    return candidates;
  }
  function visit(node, registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl) {
    const children = [];
    for (const child of node.children) {
      if (registry.hostFor(child)) continue;
      if (child.getAttribute("aria-hidden") === "true") continue;
      children.push(child);
    }
    let i = 0;
    while (i < children.length) {
      if (out.length >= MAX_CANDIDATES) {
        if (!state.capped) {
          out.push({ type: "block", el: rootEl, depth: 0 });
          state.capped = true;
        }
        return;
      }
      const runLength = matchingRunLength(children, i);
      if (!repeatGroup && runLength >= REPEAT_MIN_RUN && isUniformHeightRun(children, i, runLength)) {
        const groupId = state.groupSeq++;
        const sampleSize = Math.min(repeatSampleSize, runLength);
        for (let s = 0; s < sampleSize; s++) {
          processChild(children[i + s], registry, out, depth, maxDepth, repeatSampleSize, state, { id: groupId, index: s }, rootEl);
        }
        const extraCount = runLength - sampleSize;
        if (extraCount > 0) {
          out.push({
            type: "repeat-extra",
            el: children[i + sampleSize - 1],
            depth,
            repeatGroup: { id: groupId, index: sampleSize - 1 },
            repeatExtra: {
              count: extraCount,
              sampleEls: children.slice(i, i + sampleSize),
              extraEls: children.slice(i + sampleSize, i + runLength)
            }
          });
        }
        i += runLength;
        continue;
      }
      processChild(children[i], registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl);
      i += 1;
    }
  }
  function processChild(child, registry, out, depth, maxDepth, repeatSampleSize, state, repeatGroup, rootEl) {
    const type = classify(child);
    if (type === "container") {
      if (depth < maxDepth) {
        visit(child, registry, out, depth + 1, maxDepth, repeatSampleSize, state, repeatGroup, rootEl);
      } else {
        const block = { type: "block", el: child, depth: depth + 1 };
        if (repeatGroup) block.repeatGroup = repeatGroup;
        out.push(block);
      }
      return;
    }
    if (type === null) return;
    const candidate = { el: child, type, depth };
    if (repeatGroup) candidate.repeatGroup = repeatGroup;
    out.push(candidate);
  }
  function matchingRunLength(children, start) {
    const signature = siblingSignature(children[start]);
    let end = start + 1;
    while (end < children.length && siblingSignature(children[end]) === signature) end++;
    return end - start;
  }
  function siblingSignature(el) {
    return `${el.tagName}.${normalizeClassName(el.getAttribute("class") ?? "")}.${el.children.length}`;
  }
  function normalizeClassName(className) {
    return String(className).trim().split(/\s+/).filter(Boolean).sort().join(" ");
  }
  function isUniformHeightRun(children, start, runLength) {
    let min = Infinity;
    let max = 0;
    for (let k = 0; k < runLength; k++) {
      const height = children[start + k].getBoundingClientRect().height;
      if (height < min) min = height;
      if (height > max) max = height;
    }
    if (max === 0) return false;
    return (max - min) / max <= REPEAT_HEIGHT_TOLERANCE;
  }

  // js/src/synthesizer/measure.js
  function measure(host, candidates) {
    const hostRect = host.el.getBoundingClientRect();
    const hostStyle = window.getComputedStyle(host.el);
    const clipCache = /* @__PURE__ */ new Map();
    const results = candidates.map((candidate) => {
      const style = window.getComputedStyle(candidate.el);
      const entry = {
        el: candidate.el,
        type: candidate.type,
        depth: candidate.depth,
        rect: candidate.el.getBoundingClientRect(),
        visibility: style.visibility,
        transform: style.transform,
        clipRect: computeClipRect(candidate.el, host.el, hostRect, clipCache)
      };
      if (candidate.repeatGroup) entry.repeatGroup = candidate.repeatGroup;
      if (candidate.type === "text") entry.lineRects = measureTextLines(candidate.el);
      if (candidate.type === "media") entry.borderRadius = style.borderRadius;
      if (candidate.type === "repeat-extra") entry.repeat = measureRepeat(candidate.repeatExtra);
      return entry;
    });
    return { hostRect, hostTransform: hostStyle.transform, results };
  }
  function measureTextLines(el) {
    const rects = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(...range.getClientRects());
      }
    }
    return rects;
  }
  function computeClipRect(el, hostEl, hostRect, cache) {
    let clip = hostRect;
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== hostEl) {
      let info;
      if (cache.has(ancestor)) {
        info = cache.get(ancestor);
      } else {
        const style = window.getComputedStyle(ancestor);
        const clips = style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible";
        info = clips ? { rect: ancestor.getBoundingClientRect() } : null;
        cache.set(ancestor, info);
      }
      if (info) clip = intersectRects(clip, info.rect);
      ancestor = ancestor.parentElement;
    }
    return clip;
  }
  function intersectRects(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  function measureRepeat(repeatExtra) {
    const rects = repeatExtra.sampleEls.map((el) => el.getBoundingClientRect());
    const last = rects[rects.length - 1];
    let pitch = { x: 0, y: last.height };
    if (rects.length >= 2) {
      const prev = rects[rects.length - 2];
      pitch = { x: last.left - prev.left, y: last.top - prev.top };
    }
    const extraTextBones = (repeatExtra.extraEls || []).map((el) => measureShallowTextBones(el));
    return { count: repeatExtra.count, pitch, itemRect: last, extraTextBones };
  }
  function measureShallowTextBones(el) {
    if (hasDirectText(el)) return [measureTextLines(el)];
    return Array.from(el.children).filter((child) => hasDirectText(child)).map((child) => measureTextLines(child));
  }

  // js/src/synthesizer/emit.js
  function emit(host, measured, rowsHint) {
    if (isNonAxisAligned(measured.hostTransform)) return null;
    const bones = [];
    const templatesByGroup = /* @__PURE__ */ new Map();
    for (const entry of measured.results) {
      if (entry.type === "repeat-extra") continue;
      if (!isVisible(entry)) continue;
      if (!rectIntersectsHost(entry.rect, entry.clipRect || measured.hostRect)) continue;
      if (isNonAxisAligned(entry.transform)) continue;
      const produced = [];
      if (entry.type === "text") {
        const lines = (entry.lineRects || []).filter((r) => r.width > 0 && r.height > 0);
        for (const rect of lines) produced.push(toBone("text", rect, measured.hostRect));
      } else if (entry.type === "block") {
        produced.push(toBone("block", entry.rect, measured.hostRect));
      } else {
        const type = entry.type === "media" && isAvatar(entry) ? "avatar" : entry.type;
        produced.push(toBone(type, entry.rect, measured.hostRect));
      }
      if (entry.repeatGroup) {
        const key = `${entry.repeatGroup.id}:${entry.repeatGroup.index}`;
        if (!templatesByGroup.has(key)) templatesByGroup.set(key, []);
        templatesByGroup.get(key).push(...produced);
      }
      const effectiveClip = entry.clipRect || measured.hostRect;
      let visible = produced;
      if (!isHostRect(effectiveClip, measured.hostRect)) {
        const clip = relativeClip(effectiveClip, measured.hostRect);
        visible = produced.filter((bone) => relativeRectIntersects(bone, clip));
      }
      bones.push(...visible);
    }
    for (const entry of measured.results) {
      if (entry.type !== "repeat-extra") continue;
      const key = `${entry.repeatGroup.id}:${entry.repeatGroup.index}`;
      const template = templatesByGroup.get(key);
      if (!template || template.length === 0) continue;
      const clip = relativeClip(entry.clipRect || measured.hostRect, measured.hostRect);
      for (let k = 1; k <= entry.repeat.count; k++) {
        const dx = entry.repeat.pitch.x * k;
        const dy = entry.repeat.pitch.y * k;
        const extraTextRects = (entry.repeat.extraTextBones?.[k - 1] || []).flat().filter((r) => r.width > 0 && r.height > 0);
        let textCursor = 0;
        for (const templateBone of template) {
          if (templateBone.type === "text") {
            const real = extraTextRects[textCursor++];
            if (real) {
              const bone2 = { type: "text", x: real.left - measured.hostRect.left, y: real.top - measured.hostRect.top, width: real.width, height: real.height };
              if (relativeRectIntersects(bone2, clip)) bones.push(bone2);
              continue;
            }
          }
          const bone = { type: templateBone.type, x: templateBone.x + dx, y: templateBone.y + dy, width: templateBone.width, height: templateBone.height };
          if (relativeRectIntersects(bone, clip)) bones.push(bone);
        }
      }
    }
    if (bones.length > 0) return bones;
    if (rowsHint > 0) return syntheticRows(measured.hostRect, rowsHint);
    return null;
  }
  function relativeClip(clipRect, hostRect) {
    return {
      left: clipRect.left - hostRect.left,
      top: clipRect.top - hostRect.top,
      right: clipRect.right - hostRect.left,
      bottom: clipRect.bottom - hostRect.top
    };
  }
  function relativeRectIntersects(bone, clip) {
    return bone.x + bone.width > clip.left && bone.x < clip.right && bone.y + bone.height > clip.top && bone.y < clip.bottom;
  }
  function isHostRect(rect, hostRect) {
    return rect.left === hostRect.left && rect.top === hostRect.top && rect.right === hostRect.right && rect.bottom === hostRect.bottom;
  }
  function isVisible(entry) {
    return entry.visibility !== "hidden" && entry.rect.width > 0 && entry.rect.height > 0;
  }
  function rectIntersectsHost(rect, hostRect) {
    return rect.right > hostRect.left && rect.left < hostRect.right && rect.bottom > hostRect.top && rect.top < hostRect.bottom;
  }
  function toBone(type, rect, hostRect) {
    return {
      type,
      x: rect.left - hostRect.left,
      y: rect.top - hostRect.top,
      width: rect.width,
      height: rect.height
    };
  }
  function isAvatar(entry) {
    const { width, height } = entry.rect;
    if (width === 0 || height === 0) return false;
    const aspectDelta = Math.abs(width - height) / Math.max(width, height);
    const radius = entry.borderRadius || "";
    const isCircular = radius.trim().endsWith("%") ? parseFloat(radius) >= 50 : parseFloat(radius) >= Math.min(width, height) / 2;
    return aspectDelta < 0.1 && isCircular;
  }
  function isNonAxisAligned(transformValue) {
    if (!transformValue || transformValue === "none") return false;
    if (transformValue.startsWith("matrix3d")) return true;
    const match = transformValue.match(/^matrix\(([^)]+)\)$/);
    if (!match) return true;
    const [, b, c] = match[1].split(",").map(Number);
    return b !== 0 || c !== 0;
  }
  function syntheticRows(hostRect, count) {
    const gap = 8;
    const available = hostRect.height - gap * (count - 1);
    const rowHeight = available > 0 ? available / count : 16;
    const bones = [];
    for (let i = 0; i < count; i++) {
      bones.push({ type: "text", x: 0, y: i * (rowHeight + gap), width: hostRect.width, height: rowHeight });
    }
    return bones;
  }

  // js/src/synthesizer/signature.js
  var RESIZE_THRESHOLD_PX = 4;
  function createSignatureCache() {
    const cache = /* @__PURE__ */ new WeakMap();
    function computeSignature(candidates) {
      let hash = 2166136261;
      for (const candidate of candidates) {
        const key = `${candidate.el.tagName}|${candidate.type}|${candidate.el.getAttribute("class") ?? ""}|${candidate.depth}|${candidate.repeatExtra?.count ?? ""}`;
        for (let i = 0; i < key.length; i++) {
          hash ^= key.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
      }
      return hash >>> 0;
    }
    function get(host, signature) {
      const entry = cache.get(host.el);
      if (entry && entry.signature === signature) return entry.boneTree;
      return null;
    }
    function set(host, signature, boneTree, onInvalidate) {
      const previous = cache.get(host.el);
      if (previous?.observer) previous.observer.disconnect();
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        const width = entry.borderBoxSize ? Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0].inlineSize : entry.borderBoxSize.inlineSize : entry.contentRect.width;
        const stored = cache.get(host.el);
        if (!stored) return;
        if (Math.abs(width - stored.width) >= RESIZE_THRESHOLD_PX) {
          observer.disconnect();
          cache.delete(host.el);
          onInvalidate?.(host);
        }
      });
      observer.observe(host.el, { box: "border-box" });
      cache.set(host.el, { signature, boneTree, observer, width: host.el.getBoundingClientRect().width });
    }
    function invalidate(host) {
      const entry = cache.get(host.el);
      if (entry?.observer) entry.observer.disconnect();
      cache.delete(host.el);
    }
    return { computeSignature, get, set, invalidate };
  }

  // js/src/synthesizer/index.js
  var LONG_SYNTHESIS_THRESHOLD_MS = 50;
  var SLOW_STREAK_LIMIT = 2;
  function createSynthesizer(registry, defaults = { maxDepth: 12, repeatSampleSize: 3 }, onResize, now = () => performance.now()) {
    const cache = createSignatureCache();
    const slowStreak = /* @__PURE__ */ new WeakMap();
    function synthesize(host) {
      if ((slowStreak.get(host) || 0) >= SLOW_STREAK_LIMIT) return null;
      const startedAt = now();
      const candidates = collectAndClassify(host, registry, defaults.maxDepth, defaults.repeatSampleSize);
      const signature = cache.computeSignature(candidates);
      const cached = cache.get(host, signature);
      if (cached) {
        recordDuration(host, now() - startedAt);
        return cached;
      }
      const measured = measure(host, candidates);
      const boneTree = emit(host, measured, host.config.rows);
      if (boneTree) cache.set(host, signature, boneTree, () => onResize?.(host));
      else cache.invalidate(host);
      recordDuration(host, now() - startedAt);
      return boneTree;
    }
    function recordDuration(host, ms) {
      if (ms > LONG_SYNTHESIS_THRESHOLD_MS) {
        slowStreak.set(host, (slowStreak.get(host) || 0) + 1);
      } else {
        slowStreak.delete(host);
      }
      if (typeof window !== "undefined") window.__ghostwireLastSynthesisMs = ms;
    }
    function forget(host) {
      cache.invalidate(host);
      slowStreak.delete(host);
    }
    return { synthesize, forget };
  }

  // js/src/attributeConfig.js
  var KEY_MAP = { m: "mode", o: "only", x: "except", d: "delay", h: "hold", r: "rows", p: "poll", s: "sync", l: "lazy" };
  var KNOWN_COMPACT_KEYS = /* @__PURE__ */ new Set([...Object.keys(KEY_MAP), "a"]);
  var METHOD_OVERRIDE_KEYS = /* @__PURE__ */ new Set(["m", "d", "h", "r", "p", "s", "l"]);
  var ACTION_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
  var DEFAULTS = { mode: "synthesize", only: null, except: null, delay: 120, hold: 300, rows: null, poll: false, sync: false, lazy: false };
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function sanitizeActionList(list) {
    if (!Array.isArray(list)) return void 0;
    const cleaned = list.filter((name) => typeof name === "string" && ACTION_NAME_PATTERN.test(name));
    return cleaned.length > 0 ? cleaned : null;
  }
  function warn(message) {
    if (false) console.warn(`[ghostwire] ${message}`);
  }
  function parseAttributeConfig(el) {
    const raw = el.getAttribute("data-ghost");
    if (raw == null) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warn("data-ghost payload is not valid JSON \u2014 discarded, using defaults (SPEC-SEC-02)");
      return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      warn("data-ghost payload is not a JSON object \u2014 discarded, using defaults (SPEC-SEC-02)");
      return null;
    }
    for (const key of Object.keys(parsed)) {
      if (!KNOWN_COMPACT_KEYS.has(key)) {
        warn(`data-ghost payload has unknown key "${key}" \u2014 whole payload discarded (SPEC-SEC-02)`);
        return null;
      }
    }
    const config = { ...DEFAULTS };
    if ("m" in parsed) {
      if (typeof parsed.m !== "string" || !["synthesize", "freeze", "off"].includes(parsed.m)) {
        warn('data-ghost "m" is not a valid mode \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.mode = parsed.m;
    }
    if ("d" in parsed) {
      if (typeof parsed.d !== "number") {
        warn('data-ghost "d" is not a number \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.delay = clamp(parsed.d, 0, 6e4);
    }
    if ("h" in parsed) {
      if (typeof parsed.h !== "number") {
        warn('data-ghost "h" is not a number \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.hold = clamp(parsed.h, 0, 6e4);
    }
    if ("r" in parsed) {
      if (typeof parsed.r !== "number") {
        warn('data-ghost "r" is not a number \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.rows = clamp(parsed.r, 0, 1e3);
    }
    if ("p" in parsed) {
      if (typeof parsed.p !== "boolean") {
        warn('data-ghost "p" is not a boolean \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.poll = parsed.p;
    }
    if ("s" in parsed) {
      if (typeof parsed.s !== "boolean") {
        warn('data-ghost "s" is not a boolean \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.sync = parsed.s;
    }
    if ("l" in parsed) {
      if (typeof parsed.l !== "boolean") {
        warn('data-ghost "l" is not a boolean \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.lazy = parsed.l;
    }
    if ("o" in parsed) {
      const sanitized = sanitizeActionList(parsed.o);
      if (sanitized === void 0) {
        warn('data-ghost "o" is not an array \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.only = sanitized;
    }
    if ("x" in parsed) {
      const sanitized = sanitizeActionList(parsed.x);
      if (sanitized === void 0) {
        warn('data-ghost "x" is not an array \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      config.except = sanitized;
    }
    if ("a" in parsed) {
      if (parsed.a === null || typeof parsed.a !== "object" || Array.isArray(parsed.a)) {
        warn('data-ghost "a" is not a JSON object \u2014 whole payload discarded (SPEC-SEC-02)');
        return null;
      }
      const actionOverrides = {};
      for (const [action, fields] of Object.entries(parsed.a)) {
        if (!ACTION_NAME_PATTERN.test(action)) {
          warn(`data-ghost "a" has an invalid action name \u2014 whole payload discarded (SPEC-SEC-02)`);
          return null;
        }
        if (fields === null || typeof fields !== "object" || Array.isArray(fields)) {
          warn(`data-ghost "a.${action}" is not a JSON object \u2014 whole payload discarded (SPEC-SEC-02)`);
          return null;
        }
        const override = {};
        for (const [key, value] of Object.entries(fields)) {
          if (!METHOD_OVERRIDE_KEYS.has(key)) {
            warn(`data-ghost "a.${action}" has unknown key "${key}" \u2014 whole payload discarded (SPEC-SEC-02)`);
            return null;
          }
          if (key === "m") {
            if (typeof value !== "string" || !["synthesize", "freeze", "off"].includes(value)) {
              warn(`data-ghost "a.${action}.m" is not a valid mode \u2014 whole payload discarded (SPEC-SEC-02)`);
              return null;
            }
            override.mode = value;
          } else if (key === "d" || key === "h" || key === "r") {
            if (typeof value !== "number") {
              warn(`data-ghost "a.${action}.${key}" is not a number \u2014 whole payload discarded (SPEC-SEC-02)`);
              return null;
            }
            const field = key === "d" ? "delay" : key === "h" ? "hold" : "rows";
            const max = key === "r" ? 1e3 : 6e4;
            override[field] = clamp(value, 0, max);
          } else {
            if (typeof value !== "boolean") {
              warn(`data-ghost "a.${action}.${key}" is not a boolean \u2014 whole payload discarded (SPEC-SEC-02)`);
              return null;
            }
            const field = key === "p" ? "poll" : key === "s" ? "sync" : "lazy";
            override[field] = value;
          }
        }
        actionOverrides[action] = override;
      }
      config.actionOverrides = actionOverrides;
    }
    return config;
  }
  function resolveHostConfig(directiveConfig, attributeConfig) {
    const base = attributeConfig ?? DEFAULTS;
    return { ...base, ...directiveConfig };
  }

  // js/src/index.js
  var TIMED_MODIFIER_PATTERN = /^(delay|hold)\.(\d+)ms$/;
  function parseModifiers(modifiers) {
    const config = {};
    for (const modifier of modifiers) {
      if (modifier === "freeze") config.mode = "freeze";
      else if (modifier === "off") config.mode = "off";
      else if (modifier === "ignore") config.ignore = true;
      else if (modifier === "keep") config.keep = true;
      else if (modifier === "island") {
      } else {
        const timed = modifier.match(TIMED_MODIFIER_PATTERN);
        if (timed) config[timed[1]] = Number(timed[2]);
        else if (modifier.startsWith("rows.")) config.rows = Number(modifier.slice("rows.".length));
        else if (false) {
          console.warn(`[ghostwire] unknown wire:ghost modifier ".${modifier}" \u2014 ignored`);
        }
      }
    }
    return config;
  }
  function hasGhostDirective(root) {
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    return elements.some((el) => {
      for (const name of el.getAttributeNames()) {
        if (name === "wire:ghost" || name.startsWith("wire:ghost.")) return true;
      }
      return false;
    });
  }
  function boot() {
    const { bridge } = detectBridge();
    if (!bridge) return;
    const registry = createRegistry();
    const renderer = createRenderer();
    const synthesizer = createSynthesizer(registry, void 0, (host) => {
      if (host.state !== "visible" || host.config.mode === "freeze") return;
      const boneTree = synthesizer.synthesize(host);
      if (boneTree) {
        renderer.renderBones(host, boneTree);
      } else {
        renderer.removeLayer(host);
        host.el.classList.remove("gw-concealed");
        renderer.restoreFocus(host);
        renderer.freeze(host);
        host.degraded = true;
      }
    });
    const scheduler = createScheduler({
      onShow(host) {
        renderer.markBusy(host);
        if (host.config.mode === "off" || host.config.ignore || host.config.keep) return;
        if (host.config.mode === "freeze") {
          renderer.freeze(host);
          return;
        }
        const boneTree = synthesizer.synthesize(host);
        if (!boneTree) {
          renderer.freeze(host);
          host.degraded = true;
          return;
        }
        renderer.captureFocus(host);
        renderer.mountLayer(host);
        renderer.renderBones(host, boneTree);
        host.el.classList.add("gw-concealed");
      },
      onHide(host) {
        renderer.clearBusy(host);
        if (host.config.mode === "off" || host.config.ignore || host.config.keep) return;
        if (host.config.mode === "freeze" || host.degraded) {
          renderer.unfreeze(host);
          host.degraded = false;
          return;
        }
        renderer.removeLayer(host);
        host.el.classList.remove("gw-concealed");
        renderer.restoreFocus(host);
      }
    });
    window.Livewire.directive("ghost", ({ el, directive, component, cleanup }) => {
      const directiveConfig = parseModifiers(directive.modifiers);
      const attributeConfig = parseAttributeConfig(component.el);
      const config = resolveHostConfig(directiveConfig, attributeConfig);
      if (config.mode === "off") {
        cleanup(() => {
        });
        return;
      }
      const targetActions = directive.expression ? directive.expression.split(",").map((name) => name.trim()).filter(Boolean) : null;
      const host = registry.attach(el, component, config);
      host.targetActions = targetActions;
      host.actionOverrides = attributeConfig?.actionOverrides ?? null;
      host.directiveConfig = directiveConfig;
      if (config.keep) el.classList.add("gw-kept");
      cleanup(() => {
        scheduler.cancel(host);
        synthesizer.forget(host);
        renderer.removeLayer(host);
        renderer.unfreeze(host);
        renderer.clearBusy(host);
        host.el.classList.remove("gw-concealed");
        el.classList.remove("gw-kept");
        registry.detach(host);
      });
    });
    window.Livewire.hook("component.init", ({ component, cleanup }) => {
      const root = component.el;
      if (hasGhostDirective(root) || registry.hostFor(root)) return;
      const attributeConfig = parseAttributeConfig(root);
      if (attributeConfig === null || attributeConfig.mode === "off") return;
      const host = registry.attach(root, component, attributeConfig);
      host.actionOverrides = attributeConfig.actionOverrides ?? null;
      host.directiveConfig = {};
      cleanup(() => {
        scheduler.cancel(host);
        synthesizer.forget(host);
        renderer.removeLayer(host);
        renderer.unfreeze(host);
        renderer.clearBusy(host);
        host.el.classList.remove("gw-concealed");
        registry.detach(host);
      });
    });
    window.Livewire.hook("morph.updating", ({ el, skip }) => {
      if (el.classList?.contains("gw-layer")) skip();
    });
    window.Livewire.hook("morph.removing", ({ el, skip }) => {
      if (el.classList?.contains("gw-layer")) skip();
    });
    window.Livewire.hook("morphed", ({ component }) => {
      for (const host of registry.hostsFor(component.id)) {
        if (host.state !== "visible") continue;
        renderer.markBusy(host);
        if (host.config.mode === "freeze") {
          renderer.freeze(host);
        } else if (host.layer) {
          host.el.classList.add("gw-concealed");
        }
      }
    });
    bridge.subscribe({
      onStart(ctx) {
        ctx._gwSkippedRenderless = ctx.isRenderless;
        for (const host of registry.hostsFor(ctx.component.id)) {
          applyActionOverride(host, ctx);
          if (host.config.mode === "off") continue;
          if (ctx.isRenderless) continue;
          if (ctx.isSync && !host.config.sync) continue;
          if (ctx.isPoll && !host.config.poll) continue;
          if (host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name))) continue;
          if (host.config.only && !ctx.actionNames.some((name) => host.config.only.includes(name))) continue;
          if (host.config.except && ctx.actionNames.some((name) => host.config.except.includes(name))) continue;
          scheduler.messageStart(host, pickOverrides(host.config));
        }
      },
      onPostPaint(ctx) {
        const hosts = [];
        for (const host of registry.hostsFor(ctx.component.id)) {
          if (ctx._gwSkippedRenderless || host.config.mode === "off" || ctx.isSync && !host.config.sync || ctx.isPoll && !host.config.poll) continue;
          if (host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name))) continue;
          if (host.config.only && !ctx.actionNames.some((name) => host.config.only.includes(name))) continue;
          if (host.config.except && ctx.actionNames.some((name) => host.config.except.includes(name))) continue;
          hosts.push(host);
          scheduler.messagePostPaint(host);
        }
        const rects = hosts.map((host) => renderer.measureHostRect(host));
        hosts.forEach((host, i) => renderer.applyLayerRect(host, rects[i]));
      },
      onFinish(ctx) {
        for (const host of registry.hostsFor(ctx.component.id)) {
          const skip = ctx._gwSkippedRenderless || host.config.mode === "off" || ctx.isSync && !host.config.sync || ctx.isPoll && !host.config.poll || host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name)) || host.config.only && !ctx.actionNames.some((name) => host.config.only.includes(name)) || host.config.except && ctx.actionNames.some((name) => host.config.except.includes(name));
          if (!skip) scheduler.messageFinish(host);
          restoreActionOverride(host, ctx);
        }
      }
    });
  }
  function applyActionOverride(host, ctx) {
    if (host._gwOverrideActive) return;
    if (!host.actionOverrides) return;
    let merged = null;
    for (const name of ctx.actionNames) {
      const fields = host.actionOverrides[name];
      if (!fields) continue;
      merged = merged ? { ...fields, ...merged } : { ...fields };
    }
    if (!merged) return;
    for (const key of Object.keys(host.directiveConfig)) delete merged[key];
    if (Object.keys(merged).length === 0) return;
    host._gwOverrideActive = true;
    ctx._gwBases = ctx._gwBases || /* @__PURE__ */ new Map();
    ctx._gwBases.set(host, host.config);
    host.config = { ...host.config, ...merged };
  }
  function restoreActionOverride(host, ctx) {
    if (ctx._gwBases?.has(host)) {
      host.config = ctx._gwBases.get(host);
      ctx._gwBases.delete(host);
      host._gwOverrideActive = false;
    }
  }
  function pickOverrides(config) {
    const overrides = {};
    if (typeof config.delay === "number") overrides.delay = config.delay;
    if (typeof config.hold === "number") overrides.hold = config.hold;
    return overrides;
  }
  document.addEventListener("livewire:init", boot);
})();
