import { createV4Bridge } from './v4.js';
import { createV3Bridge } from './v3.js';

export function detectBridge() {
  if (typeof window.Livewire?.interceptMessage === 'function') {
    return { name: 'v4', bridge: createV4Bridge() };
  }
  if (typeof window.Livewire?.hook === 'function') {
    return { name: 'v3', bridge: createV3Bridge() };
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[ghostwire] neither Livewire.interceptMessage nor Livewire.hook was found — disabling (SPEC-INT-20)');
  }
  return { name: null, bridge: null };
}
