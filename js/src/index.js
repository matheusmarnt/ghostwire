import { detectBridge } from './bridge/index.js';
import { createRegistry } from './registry.js';
import { createScheduler } from './scheduler.js';
import { createRenderer } from './renderer.js';
import { createSynthesizer } from './synthesizer/index.js';

const TIMED_MODIFIER_PATTERN = /^(delay|hold)\.(\d+)ms$/;

function parseModifiers(modifiers) {
  const config = { mode: 'synthesize', off: false, ignore: false, keep: false };
  for (const modifier of modifiers) {
    if (modifier === 'freeze') config.mode = 'freeze';
    else if (modifier === 'off') config.off = true;
    else if (modifier === 'ignore') config.ignore = true;
    else if (modifier === 'keep') config.keep = true;
    else if (modifier === 'island') { /* no-op on v3 and v4 alike for M1 — SPEC-INT-13 lands in M9 */ }
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
      if (host.config.off || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze') { renderer.freeze(host); return; }

      const boneTree = synthesizer.synthesize(host);
      if (!boneTree) { renderer.freeze(host); host.degraded = true; return; } // SPEC-SYN-16/17 degrade

      renderer.mountLayer(host);
      renderer.renderBones(host, boneTree);
      host.el.classList.add('gw-concealed');
    },
    onHide(host) {
      if (host.config.off || host.config.ignore || host.config.keep) return;
      if (host.config.mode === 'freeze' || host.degraded) { renderer.unfreeze(host); host.degraded = false; return; }
      renderer.removeLayer(host);
      host.el.classList.remove('gw-concealed');
    },
  });

  window.Livewire.directive('ghost', ({ el, directive, component, cleanup }) => {
    const config = parseModifiers(directive.modifiers);
    if (config.off) { cleanup(() => {}); return; }

    const host = registry.attach(el, component, config);
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
        if (host.config.off) continue;
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
