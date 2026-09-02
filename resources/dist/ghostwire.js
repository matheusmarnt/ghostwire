(() => {
  // js/src/bridge/v4.js
  function createV4Bridge() {
    function subscribe(handlers) {
      return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
        if (message.isSkipped()) return;
        const isPoll = message.getActions().length > 0 && message.getActions().every((action) => action.metadata?.type === "poll");
        if (isPoll) return;
        const actionNames = message.getActions().map((action) => action.name);
        const isSync = actionNames.length === 0 || actionNames.every((name) => name === "$set" || name === "$commit");
        const ctx = {
          component: message.component,
          actionNames,
          isSync
        };
        handlers.onStart(ctx);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          handlers.onFinish(ctx);
        };
        onSuccess(({ onRender }) => {
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
        if (looksLikePoll) return;
        const ctx = { component, actionNames, isSync };
        handlers.onStart(ctx);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          handlers.onFinish(ctx);
        };
        succeed(() => {
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
    function mountLayer(host) {
      const layer = document.createElement("div");
      layer.className = "gw-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
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
      host.layer.style.borderRadius = style.borderRadius;
      host.layer.style.overflow = style.overflow === "visible" ? "visible" : "hidden";
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
    return { mountLayer, repositionLayer, renderBones, removeLayer, freeze, unfreeze };
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
  function collectAndClassify(host, registry, maxDepth = 12) {
    const candidates = [];
    visit(host.el, registry, candidates, 0, maxDepth);
    return candidates;
  }
  function visit(node, registry, out, depth, maxDepth) {
    for (const child of node.children) {
      if (out.length >= MAX_CANDIDATES) return;
      if (registry.hostFor(child)) continue;
      if (child.getAttribute("aria-hidden") === "true") continue;
      const type = classify(child);
      if (type === "container") {
        if (depth < maxDepth) visit(child, registry, out, depth + 1, maxDepth);
        continue;
      }
      if (type === null) continue;
      out.push({ el: child, type, depth });
    }
  }

  // js/src/synthesizer/measure.js
  function measure(host, candidates) {
    const hostRect = host.el.getBoundingClientRect();
    const hostStyle = window.getComputedStyle(host.el);
    const results = candidates.map((candidate) => {
      const style = window.getComputedStyle(candidate.el);
      const entry = {
        el: candidate.el,
        type: candidate.type,
        depth: candidate.depth,
        rect: candidate.el.getBoundingClientRect(),
        visibility: style.visibility,
        transform: style.transform
      };
      if (candidate.type === "text") entry.lineRects = measureTextLines(candidate.el);
      if (candidate.type === "media") entry.borderRadius = style.borderRadius;
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

  // js/src/synthesizer/emit.js
  function emit(host, measured, rowsHint) {
    if (isNonAxisAligned(measured.hostTransform)) return null;
    const bones = [];
    for (const entry of measured.results) {
      if (!isVisible(entry)) continue;
      if (!rectIntersectsHost(entry.rect, measured.hostRect)) continue;
      if (isNonAxisAligned(entry.transform)) continue;
      if (entry.type === "text") {
        const lines = (entry.lineRects || []).filter((r) => r.width > 0 && r.height > 0);
        for (const rect of lines) bones.push(toBone("text", rect, measured.hostRect));
        continue;
      }
      const type = entry.type === "media" && isAvatar(entry) ? "avatar" : entry.type;
      bones.push(toBone(type, entry.rect, measured.hostRect));
    }
    if (bones.length > 0) return bones;
    if (rowsHint > 0) return syntheticRows(measured.hostRect, rowsHint);
    return null;
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
    const radiusPx = parseFloat(entry.borderRadius) || 0;
    return aspectDelta < 0.1 && radiusPx >= Math.min(width, height) / 2;
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
        const key = `${candidate.el.tagName}|${candidate.type}|${candidate.el.className}|${candidate.depth}`;
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
        const width = entries[0].contentRect.width;
        const stored = cache.get(host.el);
        if (!stored) return;
        if (Math.abs(width - stored.width) >= RESIZE_THRESHOLD_PX) {
          observer.disconnect();
          cache.delete(host.el);
          onInvalidate?.(host);
        }
      });
      observer.observe(host.el);
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
  function createSynthesizer(registry, defaults = { maxDepth: 12 }) {
    const cache = createSignatureCache();
    function synthesize(host) {
      const candidates = collectAndClassify(host, registry, defaults.maxDepth);
      const signature = cache.computeSignature(candidates);
      const cached = cache.get(host, signature);
      if (cached) return cached;
      const measured = measure(host, candidates);
      const boneTree = emit(host, measured, host.config.rows);
      if (boneTree) cache.set(host, signature, boneTree, () => {
      });
      else cache.invalidate(host);
      return boneTree;
    }
    function forget(host) {
      cache.invalidate(host);
    }
    return { synthesize, forget };
  }

  // js/src/index.js
  var TIMED_MODIFIER_PATTERN = /^(delay|hold)\.(\d+)ms$/;
  function parseModifiers(modifiers) {
    const config = { mode: "synthesize", off: false, ignore: false, keep: false };
    for (const modifier of modifiers) {
      if (modifier === "freeze") config.mode = "freeze";
      else if (modifier === "off") config.off = true;
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
  function boot() {
    const { bridge } = detectBridge();
    if (!bridge) return;
    const registry = createRegistry();
    const renderer = createRenderer();
    const synthesizer = createSynthesizer(registry);
    const scheduler = createScheduler({
      onShow(host) {
        if (host.config.off || host.config.ignore || host.config.keep) return;
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
        renderer.mountLayer(host);
        renderer.renderBones(host, boneTree);
      },
      onHide(host) {
        if (host.config.off || host.config.ignore || host.config.keep) return;
        if (host.config.mode === "freeze" || host.degraded) {
          renderer.unfreeze(host);
          host.degraded = false;
          return;
        }
        renderer.removeLayer(host);
      }
    });
    window.Livewire.directive("ghost", ({ el, directive, component, cleanup }) => {
      const config = parseModifiers(directive.modifiers);
      if (config.off) {
        cleanup(() => {
        });
        return;
      }
      const host = registry.attach(el, component, config);
      cleanup(() => {
        scheduler.cancel(host);
        synthesizer.forget(host);
        renderer.removeLayer(host);
        renderer.unfreeze(host);
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
        if (host.state === "visible" && host.config.mode === "freeze") renderer.freeze(host);
      }
    });
    bridge.subscribe({
      onStart(ctx) {
        if (ctx.isSync) return;
        for (const host of registry.hostsFor(ctx.component.id)) {
          if (host.config.off) continue;
          scheduler.messageStart(host, pickOverrides(host.config));
        }
      },
      onPostPaint(ctx) {
        if (ctx.isSync) return;
        for (const host of registry.hostsFor(ctx.component.id)) {
          renderer.repositionLayer(host);
          scheduler.messagePostPaint(host);
        }
      },
      onFinish(ctx) {
        if (ctx.isSync) return;
        for (const host of registry.hostsFor(ctx.component.id)) {
          scheduler.messageFinish(host);
        }
      }
    });
  }
  function pickOverrides(config) {
    const overrides = {};
    if (typeof config.delay === "number") overrides.delay = config.delay;
    if (typeof config.hold === "number") overrides.hold = config.hold;
    return overrides;
  }
  document.addEventListener("livewire:init", boot);
})();
