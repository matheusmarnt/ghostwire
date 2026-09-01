import { describe, it, expect } from 'vitest';
import { createRegistry } from '../src/registry.js';

describe('registry', () => {
  it('attaches a host and finds it by element', () => {
    const registry = createRegistry();
    const el = document.createElement('div');
    const component = { id: 'comp-1' };
    const host = registry.attach(el, component, { mode: 'freeze' });

    expect(host.el).toBe(el);
    expect(host.component).toBe(component);
    expect(host.state).toBe('idle');
    expect(host.pending).toBe(0);
    expect(host.layer).toBeNull();
    expect(registry.hostFor(el)).toBe(host);
  });

  it('indexes hosts by component id, and can hold more than one host per component', () => {
    const registry = createRegistry();
    const component = { id: 'comp-1' };
    const hostA = registry.attach(document.createElement('div'), component, {});
    const hostB = registry.attach(document.createElement('span'), component, {});

    const hosts = registry.hostsFor('comp-1');
    expect(hosts.size).toBe(2);
    expect(hosts.has(hostA)).toBe(true);
    expect(hosts.has(hostB)).toBe(true);
  });

  it('detach removes the host from both indexes', () => {
    const registry = createRegistry();
    const el = document.createElement('div');
    const component = { id: 'comp-1' };
    const host = registry.attach(el, component, {});

    registry.detach(host);

    expect(registry.hostFor(el)).toBeNull();
    expect(registry.hostsFor('comp-1').size).toBe(0);
  });

  it('detaching one host of a component leaves the sibling host indexed', () => {
    const registry = createRegistry();
    const component = { id: 'comp-1' };
    const hostA = registry.attach(document.createElement('div'), component, {});
    const hostB = registry.attach(document.createElement('span'), component, {});

    registry.detach(hostA);

    const hosts = registry.hostsFor('comp-1');
    expect(hosts.size).toBe(1);
    expect(hosts.has(hostB)).toBe(true);
  });
});
