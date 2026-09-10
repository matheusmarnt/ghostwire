// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://matheusmarnt.github.io',
  base: '/ghostwire',
  integrations: [
    starlight({
      title: 'Ghostwire',
      description: 'Automatic runtime skeleton loaders for Livewire — synthesized from your live DOM, zero markup.',
      logo: {
        src: './src/assets/ghostwire.png',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      editLink: {
        baseUrl: 'https://github.com/matheusmarnt/ghostwire/edit/main/docs-site/',
      },
      lastUpdated: true,
      pagination: true,
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/matheusmarnt/ghostwire',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Install', slug: 'docs/install' },
            { label: 'Choosing directive vs. attribute', slug: 'docs/choosing' },
          ],
        },
        {
          label: 'Usage',
          items: [
            { label: 'wire:ghost directive', slug: 'docs/wire-ghost' },
            { label: '#[Ghost] attribute', slug: 'docs/ghost-attribute' },
            { label: 'Theming', slug: 'docs/theming' },
          ],
        },
        {
          label: 'Compatibility & Security',
          items: [
            { label: 'Livewire 3/4 compatibility', slug: 'docs/compat' },
            { label: 'Security', slug: 'docs/security' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'How it works', slug: 'docs/how-it-works' },
            { label: 'Testing', slug: 'docs/testing' },
            { label: 'Interop', slug: 'docs/interop' },
          ],
        },
      ],
      // Astro pages under src/pages/ (/, /about, /gallery, /playground) render
      // outside Starlight's own layout — see Tasks 5, 8, 9.
    }),
  ],
});
