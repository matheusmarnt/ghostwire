import { detectBridge } from './bridge/index.js';
import { createRegistry } from './registry.js';
import { createScheduler } from './scheduler.js';
import { createRenderer } from './renderer.js';
import { createSynthesizer } from './synthesizer/index.js';
import { parseAttributeConfig, resolveHostConfig } from './attributeConfig.js';

const TIMED_MODIFIER_PATTERN = /^(delay|hold)\.(\d+)ms$/;

// Only include a key when a modifier explicitly set it — never "declare"
// mode/ignore/keep unconditionally. resolveHostConfig() spreads this object
// over the attribute config, so an undeclared key here must stay absent
// (not merely falsy) or it would stomp an explicit `#[Ghost(...)]` value
// (SPEC-API-40).
function parseModifiers(modifiers) {
  const config = {};
  for (const modifier of modifiers) {
    if (modifier === 'freeze') config.mode = 'freeze';
    else if (modifier === 'off') config.mode = 'off'; // SPEC-API-41: off is terminal, expressed as a mode value throughout
    else if (modifier === 'ignore') config.ignore = true;
    else if (modifier === 'keep') config.keep = true;
    else if (modifier === 'island') { /* no-op on v3 and v4 alike — SPEC-INT-13 lands in M9 */ }
    else {
      const timed = modifier.match(TIMED_MODIFIER_PATTERN);
      if (timed) config[timed[1]] = Number(timed[2]);
      else if (modifier.startsWith('rows.')) config.rows = Number(modifier.slice('rows.'.length));
      else if (process.env.NODE_ENV !== 'production') {
        console.warn(`[ghostwire] unknown wire:ghost modifier ".${modifier}" — ignored`);
      }
    }
  }
  return config;
}

// Mirrors v3.js's isPolledMethod wire:poll check. Needed because Livewire
// fires "component.init" strictly before it processes that same element's
// own directive.init pass (confirmed by reading vendor/livewire/livewire/
// dist/livewire.esm.js's start()/interceptInit: initComponent(), which
// fires component.init, runs before the directives.forEach(...
// trigger("directive.init") ...) loop for that same el — both synchronous,
// same call stack). So when wire:ghost sits directly on the component root,
// registry.hostFor(root) is still empty the moment component.init fires —
// the directive hasn't attached its host yet. A static attribute check is
// what actually prevents the double-attach for that case.
function hasGhostDirective(el) {
  for (const name of el.getAttributeNames()) {
    if (name === 'wire:ghost' || name.startsWith('wire:ghost.')) return true;
  }
  return false;
}

export function boot() {
  const { bridge } = detectBridge();
  if (!bridge) return;

  const registry = createRegistry();
  const renderer = createRenderer();
  const synthesizer = createSynthesizer(registry, undefined, (host) => {
    if (host.state !== 'visible' || host.config.mode === 'freeze') return; // only re-render an already-showing, non-frozen skeleton
    const boneTree = synthesizer.synthesize(host);
    if (boneTree) {
      renderer.renderBones(host, boneTree);
    } else {
      renderer.removeLayer(host);
      host.el.classList.remove('gw-concealed');
      renderer.freeze(host);
      host.degraded = true;
    }
  });
  const scheduler = createScheduler({
    onShow(host) {
      if (host.config.mode === 'off' || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze') { renderer.freeze(host); return; }

      const boneTree = synthesizer.synthesize(host);
      if (!boneTree) { renderer.freeze(host); host.degraded = true; return; } // SPEC-SYN-16/17 degrade

      renderer.mountLayer(host);
      renderer.renderBones(host, boneTree);
      host.el.classList.add('gw-concealed');
    },
    onHide(host) {
      if (host.config.mode === 'off' || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze' || host.degraded) { renderer.unfreeze(host); host.degraded = false; return; }
      renderer.removeLayer(host);
      host.el.classList.remove('gw-concealed');
    },
  });

  window.Livewire.directive('ghost', ({ el, directive, component, cleanup }) => {
    const directiveConfig = parseModifiers(directive.modifiers);
    // SPEC-API-30: data-ghost lives on the component's own root, not
    // necessarily on `el` (whichever element wire:ghost was written on —
    // SPEC-API-03 nested-host case). `component.el` is a real property on
    // both bridges' Component class (v3.js's isPolledMethod already reads
    // it; confirmed directly in vendor/livewire/livewire/dist/livewire.esm.js
    // for both the installed v4.4.3 and v3.8.7, checked for this task).
    const attributeConfig = parseAttributeConfig(component.el);
    const config = resolveHostConfig(directiveConfig, attributeConfig);
    if (config.mode === 'off') { cleanup(() => {}); return; }

    // SPEC-API §10.1 grammar level 2: wire:ghost="actionA, actionB" targets
    // only those actions; a bare wire:ghost (no expression) is unfiltered.
    const targetActions = directive.expression
      ? directive.expression.split(',').map((name) => name.trim()).filter(Boolean)
      : null;

    const host = registry.attach(el, component, config);
    host.targetActions = targetActions;
    if (config.keep) el.classList.add('gw-kept');

    cleanup(() => {
      scheduler.cancel(host);
      synthesizer.forget(host);
      renderer.removeLayer(host);
      renderer.unfreeze(host);
      host.el.classList.remove('gw-concealed');
      el.classList.remove('gw-kept');
      registry.detach(host);
    });
  });

  // SPEC-API-12/13: a host must exist even when there's no wire:ghost
  // directive anywhere on the component (attribute-only auto-attach).
  //
  // Hook name and payload confirmed empirically, not guessed: grepped
  // vendor/livewire/livewire/dist/livewire.esm.js for every `trigger(` call
  // site backing `Livewire.hook()` (Livewire.hook === the internal `on()`
  // event-bus function, dist line ~17640/component.init handling at
  // js/store.js's initComponent()). The only component-lifecycle-start
  // trigger is:
  //   trigger("component.init", { component, cleanup })
  // fired once per component, before it's added to the components registry
  // and before effects are processed. The payload carries exactly these two
  // keys — no `el` — so the host root is read from `component.el`.
  // Re-checked against a temporary local install of livewire/livewire ^3.6
  // (resolved to v3.8.7): identical trigger call, identical payload shape,
  // same addCleanup()/destroyComponent() symmetry (see below). No dual-line
  // divergence found for this hook.
  //
  // Component-teardown: there is no separate "component.removed" (or
  // similarly named) public hook in either installed line — grepped for
  // every `trigger("component...` and `trigger("morph...` call site and
  // found none for teardown. Instead, `component.init`'s own `cleanup`
  // callback (identical shape to the directive callback's `cleanup`) is
  // Livewire's actual mechanism for this: it pushes onto the Component
  // instance's internal cleanups array, which destroyComponent() drains via
  // component.cleanup() when the component is removed (confirmed in both
  // installed dist bundles). Using it here is symmetric with how the
  // directive already tears itself down, and needs no separate hook lookup.
  window.Livewire.hook('component.init', ({ component, cleanup }) => {
    const root = component.el;
    // SPEC-API-13: a directive-created host already owns this element.
    // hasGhostDirective() is the real guard (see its comment above);
    // registry.hostFor(root) is kept as a defensive second check.
    if (hasGhostDirective(root) || registry.hostFor(root)) return;

    const attributeConfig = parseAttributeConfig(root);
    if (attributeConfig === null || attributeConfig.mode === 'off') return;

    // No gw-kept handling here: `keep` has no data-ghost/attribute-config
    // equivalent (attributeConfig.js's compact-key schema has no "keep"
    // key) — SPEC-API reserves .keep to the directive only.
    const host = registry.attach(root, component, attributeConfig);

    cleanup(() => {
      scheduler.cancel(host);
      synthesizer.forget(host);
      renderer.removeLayer(host);
      renderer.unfreeze(host);
      host.el.classList.remove('gw-concealed');
      registry.detach(host);
    });
  });

  window.Livewire.hook('morph.updating', ({ el, skip }) => {
    if (el.classList?.contains('gw-layer')) skip();
  });

  // A leaked/extra Ghost Layer node that mismatches its positional
  // counterpart's tag name is routed by Livewire's morph diff through
  // swapElements() -> morph.removing, never morph.updating (skip() there
  // never gets a chance to run). Mirror the same guard on this hook so
  // either path protects the node.
  window.Livewire.hook('morph.removing', ({ el, skip }) => {
    if (el.classList?.contains('gw-layer')) skip();
  });

  // A morph re-renders the host's own attributes from server HTML, which has
  // no gw-frozen class — Livewire's attribute diffing strips it immediately
  // regardless of the scheduler's hold timer. Reapply it (idempotent) right
  // after any morph, for any host still supposed to be visibly frozen; the
  // scheduler still owns *when* freeze actually ends.
  window.Livewire.hook('morphed', ({ component }) => {
    for (const host of registry.hostsFor(component.id)) {
      if (host.state === 'visible' && host.config.mode === 'freeze') renderer.freeze(host);
    }
  });

  bridge.subscribe({
    onStart(ctx) {
      if (ctx.isSync) return; // SPEC-API-20 default silence
      for (const host of registry.hostsFor(ctx.component.id)) {
        if (host.config.mode === 'off') continue;
        if (host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name))) continue;
        scheduler.messageStart(host, pickOverrides(host.config));
      }
    },
    onPostPaint(ctx) {
      if (ctx.isSync) return; // SPEC-API-20 default silence — mirror onStart's guard
      for (const host of registry.hostsFor(ctx.component.id)) {
        renderer.repositionLayer(host);
        scheduler.messagePostPaint(host);
      }
    },
    onFinish(ctx) {
      if (ctx.isSync) return; // SPEC-API-20 default silence — mirror onStart's guard
      for (const host of registry.hostsFor(ctx.component.id)) {
        scheduler.messageFinish(host);
      }
    },
  });
}

function pickOverrides(config) {
  const overrides = {};
  if (typeof config.delay === 'number') overrides.delay = config.delay;
  if (typeof config.hold === 'number') overrides.hold = config.hold;
  return overrides;
}

document.addEventListener('livewire:init', boot);
