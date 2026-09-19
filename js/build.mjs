import { build } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

mkdirSync('resources/dist', { recursive: true });

await build({
  entryPoints: ['js/src/index.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'resources/dist/ghostwire.js',
  legalComments: 'none',
  // SPEC-PERF-08: <= 10 KB gzip with both bridges included. Measured on the
  // v1.0.0 source: 12.8 KB unminified, 9.5 KB minified. The runtime debug
  // diagnostics (js/src/debug.js) stay in — they cost ~160 bytes and are the
  // only feedback channel a developer has (see that file's header).
  minify: true,
});

if (existsSync('js/src/style.css')) {
  copyFileSync('js/src/style.css', 'resources/dist/ghostwire.css');
}

console.log('built resources/dist/ghostwire.js');
