// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://matheusmarnt.github.io',
  base: '/ghostwire/',
  // Tailwind only styles the gallery's own fixture examples (see
  // src/styles/tailwind.css, imported only from gallery.astro) — the rest
  // of the site stays on the hand-written token system in tokens.css.
  vite: {
    plugins: [tailwindcss()],
  },
  // GFM (tables, etc.) does not turn on by default for this
  // Astro/Starlight/@astrojs/mdx version combo despite `extendMarkdownConfig`
  // defaulting to true — every `.mdx` table in the docs rendered as a raw
  // `| a | b |` paragraph until this was set explicitly. Root-caused by
  // tracing @astrojs/mdx's resolved `gfm` option through its dependency
  // chain; verified empirically (table tag present in the build output
  // only with this line in place).
  markdown: { gfm: true },
  integrations: [
    starlight({
      title: 'Ghostwire',
      description: 'Automatic runtime skeleton loaders for Livewire — synthesized from your live DOM, zero markup.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        'pt-br': { label: 'Português do Brasil', lang: 'pt-BR' },
        es: { label: 'Español', lang: 'es' },
      },
      logo: {
        light: './src/assets/ghostwire-light.png',
        dark: './src/assets/ghostwire.png',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
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
          translations: { 'pt-BR': 'Primeiros Passos', es: 'Primeros Pasos' },
          items: [
            { label: 'Install', translations: { 'pt-BR': 'Instalação', es: 'Instalación' }, slug: 'docs/install' },
            { label: 'Choosing directive vs. attribute', translations: { 'pt-BR': 'Escolhendo entre diretiva e atributo', es: 'Elegir entre directiva y atributo' }, slug: 'docs/choosing' },
          ],
        },
        {
          label: 'Usage',
          translations: { 'pt-BR': 'Uso', es: 'Uso' },
          items: [
            { label: 'wire:ghost directive', translations: { 'pt-BR': 'Diretiva wire:ghost', es: 'Directiva wire:ghost' }, slug: 'docs/wire-ghost' },
            { label: '#[Ghost] attribute', translations: { 'pt-BR': 'Atributo #[Ghost]', es: 'Atributo #[Ghost]' }, slug: 'docs/ghost-attribute' },
            { label: 'Learning', translations: { 'pt-BR': 'Aprendizado', es: 'Aprendizaje' }, slug: 'docs/learning' },
            { label: 'Theming', translations: { 'pt-BR': 'Temas', es: 'Temas' }, slug: 'docs/theming' },
          ],
        },
        {
          label: 'Compatibility & Security',
          translations: { 'pt-BR': 'Compatibilidade e Segurança', es: 'Compatibilidad y Seguridad' },
          items: [
            { label: 'Livewire 3/4 compatibility', translations: { 'pt-BR': 'Compatibilidade com Livewire 3/4', es: 'Compatibilidad con Livewire 3/4' }, slug: 'docs/compat' },
            { label: 'Security', translations: { 'pt-BR': 'Segurança', es: 'Seguridad' }, slug: 'docs/security' },
          ],
        },
        {
          label: 'Reference',
          translations: { 'pt-BR': 'Referência', es: 'Referencia' },
          items: [
            { label: 'How it works', translations: { 'pt-BR': 'Como funciona', es: 'Cómo funciona' }, slug: 'docs/how-it-works' },
            { label: 'Testing', translations: { 'pt-BR': 'Testes', es: 'Pruebas' }, slug: 'docs/testing' },
            { label: 'Interop', translations: { 'pt-BR': 'Interoperabilidade', es: 'Interoperabilidad' }, slug: 'docs/interop' },
          ],
        },
      ],
      // Astro pages under src/pages/ (/, /about, /gallery, /playground) render
      // outside Starlight's own layout — see Tasks 5, 8, 9.
    }),
  ],
});
