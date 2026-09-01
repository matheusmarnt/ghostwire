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
  define: { 'process.env.NODE_ENV': '"production"' },
});

if (existsSync('js/src/style.css')) {
  copyFileSync('js/src/style.css', 'resources/dist/ghostwire.css');
}

console.log('built resources/dist/ghostwire.js');
