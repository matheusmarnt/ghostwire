<p align="center">
  <a href="../README.md">🇬🇧 English</a> · <strong>🇧🇷 Português</strong> · <a href="readme-es.md">🇪🇸 Español</a>
</p>

# Ghostwire

Carregadores automáticos de esqueleto em runtime para Livewire — sintetizados a partir do seu DOM ao vivo, sem markup.

Adicione `wire:ghost` a qualquer elemento (ou `#[Ghost]` a uma classe de componente, sem nenhuma alteração na view) e o Ghostwire sintetiza um esqueleto correspondente a partir do DOM ao vivo no instante em que uma requisição do Livewire começa — sem markup de placeholder escrito à mão, sem layout shift, e funciona de forma idêntica seja qual for a versão do Livewire usada pela sua aplicação, 3.6+ ou 4.x.

## Funcionalidades

- **Síntese sem markup** — percorre o DOM ao vivo, classifica nós de texto/título/mídia/controle/container, e emite uma Bone Tree correspondente, tudo em uma única passagem de leitura em lote (sem forçar reflow)
- **Bridge dual para Livewire** — Livewire 3.6+ e 4.x suportados a partir do mesmo pacote, selecionados por detecção de recursos em runtime (nunca por verificação de string de versão)
- **Seguro para morph** — a Ghost Layer é montada fora da árvore reconciliada pelo Livewire; o ocultamento usa apenas `visibility`/`opacity`/`pointer-events`, nunca uma alteração estrutural do DOM
- **Modo `freeze`** — escurece e desabilita o host ao vivo no lugar, para layouts que a síntese não consegue cobrir com segurança
- **Atributo `#[Ghost]`** — em nível de classe ou método, com uma cascata de precedência de 7 níveis (modificador de diretiva → expressão de diretiva → método → classe → herdado → config → padrão do pacote), sem nenhuma alteração na view
- **Silêncio por padrão** — mensagens somente de sync e de polling nunca disparam um ghost, então atualizações em segundo plano permanecem invisíveis
- **Amostragem de irmãos repetidos, recorte de áreas roláveis, geometria sticky/fixed** — layouts reais (tabelas paginadas, quadros kanban, painéis roláveis) são sintetizados corretamente, não apenas cards simples
- **Temas** — animações shimmer/pulse/wave, dark mode automático, suporte a `prefers-reduced-motion`, tudo em CSS puro por trás de tokens de dados/variáveis CSS
- **Acessibilidade** — `aria-busy`, preservação de foco durante toda a janela do ghost, uma live region compartilhada anunciando o estado de carregamento/ocioso; limpo no axe-core no nível mais rigoroso
- **Seguro para CSP** — funciona sob uma Content-Security-Policy estrita (sem scripts inline, sem `eval`); suporte a nonce de stylesheet embutido
- **`php artisan ghost:inspect`** — veja exatamente qual nível de precedência decidiu a configuração de cada componente
- **Aprendizado** — lembra o esqueleto sintetizado de um componente localmente (opt-in, recusado em produção), para que o primeiro paint lazy de um componente em uma visita posterior já tenha um placeholder correspondente — exporte-o com `php artisan ghost:export` como um `@placeholder` Blade estático

## Requisitos e compatibilidade

| | Suportado |
|---|---|
| PHP | 8.2, 8.3, 8.4 |
| Laravel | 12.x, 13.x |
| Livewire | 3.6+, 4.x |

### Matriz de tiers (FR-81)

A seleção do bridge é feita por detecção de recursos em runtime, nunca por string de versão. Tudo abaixo é verificado em ambas as linhas no CI.

| Tier | Capacidades |
|---|---|
| **A — idêntico** | Diretiva + todos os modificadores exceto `.island` · `#[Ghost]` completo (classe, método, herança, precedência) · síntese · `freeze` · temporização (delay/hold/timeout) · silêncio de sync · tema e tokens · acessibilidade · coexistência com morph |
| **B — degradado no 3.x** | Remoção pós-pintura (emulada via `requestAnimationFrame` duplo) · finalização (composta a partir de múltiplos hooks) · cancelamento (resolvido como finalização) · detecção de poll (heurística de origem) · interceptação por ação (filtro em nível de bridge — mesmo comportamento observável) |
| **C — somente 4.x** | Escopo de island (`.island`) · tratamento de message-skip |

Detalhes completos: [`/docs/compat`](https://matheusmarnt.github.io/ghostwire/docs/compat/).

## Instalação

```bash
composer require matheusmarnt/ghostwire
```

```blade
<div wire:ghost>
    {{-- your existing Livewire markup, unchanged --}}
</div>
```

Veja [`/docs/install`](https://matheusmarnt.github.io/ghostwire/docs/install/) para o passo a passo completo do primeiro efeito, e [`/playground`](https://matheusmarnt.github.io/ghostwire/playground/) para testar a síntese no seu próprio markup sem instalar nada.

## Aprendizado

O Ghostwire pode lembrar o esqueleto sintetizado de um componente localmente no navegador e reutilizá-lo na próxima vez que esse componente estiver prestes a carregar de forma lazy — assim, o primeiro lazy paint de uma visita posterior já tem um esqueleto correspondente, em vez de um placeholder em branco. Desativado por padrão, e recusado no lado do servidor em produção independentemente da config.

```bash
GHOSTWIRE_LEARNING=true
```

```php
#[Ghost(lazy: true)]
class OrdersTable extends Component
{
    // ...
}
```

```
Ghostwire.exportLearned()      // no navegador: baixa ghostwire-learned.json
php artisan ghost:export --component=orders-table --breakpoint=lg --from=~/Downloads/ghostwire-learned.json
```

Passo a passo completo, detalhes de armazenamento/privacidade, e a postura de segurança do comando de exportação: [`/docs/learning`](https://matheusmarnt.github.io/ghostwire/docs/learning/).

## Documentação

Documentação completa, playground ao vivo e galeria: **<https://matheusmarnt.github.io/ghostwire/>**

- [`/docs/wire-ghost`](https://matheusmarnt.github.io/ghostwire/docs/wire-ghost/) — diretiva e modificadores
- [`/docs/ghost-attribute`](https://matheusmarnt.github.io/ghostwire/docs/ghost-attribute/) — atributo `#[Ghost]` e precedência
- [`/docs/learning`](https://matheusmarnt.github.io/ghostwire/docs/learning/) — persistência local, esqueletos lazy, `ghost:export`
- [`/docs/choosing`](https://matheusmarnt.github.io/ghostwire/docs/choosing/) — diretiva vs. atributo
- [`/docs/compat`](https://matheusmarnt.github.io/ghostwire/docs/compat/) — matriz de tiers do Livewire 3/4
- [`/docs/theming`](https://matheusmarnt.github.io/ghostwire/docs/theming/) — tokens, dark mode, animação
- [`/docs/how-it-works`](https://matheusmarnt.github.io/ghostwire/docs/how-it-works/) — o algoritmo de síntese
- [`/docs/security`](https://matheusmarnt.github.io/ghostwire/docs/security/) — CSP, transporte, cadeia de suprimentos
- [`/docs/testing`](https://matheusmarnt.github.io/ghostwire/docs/testing/) — helpers do Pest e testes de navegador
- [`/docs/interop`](https://matheusmarnt.github.io/ghostwire/docs/interop/) — `@placeholder`, Wirebones, Flux, livecharts, scoutify

## Segurança

Veja [`SECURITY.md`](SECURITY.md) e [`/docs/security`](https://matheusmarnt.github.io/ghostwire/docs/security/). Nenhum dado do DOM sai do navegador; o aprendizado é feito localmente; telemetria zero (FR-93).

## Outros pacotes do autor

- [livecharts](https://github.com/matheusmarnt/livecharts)
- [scoutify](https://github.com/matheusmarnt/scoutify)
- [scoutify-mcp](https://github.com/matheusmarnt/scoutify-mcp)

## Licença

MIT © [Matheus Mariano](https://github.com/matheusmarnt). Veja [LICENSE.md](LICENSE.md).
