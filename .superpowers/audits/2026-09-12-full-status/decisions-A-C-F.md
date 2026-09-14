# Parecer técnico — itens A1, A2, C5 e Grupo F

Data: 2026-09-12 · contra `main` @ `ae342e8` · **todas as afirmações abaixo foram
verificadas no código desta árvore**, não herdadas dos relatórios de audit.
Onde discordo do audit, digo-o explicitamente.

---

## A2 — `strategy` (a maior questão aberta)

### Factos verificados

| Fonte | O que diz |
|---|---|
| `PRD-ghostwire.md` FR-01/02/03 | Ativação por diretiva `wire:ghost`, por `#[Ghost]` em classe, por `#[Ghost]` em método. |
| `PRD-ghostwire.md` **FR-04** | "Modo global **por configuração**, com opt-out via `wire:ghost.off` ou `#[Ghost(mode:'off')]`". |
| `SDD-ghostwire.md` §10.5 | Linha da matriz de decisão: *"60 componentes legados em Livewire 3, sem tocar em view" → `#[Ghost]` + **estratégia global***. |
| `SDD-ghostwire.md` §10.6 | `'strategy' => 'opt-in'` é o default publicado. |
| `src/Livewire/GhostComponentHook.php:render()` | **Zero gates.** Estampa `data-ghost` em todo root de componente Livewire. |
| `js/src/index.js:276` | Auto-attach de qualquer host cujo `attributeConfig.mode !== 'off'`. |

**Conclusão sobre a especificação: não há ambiguidade.** Opt-in é o default
projetado; `global` é a válvula de escape do FR-04. O comportamento atual é o
FR-04 ligado permanentemente e sem desligamento — o que torna a palavra
"ativação" em FR-01/FR-02 ficcional: a diretiva e o atributo não *ativam* nada,
apenas *afinam* algo que já está ligado.

### Contra deletar a chave (a opção que eu próprio tinha recomendado antes — está errada)

**1. Raio de explosão e princípio da menor surpresa.**
Este pacote muta o DOM de *todo* componente Livewire em *todo* commit. Global
por default significa que `composer require` + `@ghostwireScripts` transforma
toda tabela, todo modal, todo contador de nav em skeleton. O PR-3 do próprio PRD
— *"Invisível quando desnecessário. Piscar é pior que congelar"* — é um princípio
de produto que o global-por-default combate diretamente: os 120 ms de `delay` são
a única coisa entre o utilizador e o piscar generalizado.

**2. O custo não é zero e é pago por todos.**
Verificado em `src/Support/ConfigResolver.php`: `classChainCache` (linha 198)
cacheia **apenas** `classChain()`. `methodOverrides()` (linha 100) **não tem
cache nenhum** — faz `ReflectionClass::getMethods(IS_PUBLIC)` e, por método,
`declaredArgsForMethod()` → `getAttributes()`. Num componente com 20 métodos
públicos, são 20 varreduras de reflection **por render**, para componentes que
nunca terão skeleton. Depois disso, `Utils::insertAttributesIntoHtmlRoot()`
re-parseia o HTML root de cada componente. Isto é um conflito direto com o
PR-7 — *"ferramenta de performance percebida que degrada performance real é
autocontraditória"*.

**3. Deletar a chave deixa a SDD §10.5 a mentir.** A matriz de decisão vende
`strategy: global` como a resposta a um caso de uso nomeado. Sem a chave, não há
resposta e a linha fica falsa.

**4. Assimetria de reversibilidade — o argumento decisivo.**
Zero tags, zero utilizadores: este é o **único** momento em que qualquer das duas
escolhas é grátis. Depois de v1.0.0, global → opt-in é breaking e remove
skeletons silenciosamente de toda instalação; opt-in → global é aditivo e seguro.
A assimetria manda enviar o default restritivo agora.

### O contra-argumento honesto, e por que não procede

Sob opt-in, um componente com `wire:ghost` na view mas sem `#[Ghost]` não
receberia `data-ghost` — o servidor não vê a diretiva, que vive no Blade. Isso
partiria FR-01?

**Não.** `js/src/attributeConfig.js:173-176`:

```js
export function resolveHostConfig(directiveConfig, attributeConfig) {
  const base = attributeConfig ?? DEFAULTS;
  return { ...base, ...directiveConfig };
}
```

O caminho da diretiva (`index.js:213`) já tolera `attributeConfig === null` e cai
nos `DEFAULTS` literais. Só o caminho de auto-attach (`index.js:276`) exige
`data-ghost`. Ou seja: **`wire:ghost` já funciona hoje sem `data-ghost`.** FR-01
sobrevive intacto.

### Recomendação A2 — implementar `'opt-in'` a sério

Um predicado novo no `ConfigResolver` (existe algum `#[Ghost]` declarado na
cadeia classe/ancestrais/traits/métodos?) e um gate no hook:

```php
// GhostComponentHook::render()
if (config('ghostwire.strategy', 'opt-in') !== 'global'
    && ! $resolver->hasDeclaration($componentClass)) {
    return; // sem data-ghost; wire:ghost na view continua a funcionar
}
```

Diff pequeno, um método novo, nenhuma mudança no cliente. Ganhos: FR-01/02/03
voltam a significar ativação, FR-04 volta a ser configurável, o custo de
reflection passa a ser condicional, e o default deixa de ser o irreversível.

**Custo a assumir com honestidade:** o gate tem de correr *antes* de
`methodOverrides()` para o ganho de performance existir, e precisa do seu próprio
cache por classe (mesmo padrão do `classChainCache`). E a doc tem de passar a
dizer, em primeiro plano, que sem `#[Ghost]` ou `wire:ghost` o pacote não faz
nada — é uma mudança de narrativa de marketing, não só de config.

---

## A1 — `enabled` / `GHOSTWIRE_ENABLED`

### Facto que o audit não regista

**Já existe um kill switch funcional: `'mode' => 'off'` no config.**
`ConfigResolver::packageDefault('mode')` lê `config('ghostwire.mode')`; com
`'off'`, todo componente resolve `mode: off` → payload `{"m":"off"}` → o caminho
da diretiva sai em `index.js:214` e o auto-attach sai em `index.js:276`. Nenhum
skeleton é pintado.

Mas é um kill switch mau: o hook continua registado, a reflection continua a
correr, o `data-ghost` continua a ser estampado em todo root e o bundle continua a
ser carregado e a arrancar.

### Recomendação A1 — ligar a chave, mas no nível certo

`enabled=false` deve significar *o pacote não está lá*, não "um quarto
`mode: off`":

- `register()` — não chamar `Livewire::componentHook(...)`.
- `boot()` — não registar o listener `render.placeholder`.
- `@ghostwireScripts` / `@ghostwireStyles` — não emitir nada.

Quatro guards. É o que um responsável de operações procura às 2 da manhã quando
o pacote é suspeito num incidente. Remover a chave e dizer "usa `mode: off`" é
pior: deixa o hook a correr, a reflection a correr e ~40 KB de bundle a carregar
numa página onde já se declarou que o pacote não é desejado.

**Caveats a documentar:** `mergeConfigFrom()` corre no início do próprio
`register()`, portanto `config('ghostwire.enabled')` é legível ali — verificado
em `GhostwireServiceProvider.php:19-29`. Com `config:cache`, mudar a env var
exige `config:clear`; é Laravel normal, mas tem de estar escrito.

---

## C5 — os `console.warn` inalcançáveis

### Factos verificados

- 4 `console.warn` literais: `index.js:30`, `index.js:143`,
  `bridge/index.js:12`, `attributeConfig.js:32`. Todos atrás de
  `process.env.NODE_ENV !== 'production'`.
- `js/build.mjs` define `'process.env.NODE_ENV': '"production"'` e **não define
  `minify`** → os ramos ficam como `if(!1) console.warn(...)`, texto inerte, no
  bundle enviado. `grep -c console.warn resources/dist/ghostwire.js` = 4.
- **`attributeConfig.js` tem 23 chamadas ao helper `warn()`.** O que está a ser
  morto não são 4 diagnósticos — são 23 mensagens distintas mais 3.

### Contra a recomendação do audit (dev-flag via `data-ghost`)

É a opção mais cara das disponíveis **e está acoplada ao A2**: se A2 ficar
opt-in, componentes sem `#[Ghost]` não têm `data-ghost` nenhum — a flag de dev não
chegaria exatamente aos componentes que o programador está mais provavelmente a
depurar (*"porque é que o meu skeleton não aparece?"*). **A flag de dev não pode
viver no `data-ghost`.**

### Recomendação C5 — flag de runtime, sem segunda build

Substituir o gate `process.env.NODE_ENV` por um flag real lido no boot
(`document.currentScript.dataset.ghostwireDebug`, sem `<script>` inline e
portanto sem problema de nonce CSP), que `@ghostwireScripts` liga quando
`! app()->isProduction()`.

Isto é uma **simplificação líquida**, não uma feature nova:

- o gate atual não compra nada hoje — não encolhe o bundle (não há minify) e não
  porta nada em runtime (é sempre falso);
- sai o `define` do esbuild, sai o problema do dead-branch, entram 23+3
  diagnósticos a funcionar;
- e funcionam também ao depurar um incidente **em produção**, que é precisamente
  quando se precisa deles — algo que nem uma segunda build (`ghostwire.dev.js`)
  daria sem trocar o artefacto no servidor.

Alternativa considerada e rejeitada: duas builds. Acrescenta um artefacto que o
job `dist-reproducible` também passa a ter de verificar, e resolve menos.

---

## Grupo F

### 14. `store.js` `get()` escreve a cada leitura — **corrigir, mas o audit erra na severidade**

Confirmado (`js/src/learning/store.js`, `get()`): `entry.t = now(); write(envelope)`
— re-serializa o envelope inteiro e faz `setItem` síncrono para mexer num
timestamp.

Mas: a coleta é recusada em produção (`GhostComponentHook::learningEnabled()` →
`app()->isProduction()`), logo o store de produção está vazio e `get()` retorna
`null` **antes** de chegar ao write. **O custo do write-on-read é dev-only.**

O custo *de produção* é outro e o audit não o menciona: `paintLazyPlaceholders()`
corre a cada morph e, quando nada foi aprendido, faz `continue` **antes** de
marcar `data-ghost-lazy-painted` (`index.js:105-106`). Resultado: todo
placeholder `#[Ghost(lazy: true)]` repete `getItem` + `JSON.parse` + revalidação
integral do envelope **em cada morph, para sempre**.

Corrigir os dois de uma vez: tirar o `entry.t = now(); write(envelope)` do `get()`
(o LRU degrada para "menos-recentemente-*escrito*", o que chega — a eviction só
existe em dev e `put()` refresca a cada síntese bem-sucedida) e marcar o elemento
como resolvido mesmo quando não há árvore. ~4 linhas.

### 15. Sem migração de `SCHEMA_VERSION` — **documentar, não corrigir**

Comportamento correto, enquadramento errado. Árvores aprendidas são **cache
derivada**; descartá-las custa uma re-síntese. Escrever uma migração para uma
cache é over-engineering. O único defeito real é ser silencioso e não estar
documentado. *Uma* linha vale a pena: `STORAGE_KEY` já carrega `.v1`, portanto um
bump de versão deixaria o blob antigo órfão em `localStorage` — limpar a chave
antiga no mismatch.

### 16. Freeze monotónico por host — **documentar, não corrigir**

SPEC-PERF-07. É histerese intencional: um host que sintetiza devagar continuará a
sintetizar devagar; re-testá-lo a cada commit é como se produz flicker. Não é bug.
Corrigir só se houver caminho de recuperação barato — por exemplo reavaliar em
`resize`, já que o custo depende da largura.

### 17. `perf.yml` placeholder — **apagar o workflow, abrir issue**

Um workflow chamado `perf` que corre um `echo` é pior do que não haver workflow:
aparece verde no separador Actions e lê-se como um gate de performance a passar.
O PR-7 exige orçamento explícito; um placeholder **finge** um. Construir o gate a
sério é trabalho de M9-ou-depois (precisa de `tests/Performance`,
SPEC-PERF-01..12) e não é bloqueador de v1.0.0 — mas enviar um falso é um problema
de credibilidade em v1.0.0. Apagar, abrir issue, dizê-lo na doc.

---

## Resumo das recomendações

| Item | Recomendação | Natureza |
|---|---|---|
| **A2** `strategy` | **Implementar `'opt-in'`** (gate no hook + `hasDeclaration()` com cache) | Feature pequena, restaura FR-01..04 |
| **A1** `enabled` | **Ligar**, ao nível de provider (hook + listener + assets), não como `mode: off` | 4 guards |
| **C5** warns | **Flag de runtime** via `data-*` no próprio `<script>`; remover o `define` do esbuild | Simplificação líquida |
| **F14** store | **Corrigir** (tirar write-on-read + marcar placeholder resolvido) | ~4 linhas |
| **F15** schema | **Documentar** + limpar chave órfã no mismatch | 1 linha + doc |
| **F16** freeze | **Documentar** como histerese intencional | doc |
| **F17** perf.yml | **Apagar** + issue + doc honesta | delete |
