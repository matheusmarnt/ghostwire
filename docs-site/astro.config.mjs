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
      // No explicit `sidebar` key yet — Starlight fatally validates every
      // sidebar `slug` against the content collection at build time, and
      // none of the /docs/* pages exist until Tasks 6-7 create them.
      // Starlight auto-generates nav from whatever content exists in the
      // meantime (just `index.mdx` right now). Task 7's final step adds the
      // explicit sidebar array below, once all 10 referenced slugs exist.
      // Astro pages under src/pages/ (/, /about, /gallery, /playground) render
      // outside Starlight's own layout — see Tasks 5, 8, 9.
    }),
  ],
});
