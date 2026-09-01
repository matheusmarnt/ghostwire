(() => {
  // js/src/bridge/v4.js
  function createV4Bridge() {
    function subscribe(handlers) {
      return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
        if (message.isSkipped()) return;
        const ctx = {
          component: message.component,
          actionNames: message.getActions().map((action) => action.name),
          isSync: message.getActions().length === 0
        };
        handlers.onStart(ctx);
        onSuccess(({ onRender }) => {
          onRender(() => handlers.onPostPaint(ctx));
        });
        onError(() => handlers.onFinish(ctx));
        onFailure(() => handlers.onFinish(ctx));
        onCancel(() => handlers.onFinish(ctx));
        onFinish(() => handlers.onFinish(ctx));
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
          return attr.value.trim() === methodName || attr.value.trim() === "";
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
      host.layer.style.top = `${rect.top}px`;
      host.layer.style.left = `${rect.left}px`;
      host.layer.style.width = `${rect.width}px`;
      host.layer.style.height = `${rect.height}px`;
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
    return { mountLayer, repositionLayer, removeLayer, freeze, unfreeze };
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
    const scheduler = createScheduler({
      onShow(host) {
        if (host.config.off) return;
        if (host.config.mode === "freeze") renderer.freeze(host);
        else renderer.mountLayer(host);
      },
      onHide(host) {
        if (host.config.mode === "freeze") renderer.unfreeze(host);
        else renderer.removeLayer(host);
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
