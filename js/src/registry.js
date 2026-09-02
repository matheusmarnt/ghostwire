export function createRegistry() {
  const byElement = new WeakMap();
  const byComponentId = new Map();

  function attach(el, component, config) {
    const host = { el, component, config, state: 'idle', pending: 0, layer: null };
    byElement.set(el, host);

    const id = component.id;
    if (!byComponentId.has(id)) byComponentId.set(id, new Set());
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
    return byComponentId.get(componentId) || new Set();
  }

  function hostFor(el) {
    return byElement.get(el) || null;
  }

  return { attach, detach, hostsFor, hostFor };
}
