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

// Mirrors v3.js's isPolledMethod wire:poll check, including its
// whole-subtree scan (root plus every descendant via querySelectorAll('*'))
// — needed for the identical reason isPolledMethod needs it: wire:ghost is
// SPEC-API-03/SPEC-API-13 legal on any descendant of the component root, not
// just the root itself (e.g. tests/Browser/Fixtures/views/demo-table.blade.php
// puts wire:ghost.freeze/wire:ghost on #summary/#list, never on the root).
// Checking only the root's own attributes missed that case and let
// component.init auto-attach a spurious extra root host alongside the real
// directive-created descendant host(s), violating SPEC-API-13.
//
// Also still needed for the root-itself case: Livewire fires "component.init"
// strictly before it processes that same element's own directive.init pass
// (confirmed by reading vendor/livewire/livewire/dist/livewire.esm.js's
// start()/interceptInit: initComponent(), which fires component.init, runs
// before the directives.forEach(... trigger("directive.init") ...) loop for
// that same el — both synchronous, same call stack). So when wire:ghost sits
// directly on the component root, registry.hostFor(root) is still empty the
// moment component.init fires — the directive hasn't attached its host yet.
// A static attribute check is what actually prevents the double-attach for
// that case.
function hasGhostDirective(root) {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.some((el) => {
    for (const name of el.getAttributeNames()) {
      if (name === 'wire:ghost' || name.startsWith('wire:ghost.')) return true;
    }
    return false;
  });
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
      renderer.restoreFocus(host); // SPEC-A11Y-03: leaving .gw-concealed here too (mid-cycle degrade to freeze)
      renderer.freeze(host);
      host.degraded = true;
    }
  });
  const scheduler = createScheduler({
    onShow(host) {
      renderer.markBusy(host); // SPEC-A11Y-01: busy regardless of render mode

      if (host.config.mode === 'off' || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze') { renderer.freeze(host); return; }

      const boneTree = synthesizer.synthesize(host);
      if (!boneTree) { renderer.freeze(host); host.degraded = true; return; } // SPEC-SYN-16/17 degrade

      renderer.captureFocus(host); // SPEC-A11Y-03: before visibility: hidden forces a blur
      renderer.mountLayer(host);
      renderer.renderBones(host, boneTree);
      host.el.classList.add('gw-concealed');
    },
    onHide(host) {
      renderer.clearBusy(host); // SPEC-A11Y-01

      if (host.config.mode === 'off' || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze' || host.degraded) { renderer.unfreeze(host); host.degraded = false; return; }
      renderer.removeLayer(host);
      host.el.classList.remove('gw-concealed');
      renderer.restoreFocus(host); // SPEC-A11Y-03
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
    host.actionOverrides = attributeConfig?.actionOverrides ?? null;
    host.directiveConfig = directiveConfig;
    if (config.keep) el.classList.add('gw-kept');

    cleanup(() => {
      scheduler.cancel(host);
      synthesizer.forget(host);
      renderer.removeLayer(host);
      renderer.unfreeze(host);
      renderer.clearBusy(host); // SPEC-A11Y-04: a host torn down mid-visible would otherwise leak busyCount forever, silencing every later announcement page-wide
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
    host.actionOverrides = attributeConfig.actionOverrides ?? null;
    host.directiveConfig = {};

    cleanup(() => {
      scheduler.cancel(host);
      synthesizer.forget(host);
      renderer.removeLayer(host);
      renderer.unfreeze(host);
      renderer.clearBusy(host); // SPEC-A11Y-04: same busyCount leak as the directive cleanup above
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

  // A morph re-renders the host's own attributes from the server HTML, and
  // Livewire's patchAttributes diff removes ANY attribute present on the live
  // node but absent from the server node — a generic loop, not limited to
  // class. So every client-applied marker on a host is stripped the instant a
  // morph touches it, regardless of the scheduler's hold timer. Reapply them
  // all here (each call idempotent); the scheduler still owns *when* the
  // visible window actually ends.
  window.Livewire.hook('morphed', ({ component }) => {
    for (const host of registry.hostsFor(component.id)) {
      if (host.state !== 'visible') continue;
      renderer.markBusy(host); // SPEC-A11Y-01
      if (host.config.mode === 'freeze') {
        renderer.freeze(host);
      } else if (host.layer) {
        // SPEC-MORPH-03: truthy host.layer means mountLayer() ran and
        // removeLayer() hasn't — i.e. this host really is on the concealed
        // synthesize path right now, and its bones are covering content that
        // would otherwise be live and clickable underneath them.
        host.el.classList.add('gw-concealed');
      }
    }
  });

  // SPEC-API-20/21/22: the bridges (js/src/bridge/v3.js, v4.js) now only
  // report isSync/isPoll/isRenderless as facts on ctx — they no longer
  // unilaterally swallow a message. Silence is decided here, per host, so
  // host.config.sync/poll (SPEC-API-30 data-ghost overrides, already
  // resolved by attributeConfig.js) can opt a specific host back in.
  //
  // ctx.isRenderless can be corrected from false to true *after* onStart
  // returns (both bridges confirmed this: v4's `.renderless` directive
  // modifier is the one case known synchronously before onStart runs;
  // otherwise -- a plain #[Renderless] PHP-attributed method, either line --
  // the only signal is the response shape, discovered later in
  // onSuccess/succeed, strictly after onStart already decided whether to
  // call scheduler.messageStart). Reading the live, possibly-since-mutated
  // ctx.isRenderless in onPostPaint/onFinish would desync onStart's actual
  // decision from theirs whenever the deferred correction lands: onStart
  // would have already called scheduler.messageStart (isRenderless was
  // still false then), but onPostPaint/onFinish would then wrongly skip
  // their balancing scheduler.messagePostPaint/messageFinish calls (now
  // true), leaking host.pending and stranding the host in 'visible' (only
  // recovering via the 15s hard timeout in scheduler.js). So onStart
  // snapshots the value it actually acted on into ctx._gwSkippedRenderless,
  // and all three handlers gate on that frozen snapshot instead -- it can
  // never disagree with what onStart really did, in either sub-case
  // (synchronous: snapshot is true, all three skip, no scheduler calls at
  // all; deferred: snapshot is false, none of the three skip, matching the
  // messageStart that did run).
  //
  // host.targetActions has the identical shape of bug: onStart already
  // skips scheduler.messageStart for a host whose expression doesn't match
  // the triggering action names, so onPostPaint/onFinish must skip their
  // balancing calls for that same host too -- targetActions never mutates
  // after ctx is built, so (unlike isRenderless) checking it live in all
  // three handlers is safe and needs no snapshot.
  //
  // host.config.only/except (SPEC-API-23) are the same shape again: fixed
  // per-host config, never mutated after ctx is built, so all three
  // handlers gate on them live, right next to the targetActions check.
  // only activates when the triggering action IS in the list; except
  // activates unless it IS in the list. Both are null by default (no
  // filtering) and PHP-side validation guarantees they never coexist, but
  // the two checks are independent and correct regardless.
  //
  // host.config.mode === 'off' DOES need mirroring here (Task 2, SPEC-API-10
  // runtime transport, #9). It didn't used to: the directive and the
  // attribute-only auto-attach path both refuse to ever call
  // registry.attach() for a statically mode:'off' host, so at attach time
  // the registry can never contain one. But applyActionOverride() (called
  // once, at the top of onStart's loop) can now flip an already-attached,
  // non-off host's host.config.mode to 'off' for the duration of a single
  // message, via a per-action method-level #[Ghost(mode: 'off')] override —
  // and that mutation persists unchanged through onPostPaint/onFinish until
  // restoreActionOverride() runs at the very end of onFinish. So exactly
  // like targetActions/only/except below, mode is fixed for the whole
  // onStart..onFinish window and safe to re-check live in all three
  // handlers with no snapshot needed: onStart already skips
  // scheduler.messageStart for a dynamically-off host, so onPostPaint/
  // onFinish must skip their balancing messagePostPaint/messageFinish calls
  // for that same host too, or those calls fire with no matching start.
  bridge.subscribe({
    onStart(ctx) {
      // Frozen at the exact moment the messageStart decisions below are
      // made -- see the comment above bridge.subscribe(). Neither bridge
      // mutates ctx.isRenderless before onStart returns, only after.
      ctx._gwSkippedRenderless = ctx.isRenderless;
      for (const host of registry.hostsFor(ctx.component.id)) {
        applyActionOverride(host, ctx);
        if (host.config.mode === 'off') continue;
        if (ctx.isRenderless) continue; // SPEC-API-22: no configurable exception, either line
        if (ctx.isSync && !host.config.sync) continue; // SPEC-API-20 default silence, overridable
        if (ctx.isPoll && !host.config.poll) continue; // SPEC-API-21 default silence, overridable
        if (host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name))) continue;
        if (host.config.only && !ctx.actionNames.some((name) => host.config.only.includes(name))) continue;
        if (host.config.except && ctx.actionNames.some((name) => host.config.except.includes(name))) continue;
        scheduler.messageStart(host, pickOverrides(host.config));
      }
    },
    onPostPaint(ctx) {
      // SPEC-PERF-01/02: collect every eligible host first, then measure all
      // of them before writing any of them — a component with 2+ hosts must
      // not have host N+1's read land right after host N's write in the same
      // cycle (forced synchronous reflow). messagePostPaint only flips a flag
      // and arms an async setTimeout (scheduler.js), so calling it here for
      // every host up front, before the measure/apply batch below, cannot
      // race with a synchronous layer teardown.
      const hosts = [];
      for (const host of registry.hostsFor(ctx.component.id)) {
        if (ctx._gwSkippedRenderless || host.config.mode === 'off' || (ctx.isSync && !host.config.sync) || (ctx.isPoll && !host.config.poll)) continue;
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
        // restoreActionOverride() must run for every host regardless of the
        // skip decision below (unlike messageStart/messagePostPaint/
        // messageFinish's balancing, which only need to agree with onStart
        // when they're SKIPPED). A host that never got scheduler.messageStart
        // this message (e.g. because a method-level override just flipped
        // its mode to 'off') still had applyActionOverride() mutate its
        // host.config in onStart -- if the override is not restored here
        // too, it leaks permanently into host.config, since a later message
        // with no matching actionOverrides entry has nothing to restore it
        // from (applyActionOverride() only sets up a NEW override or clears
        // its own _gwBaseConfig bookkeeping; it never undoes a stale one).
        const skip = ctx._gwSkippedRenderless
          || host.config.mode === 'off'
          || (ctx.isSync && !host.config.sync)
          || (ctx.isPoll && !host.config.poll)
          || (host.targetActions && !ctx.actionNames.some((name) => host.targetActions.includes(name)))
          || (host.config.only && !ctx.actionNames.some((name) => host.config.only.includes(name)))
          || (host.config.except && ctx.actionNames.some((name) => host.config.except.includes(name)));
        if (!skip) scheduler.messageFinish(host);
        restoreActionOverride(host);
      }
    },
  });
}

// Per-message action-scoped override (SPEC-API-10 method-level #[Ghost]).
// Temporarily mutates host.config for the lifetime of one message
// (onStart..onFinish) rather than threading a parallel "effective config"
// through every downstream reader (scheduler/renderer/synthesizer all
// already read host.config directly, at various points across that
// lifetime) — restored in onFinish. ponytail: assumes a host's messages
// are never concurrently interleaved (matches this codebase's existing
// single-flight assumption for ctx._gwSkippedRenderless); revisit if
// Livewire ever pipelines overlapping commits to the same component.
function applyActionOverride(host, ctx) {
  host._gwBaseConfig = null;
  if (!host.actionOverrides) return;

  let merged = null;
  for (const name of ctx.actionNames) {
    const fields = host.actionOverrides[name];
    if (!fields) continue;
    merged = merged ? { ...fields, ...merged } : { ...fields }; // nearest-first: earlier actionNames win
  }
  if (!merged) return;

  for (const key of Object.keys(host.directiveConfig)) delete merged[key]; // directive always outranks method-level
  if (Object.keys(merged).length === 0) return;

  host._gwBaseConfig = host.config;
  host.config = { ...host.config, ...merged };
}

function restoreActionOverride(host) {
  if (host._gwBaseConfig) {
    host.config = host._gwBaseConfig;
    host._gwBaseConfig = null;
  }
}

function pickOverrides(config) {
  const overrides = {};
  if (typeof config.delay === 'number') overrides.delay = config.delay;
  if (typeof config.hold === 'number') overrides.hold = config.hold;
  return overrides;
}

document.addEventListener('livewire:init', boot);
