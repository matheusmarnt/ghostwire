export const locales = ['en', 'pt-br', 'es'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// BCP-47 tag for the <html lang> attribute — distinct from the URL segment
// (which stays lowercase-hyphenated, matching astro.config.mjs's `locales` keys).
export const htmlLang: Record<Locale, string> = {
  en: 'en',
  'pt-br': 'pt-BR',
  es: 'es',
};

export const ui = {
  en: {
    'nav.home': 'Home',
    'nav.docs': 'Docs',
    'nav.playground': 'Playground',
    'nav.gallery': 'Gallery',
    'nav.about': 'About',
    'nav.github': 'GitHub',

    'home.title': 'Ghostwire — automatic runtime skeleton loaders for Livewire',
    'home.description': 'Synthesized from your live DOM, zero markup. Dual Livewire 3.6+/4.x bridge.',
    'home.heroTitle': 'Skeleton loaders your Livewire app already deserves.',
    'home.heroBody': 'Add <code>wire:ghost</code> to any element. Ghostwire synthesizes a matching skeleton from your live DOM the instant a request starts — no hand-written placeholder markup, zero layout shift.',
    'home.ctaStart': 'Get started',
    'home.ctaPlayground': 'Try the playground',
    'home.ctaGallery': 'See the gallery',
    'home.latencyLabel': 'Simulated network latency:',
    'home.withoutGhostwire': 'Without Ghostwire',
    'home.withGhostwire': 'With Ghostwire',
    'home.blankLoading': '(blank while loading — then content pops in)',
    'home.blankLoadingEllipsis': '(blank while loading…)',
    'home.feature1Title': 'Zero markup',
    'home.feature1Body': 'Walks the live DOM and classifies nodes automatically — no placeholder templates to hand-author or keep in sync.',
    'home.feature2Title': 'Dual Livewire bridge',
    'home.feature2Body': '3.6+ and 4.x from the same package, selected by runtime feature detection, never a version string.',
    'home.feature3Title': 'Morph-safe by construction',
    'home.feature3Body': "The Ghost Layer never touches Livewire's reconciled tree — concealment is visibility/opacity only.",
    'home.feature4Title': 'Accessible by default',
    'home.feature4Body': '<code>aria-busy</code>, focus preservation, and a shared live region — axe-core clean at the strictest level.',

    'about.title': 'About — Ghostwire',
    'about.heading': 'About',
    'about.bio': "Ghostwire is built by <a href=\"https://github.com/matheusmarnt\" class=\"gw-accent-link\">Matheus Mariano</a>, a software engineer specializing in AI and GovTech. It's the fourth package in a line that tells one story — data → search → AI → rendering — alongside:",

    'gallery.title': 'Gallery — Ghostwire',
    'gallery.heading': 'Gallery',
    'gallery.intro': "Real layouts, real synthesis — live content and Ghostwire's synthesized skeleton, side by side.",
    'gallery.liveSynthesis': 'Live synthesis',
    'gallery.liveContent': 'Live content',
    'gallery.skeleton': 'Ghostwire skeleton',

    'playground.title': 'Playground — Ghostwire',
    'playground.heading': 'Playground',
    'playground.body': 'Edit the markup on the left. Click "Synthesize" to run Ghostwire\'s real, unmodified synthesizer against the live preview on the right.',
    'playground.note': 'This edits an HTML/Blade-flavored subset, not full Blade — the synthesizer walks the live rendered DOM, exactly as it does inside a real Livewire component, so what you see here is genuinely how Ghostwire would skeletonize this markup in your app. The card below carries a real <code>wire:ghost</code> directive; that\'s the element Ghostwire targets, same as it would inside a Livewire component. Try <code>wire:ghost.freeze</code> or <code>wire:ghost.off</code> to see those modes too. The preview updates as you type; click "Synthesize" to run Ghostwire\'s real, unmodified synthesizer against it.',
    'playground.synthesize': 'Synthesize',
    'playground.reset': 'Reset',
    'playground.livePreview': 'Live preview',
  },
  'pt-br': {
    'nav.home': 'Início',
    'nav.docs': 'Docs',
    'nav.playground': 'Playground',
    'nav.gallery': 'Galeria',
    'nav.about': 'Sobre',
    'nav.github': 'GitHub',

    'home.title': 'Ghostwire — carregadores automáticos de esqueleto em runtime para Livewire',
    'home.description': 'Sintetizado a partir do seu DOM ao vivo, sem markup. Bridge dupla para Livewire 3.6+/4.x.',
    'home.heroTitle': 'Os skeleton loaders que seu app Livewire já merece.',
    'home.heroBody': 'Adicione <code>wire:ghost</code> a qualquer elemento. O Ghostwire sintetiza um esqueleto correspondente a partir do seu DOM ao vivo no instante em que uma requisição começa — sem markup de placeholder escrito à mão, sem layout shift.',
    'home.ctaStart': 'Começar',
    'home.ctaPlayground': 'Testar o playground',
    'home.ctaGallery': 'Ver a galeria',
    'home.latencyLabel': 'Latência de rede simulada:',
    'home.withoutGhostwire': 'Sem o Ghostwire',
    'home.withGhostwire': 'Com o Ghostwire',
    'home.blankLoading': '(em branco durante o carregamento — depois o conteúdo aparece)',
    'home.blankLoadingEllipsis': '(em branco durante o carregamento…)',
    'home.feature1Title': 'Sem markup',
    'home.feature1Body': 'Percorre o DOM ao vivo e classifica os nós automaticamente — sem templates de placeholder para escrever à mão ou manter sincronizados.',
    'home.feature2Title': 'Bridge dupla para Livewire',
    'home.feature2Body': '3.6+ e 4.x no mesmo pacote, selecionado por detecção de recursos em runtime, nunca por uma string de versão.',
    'home.feature3Title': 'Morph-safe por construção',
    'home.feature3Body': 'A Ghost Layer nunca toca na árvore reconciliada do Livewire — o ocultamento é feito só por visibility/opacity.',
    'home.feature4Title': 'Acessível por padrão',
    'home.feature4Body': '<code>aria-busy</code>, preservação de foco e uma live region compartilhada — limpo no axe-core no nível mais estrito.',

    'about.title': 'Sobre — Ghostwire',
    'about.heading': 'Sobre',
    'about.bio': 'O Ghostwire é construído por <a href="https://github.com/matheusmarnt" class="gw-accent-link">Matheus Mariano</a>, engenheiro de software especializado em IA e GovTech. É o quarto pacote de uma linha que conta uma história — dados → busca → IA → renderização — ao lado de:',

    'gallery.title': 'Galeria — Ghostwire',
    'gallery.heading': 'Galeria',
    'gallery.intro': 'Layouts reais, síntese real — conteúdo ao vivo e o esqueleto sintetizado pelo Ghostwire, lado a lado.',
    'gallery.liveSynthesis': 'Síntese ao vivo',
    'gallery.liveContent': 'Conteúdo ao vivo',
    'gallery.skeleton': 'Esqueleto do Ghostwire',

    'playground.title': 'Playground — Ghostwire',
    'playground.heading': 'Playground',
    'playground.body': 'Edite o markup à esquerda. Clique em "Sintetizar" para rodar o sintetizador real e inalterado do Ghostwire contra a prévia ao vivo à direita.',
    'playground.note': 'Isso edita um subconjunto no estilo HTML/Blade, não Blade completo — o sintetizador percorre o DOM renderizado ao vivo, exatamente como faz dentro de um componente Livewire real, então o que você vê aqui é genuinamente como o Ghostwire esqueletizaria esse markup no seu app. O card abaixo carrega uma diretiva <code>wire:ghost</code> real; esse é o elemento que o Ghostwire tem como alvo, do mesmo jeito que faria dentro de um componente Livewire. Experimente <code>wire:ghost.freeze</code> ou <code>wire:ghost.off</code> para ver esses modos também. A prévia atualiza enquanto você digita; clique em "Sintetizar" para rodar o sintetizador real e inalterado do Ghostwire contra ela.',
    'playground.synthesize': 'Sintetizar',
    'playground.reset': 'Redefinir',
    'playground.livePreview': 'Prévia ao vivo',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.docs': 'Docs',
    'nav.playground': 'Playground',
    'nav.gallery': 'Galería',
    'nav.about': 'Acerca de',
    'nav.github': 'GitHub',

    'home.title': 'Ghostwire — cargadores automáticos de esqueleto en runtime para Livewire',
    'home.description': 'Sintetizado desde tu DOM en vivo, sin markup. Bridge dual para Livewire 3.6+/4.x.',
    'home.heroTitle': 'Los skeleton loaders que tu app Livewire ya se merece.',
    'home.heroBody': 'Agrega <code>wire:ghost</code> a cualquier elemento. Ghostwire sintetiza un esqueleto correspondiente a partir de tu DOM en vivo en el instante en que empieza una solicitud — sin markup de placeholder escrito a mano, sin layout shift.',
    'home.ctaStart': 'Comenzar',
    'home.ctaPlayground': 'Probar el playground',
    'home.ctaGallery': 'Ver la galería',
    'home.latencyLabel': 'Latencia de red simulada:',
    'home.withoutGhostwire': 'Sin Ghostwire',
    'home.withGhostwire': 'Con Ghostwire',
    'home.blankLoading': '(en blanco mientras carga — luego el contenido aparece)',
    'home.blankLoadingEllipsis': '(en blanco mientras carga…)',
    'home.feature1Title': 'Sin markup',
    'home.feature1Body': 'Recorre el DOM en vivo y clasifica los nodos automáticamente — sin plantillas de placeholder que escribir a mano ni mantener sincronizadas.',
    'home.feature2Title': 'Bridge dual para Livewire',
    'home.feature2Body': '3.6+ y 4.x en el mismo paquete, seleccionado por detección de características en runtime, nunca por una cadena de versión.',
    'home.feature3Title': 'Seguro ante el morph por construcción',
    'home.feature3Body': 'La Ghost Layer nunca toca el árbol reconciliado de Livewire — el ocultamiento es solo visibility/opacity.',
    'home.feature4Title': 'Accesible por defecto',
    'home.feature4Body': '<code>aria-busy</code>, preservación de foco y una live region compartida — limpio en axe-core en el nivel más estricto.',

    'about.title': 'Acerca de — Ghostwire',
    'about.heading': 'Acerca de',
    'about.bio': 'Ghostwire está construido por <a href="https://github.com/matheusmarnt" class="gw-accent-link">Matheus Mariano</a>, ingeniero de software especializado en IA y GovTech. Es el cuarto paquete de una línea que cuenta una historia — datos → búsqueda → IA → renderizado — junto a:',

    'gallery.title': 'Galería — Ghostwire',
    'gallery.heading': 'Galería',
    'gallery.intro': 'Layouts reales, síntesis real — contenido en vivo y el esqueleto sintetizado por Ghostwire, lado a lado.',
    'gallery.liveSynthesis': 'Síntesis en vivo',
    'gallery.liveContent': 'Contenido en vivo',
    'gallery.skeleton': 'Esqueleto de Ghostwire',

    'playground.title': 'Playground — Ghostwire',
    'playground.heading': 'Playground',
    'playground.body': 'Edita el markup a la izquierda. Haz clic en "Sintetizar" para ejecutar el sintetizador real, sin modificar, de Ghostwire contra la vista previa en vivo a la derecha.',
    'playground.note': 'Esto edita un subconjunto al estilo HTML/Blade, no Blade completo — el sintetizador recorre el DOM renderizado en vivo, exactamente como lo hace dentro de un componente Livewire real, así que lo que ves aquí es genuinamente cómo Ghostwire esqueletizaría este markup en tu app. La tarjeta de abajo lleva una directiva <code>wire:ghost</code> real; ese es el elemento que Ghostwire toma como objetivo, igual que lo haría dentro de un componente Livewire. Prueba <code>wire:ghost.freeze</code> o <code>wire:ghost.off</code> para ver también esos modos. La vista previa se actualiza mientras escribes; haz clic en "Sintetizar" para ejecutar el sintetizador real, sin modificar, de Ghostwire contra ella.',
    'playground.synthesize': 'Sintetizar',
    'playground.reset': 'Restablecer',
    'playground.livePreview': 'Vista previa en vivo',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function useTranslations(lang: Locale) {
  return function t(key: keyof (typeof ui)['en']): string {
    return ui[lang]?.[key] ?? ui[defaultLocale][key];
  };
}

// Builds the base+locale-prefixed path for one of the four custom pages.
// `page` is '' for home, or 'about/' | 'gallery/' | 'playground/'.
export function pagePath(page: string, lang: Locale, base: string): string {
  const prefix = lang === defaultLocale ? '' : `${lang}/`;
  return `${base}${prefix}${page}`;
}
