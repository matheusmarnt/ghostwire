import { describe, it, expect, afterEach } from 'vitest';
import { parseAttributeConfig } from '../src/attributeConfig.js';

function elWith(payload) {
  const el = document.createElement('div');
  el.setAttribute('data-ghost', JSON.stringify(payload));

  return el;
}

describe('learning transport in the data-ghost schema', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('parses the learning flag and component name', () => {
    const config = parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: 'orders-table' }));

    expect(config.learning).toBe(true);
    expect(config.name).toBe('orders-table');
  });

  it('defaults learning off and name null when the server sent neither', () => {
    const config = parseAttributeConfig(elWith({ m: 'synthesize' }));

    expect(config.learning).toBe(false);
    expect(config.name).toBeNull();
  });

  it('discards the whole payload when the learning flag is not a boolean (SPEC-SEC-02 fail-closed)', () => {
    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: 'yes' }))).toBeNull();
  });

  it('discards the whole payload when the component name breaks the charset', () => {
    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: '<img src=x>' }))).toBeNull();
  });

  it('discards the whole payload when the component name is over-long', () => {
    expect(parseAttributeConfig(elWith({ m: 'synthesize', g: true, n: 'a'.repeat(65) }))).toBeNull();
  });
});
