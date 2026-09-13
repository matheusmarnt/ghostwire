# Ghostwire PHP audit (verified against code)

Working dir: `/home/matheusmariano/personal-projects/laravel-packages/Ghostwire/ghostwire`, `main`@`ae342e8`.
Scope: `src/` (8 files), `config/ghostwire.php`, service-provider wiring. Every claim below was checked
directly against source (`cat -n`) and grep; docs/CHANGELOG/README/docs-site were not consulted.

---

## 1. Every class in `src/`

1. **`Ghostwire\Attributes\Ghost`** — `src/Attributes/Ghost.php:10-34`. Plain PHP attribute
   (`#[Attribute(TARGET_CLASS | TARGET_METHOD)]`, line 9). Pure data holder — 9 constructor-promoted
   public properties, no methods, no logic: `mode='synthesize'`, `only=null`, `except=null`,
   `delay=null`, `hold=null`, `rows=null`, `poll=false`, `sync=false`, `lazy=false` (lines 23-33).

2. **`Ghostwire\Support\ConfigResolver`** — `src/Support/ConfigResolver.php:13-304`. Registered as a
   container singleton. Resolves final per-component/per-action config through a precedence chain;
   exposes `resolve()`, `resolveWithProvenance()` (feeds `ghost:inspect`), `methodOverrides()` (feeds
   the `data-ghost` `"a"` transport key), `defaults()` / `literalDefaults()` (two deliberately distinct
   notions of "default" — see §4), and `validate()` (only/except mutual exclusion).

3. **`Ghostwire\Support\LearnedTree`** — `src/Support/LearnedTree.php:21-193`. Static utility. Owns
   `NAME_PATTERN` (component-name regex, line 42) and constants `SCHEMA_VERSION`, `MAX_COORD`,
   `MAX_BONES=300`, `BONE_TYPES`, `MAX_TIMESTAMP`. `fromJson()` (47-108) independently re-validates the
   untrusted browser-exported JSON envelope (schema version, signature-key shape, bone whitelist/shape,
   coordinate clamping, bone-count cap, timestamp clamp — one bad bone discards the whole entry, line 94).
   `toBlade()` (113-147) renders a validated entry to static HTML/Blade (`%F` not `%f` to dodge
   locale-comma decimals, line 127; plain HTML comments not `{{--` ones, so the emitted file contains no
   Blade-echo token, lines 116-120).

4. **`Ghostwire\Support\ViewportBands`** — `src/Support/ViewportBands.php:12-25`. 6-name static
   allowlist (`xs,sm,md,lg,xl,2xl`) mirroring `js/src/learning/bands.js`; `isValid()`/`list()` used only
   by `ghost:export --breakpoint`.

5. **`Ghostwire\Livewire\GhostComponentHook`** (extends `Livewire\ComponentHook`) —
   `src/Livewire/GhostComponentHook.php:54-174`. The actual runtime. `render()` (56-89) resolves config
   for every component render, builds the compact `data-ghost` JSON payload, optionally adds `"a"`
   (per-action overrides) and `"g"/"n"` (learning flags), and stamps it via Livewire's own
   `Utils::insertAttributesIntoHtmlRoot()`. See §5 for full key-by-key emission rules.

6. **`Ghostwire\Commands\ExportCommand`** (`ghost:export`) — `src/Commands/ExportCommand.php:11-171`.
   See §6.

7. **`Ghostwire\Commands\InspectCommand`** (`ghost:inspect`) — `src/Commands/InspectCommand.php:15-145`.
   See §6.

8. **`Ghostwire\GhostwireServiceProvider`** — `src/GhostwireServiceProvider.php:15-122`. Wires
   everything together. See §2.

---

## 2. Service-provider wiring

**`register()`** (lines 17-30):
- `mergeConfigFrom(config/ghostwire.php, 'ghostwire')` — line 19.
- `$this->app->singleton(ConfigResolver::class)` — line 21.
- `Livewire::componentHook(GhostComponentHook::class)` — line 29.

**`boot()`** (lines 32-71):
- `registerLazyPlaceholderListener()` → `Livewire::listen('render.placeholder', …)` — line 84 (inside the
  private method at 82-99).
- `publishes([...], 'ghostwire-config')` — lines 45-47 (`config/ghostwire.php` → `config_path()`).
- `publishes([...], 'ghostwire-assets')` — lines 49-51 (`resources/dist` → `public_path('vendor/ghostwire')`;
  confirmed `resources/dist/ghostwire.js` and `.css` exist on disk — this is not a stub).
- `Blade::directive('ghostwireStyles', …)` — lines 53-57: emits a `<link>` to
  `vendor/ghostwire/ghostwire.css`, with an optional CSP nonce attribute if an expression is passed.
- `Blade::directive('ghostwireScripts', …)` — lines 59-63: same pattern, `<script defer>` to
  `vendor/ghostwire/ghostwire.js`.
- `$this->commands([InspectCommand::class, ExportCommand::class])` — lines 66-69, gated behind
  `runningInConsole()` (line 65).

**Register-vs-boot is load-bearing here, exactly once, and the code documents both halves of it:**
- `componentHook()` **must** be in `register()`, not `boot()` (comment, lines 23-28): Livewire's
  `ComponentHookRegistry` consumes the hook array exactly once, at the end of
  `LivewireServiceProvider::bootFeatures()`. A call from *our* `boot()` would be silently dropped
  whenever Livewire's provider happens to boot first — package auto-discovery order doesn't guarantee
  otherwise.
- `Livewire::listen('render.placeholder', …)` **must** be in `boot()`, not `register()` (comment, lines
  34-42): Livewire's `EventBus` singleton is only bound inside `LivewireServiceProvider::register()`,
  and provider *registration* order isn't guaranteed either — but by `boot()` time every provider's
  `register()` (Livewire's included) has already run, and EventBus listeners are read live at
  trigger-time rather than consumed once, so there's no equivalent hazard on this side.

`shouldTagLazyPlaceholder()` (101-121) is the gate the listener applies: resolved `lazy` must be true
(103) → no hand-written/compiled `placeholder()` method (110-112) → no global
`livewire.component_placeholder`/`lazy_placeholder` config (116-118) → component name must match
`LearnedTree::NAME_PATTERN` (120).

No other listeners, no other published groups, no other commands, no other Blade directives exist
anywhere in `src/`.

---

## 3. Every config key — live or dead (grepped, not assumed)

13 leaf keys. **7 live, 6 dead.** All 13 are locked into
`tests/Feature/ApiSurfaceFreezeTest.php:36-40` as frozen public-API shape (SPEC-API-50/PKG-11) —
freezing the *shape* says nothing about whether the value is ever read, which is exactly the gap below.

| Key | Live? | Evidence |
|---|---|---|
| `enabled` (`GHOSTWIRE_ENABLED`) | **DEAD** | Only appears at `config/ghostwire.php:4` and in the shape-freeze test. No `config('ghostwire.enabled')` anywhere in `src/`. The component hook (`GhostComponentHook::render()`) has no early-return of any kind — it always resolves and always stamps `data-ghost`. Setting this to `false` disables nothing. |
| `strategy` (`opt-in`/`global`) | **DEAD** | Only at `config/ghostwire.php:8` and the freeze test. Never read via `config('ghostwire.strategy')` anywhere. Consequence: the hook fires unconditionally for *every* Livewire component (registered globally via `Livewire::componentHook()`, no per-component gate), so the shipped default `'opt-in'` describes behavior the PHP side does not implement — see §7(b). |
| `mode` | live | `ConfigResolver::packageDefault()`, `src/Support/ConfigResolver.php:176`. |
| `timing.delay` | live | `ConfigResolver.php:179`. |
| `timing.hold` | live | `ConfigResolver.php:180`. |
| `timing.timeout` | **DEAD** | Only at `config/ghostwire.php:15` + freeze test + `ServiceProviderTest.php:9` (which only asserts the merged value is `15000`, not that anything uses it). No PHP reader. `ConfigResolver::FIELDS` (line 15) doesn't even include `timeout` as a resolvable field. JS's `scheduler.js:1` hardcodes its own `timeout: 15000` default independently — same number, zero wiring from this config key. |
| `silence.poll` | live | `ConfigResolver.php:184` (inverted polarity: `poll` attribute means "allow", `silence.poll` means "suppress"). |
| `silence.sync` | live | `ConfigResolver.php:185`, same inversion. |
| `synthesis.max_depth` | **DEAD** | Only in config + freeze test. JS's `synthesizer/index.js:9` / `walk.js:25` hardcode `maxDepth = 12` as their own function-default — matches the config number by coincidence, not by wiring. |
| `synthesis.max_bones` | **DEAD** | Same story. JS `learning/store.js:21` hardcodes `MAX_BONES = 300` independently; PHP's `LearnedTree::MAX_BONES = 300` (`LearnedTree.php:27`) is a *third*, separately-hardcoded constant. Three independent "300"s, one config key, no connection between any of them. |
| `synthesis.repeat_sample_size` | **DEAD** | Same story; JS hardcodes `repeatSampleSize = 3` (`synthesizer/index.js:9`). |
| `learning.enabled` | live | `GhostComponentHook.php:160`. |
| `learning.store` | live-but-narrow | `GhostComponentHook.php:164`: the only value that does anything is `'local'` — any other string doesn't error, it silently disables learning entirely. Not dead, but a de-facto single-value enum with no indication of that in the config file. |

No config→JS bridge of any kind exists in `src/` (no `window.*` injection, no `@json`, no script-tag
config payload) — checked across `src/` and `resources/`. The two Blade directives only emit asset
`<link>`/`<script>` tags (§2); they carry no config data.

---

## 4. `#[Ghost]` attribute and the `ConfigResolver` precedence chain

**Constructor parameters** (`Ghost.php:23-33`, all constructor-promoted public): `mode: string =
'synthesize'`, `only: ?array = null`, `except: ?array = null`, `delay: ?int = null`, `hold: ?int = null`,
`rows: ?int = null`, `poll: bool = false`, `sync: bool = false`, `lazy: bool = false`.

**Precedence**, `ConfigResolver::resolve()` (lines 27-43) and `resolveWithProvenance()` (63-88), per field
in `FIELDS` (line 15):
1. Method-level declared args (`declaredArgsForMethod`, 262-271) — **only consulted when `$method` is
   non-null**. Grepped every call site in `src/`: `GhostwireServiceProvider.php:103`,
   `InspectCommand.php:52` (via `resolveWithProvenance`), `GhostComponentHook.php:72` — **all three pass
   only the class**, never a method. So this branch of the precedence chain is exercised only by unit
   tests, never by shipped runtime code (see §7c).
2. Class's own declared args (`declaredArgsForClass`, 254-259).
3. Ancestor classes, nearest-first (`ancestorAndTraitLevels`, 221-236).
4. Traits used anywhere in the chain (`class_uses_recursive`, same method).
5. Package default (`packageDefault()`, 173-193) — first field with a match at any level wins
   (`firstDeclared`, 121-130); nothing declared anywhere falls through to here.

**Where each package default comes from** (`packageDefault()`, 173-193):
- `mode` ← `config('ghostwire.mode', 'synthesize')`.
- `only`, `except`, `rows` ← always `null`; no config exists for these.
- `delay` ← `config('ghostwire.timing.delay', 120)`.
- `hold` ← `config('ghostwire.timing.hold', 300)`.
- `poll` ← `! config('ghostwire.silence.poll', true)` (inverted).
- `sync` ← `! config('ghostwire.silence.sync', true)` (inverted).
- `lazy` ← **hardcoded `false`, always** — never reads config, by design. Comment at 186-191 states this
  used to derive from `learning.enabled` (which made `GHOSTWIRE_LEARNING=true` opt every component in
  app-wide) and was deliberately changed so `#[Ghost(lazy: true)]` is the *sole* opt-in in either learning
  state. I verified this independently rather than trusting the comment: no `config(` call appears in that
  match arm.

`validate()` (296-303) checks **only** that `only` and `except` aren't simultaneously non-null post-merge
— it does not check that `mode` is one of the three documented strings (`'synthesize'|'freeze'|'off'`,
which is a phpdoc-only hint, `Ghost.php:13`). A typo'd mode value passes silently through to the client.

---

## 5. `data-ghost` transport — every key and its exact emission condition

Base payload, `GhostComponentHook::compactPayload()` (101-126), key map at line 103:

- **`m`** (mode): **always present** (line 105), whatever string `resolve()` produced, unvalidated.
- **`o`** (only): present iff resolved `only !== null`.
- **`x`** (except): present iff resolved `except !== null`. (Never both — `ConfigResolver::validate()`
  already forbids that combination upstream.)
- **`d`** (delay): present iff resolved `delay !== literalDefaults()['delay']` i.e. `!== 120`. Compared
  against the **hardcoded JS literal**, not against `config()` — so if a deployment customizes
  `timing.delay`, every component (even ones with no `#[Ghost]` at all) will carry `d`, by design
  ("config-drift fix", comment at line 98).
- **`h`** (hold): same pattern vs literal `300`.
- **`r`** (rows): present iff resolved `rows !== null`.
- **`p`** (poll): present iff resolved `poll !== false` (literal).
- **`s`** (sync): present iff resolved `sync !== false` (literal).
- **`l`** (lazy): present iff resolved `lazy !== false` (literal) — i.e. only when `#[Ghost(lazy: true)]`
  was declared somewhere in the class chain.

Added in `render()` itself (lines 73-83), on top of the base payload:
- **`a`** (per-action overrides): present iff `compactMethodOverrides(resolver->methodOverrides($class))
  !== []` (line 76). `methodOverrides()` (`ConfigResolver.php:102-118`) walks every **public** method,
  keeps only fields declared **on that method's own attribute** intersected with
  `METHOD_TRANSPORT_FIELDS = [mode, delay, hold, rows, poll, sync, lazy]` (line 19) — `only`/`except` are
  explicitly excluded from this map (comment, 96). Note this is a wholly separate mechanism from
  `resolve($class, $method)`'s method branch (§4/§7c) — it's the only way per-action overrides actually
  reach the client.
- **`g`** = `true` and **`n`** = component name: present iff `learningEnabled()` (158-173) is true, which
  requires **all four**: `config('ghostwire.learning.enabled')` truthy, `config('ghostwire.learning.store')
  === 'local'`, `! app()->isProduction()`, and the component name matches `LearnedTree::NAME_PATTERN`.

---

## 6. `ghost:export` and `ghost:inspect`

### `ghost:export` (`ExportCommand.php`)
Options: `--component=`, `--breakpoint=lg`, `--from=`, `--output=`, `--force`.

Refusal paths, in order (`handle()`, 22-98):
1. `--component` doesn't match `LearnedTree::NAME_PATTERN` → error, `FAILURE` (26-30).
2. `--breakpoint` not one of `ViewportBands::NAMES` → error, `FAILURE` (34-38).
3. `--from` empty, not a file, or not readable → error, `FAILURE` (42-46).
4. `LearnedTree::fromJson()` returns `null` (no matching `component|band` entry, or any of its internal
   validation rules fail) → error, `FAILURE` (48-54).
5. `resolveTarget()` returns `null` (126-170) for any of: `--output` containing a NUL byte (130-134);
   empty/leading-empty/`..`/Windows-drive-letter path segments (136-142); `resources/views` itself missing
   (144-150); `mkdir()` failing for a missing parent (155-159); or the realpath'd parent escaping
   `resources/views` (161-167 — the canonical, symlink-escape-proof check, SPEC-SEC-05) → `FAILURE`.
6. Resolved target is a symlink **or** an existing directory → refused unconditionally, **even with
   `--force`** (70-74) — comment explains `--force` means "overwrite a file this command wrote before,"
   not "follow a link."
7. Target is an existing plain file and `--force` not passed → `FAILURE` (76-80).
8. `file_put_contents()` returns `false` (unwritable dir, full disk) → `FAILURE` (86-90).

Success path: writes `LearnedTree::toBlade($entry)`, prints bone count and a ready-to-paste
`placeholder()` snippet whose view name is derived from wherever `--output` actually placed the file
(`viewNameFor()`, 105-112), not hardcoded to the `livewire/` default.

### `ghost:inspect` (`InspectCommand.php`)
No options — bare signature `ghost:inspect` (line 17).

Behavior: prints the detected `livewire/livewire` version (23-24); enumerates every **explicitly-named**
registered component by reading a protected property via Reflection —
`app('livewire.finder')->classComponents` on Livewire 4, or `app(ComponentRegistry::class)->aliases` on
Livewire 3 (123-135, branching on `class_exists(Finder::class)`); for each, prints class name and, per
config field, the resolved value and which precedence level decided it — `method`/`class`/`inherited`/
`default` — via `resolveWithProvenance()` (48-57).

Refusal path: exactly one — a `ReflectionException` while reading the registry (e.g. a future Livewire
version renames the internal property) → friendly error + `FAILURE`, no stack trace (28-32).

Documented, verified limitations: directive-level `wire:ghost` modifiers/expressions are invisible to it
(own `$description`, line 19; also `ConfigResolver.php:56-59`) — they exist only in the rendered DOM at
runtime. Class-only component registrations (no explicit name) land in a separate crc32-hash bucket on
both Livewire majors and are not surfaced — acknowledged in a `ponytail:`-tagged comment (105-109) as a
known gap to fill only if a real app needs it.

---

## 7. Findings — dead, unreachable, contradictory, or surprising

**a. Two config keys are a fully inert kill-switch/mode-switch pair.** `enabled` and `strategy` are both
frozen as public API (`ApiSurfaceFreezeTest.php:36`) and both completely unread by any code path (§3).
`GhostComponentHook::render()` has no gate of any kind — every Livewire component's root element gets a
`data-ghost` attribute stamped on every render, regardless of `enabled` or `strategy`. The documented
default (`'opt-in' -> only elements with wire:ghost or components with #[Ghost]`, `config/ghostwire.php:6`)
is not what the PHP side does.

**b. Three more config keys (`synthesis.*`) plus `timing.timeout` are equally dead**, each shadowed by an
independently-hardcoded, coincidentally-matching constant in JS (and, for `max_bones`, in PHP too via
`LearnedTree::MAX_BONES`). Total: **6 of 13 leaf keys are dead**, all 6 nonetheless locked as frozen public
API shape.

**c. `resolve()`/`resolveWithProvenance()`'s `?string $method` parameter is never given a non-null value
by any production caller.** Grepped every call site in `src/` (`GhostwireServiceProvider.php:103`,
`InspectCommand.php:52`, `GhostComponentHook.php:72`) — all three are 1-arg, class-only calls. The
method-level branch of the precedence chain (lines 30-32, 66) is reachable only from unit tests. Real
per-action overrides ship exclusively through the parallel `methodOverrides()` → `"a"` transport (§5),
which is a structurally different, field-restricted mechanism (no `only`/`except`).

**d. `only`/`except` mutual exclusion is enforced post-merge, across precedence levels**
(`ConfigResolver.php:298-302`), not per-declaration. A class declaring `#[Ghost(only: [...])]` plus one
action method declaring its own `#[Ghost(except: [...])]` throws `InvalidArgumentException` at render
time — a runtime crash from two attribute usages that each look fine read in isolation.

**e. `mode`'s value is never validated.** The `'synthesize'|'freeze'|'off'` constraint (`Ghost.php:13`) is
phpdoc-only; `validate()` doesn't check it. A typo'd or arbitrary string reaches the client unchanged in
the `m` key.

**f. `learning.store` is a one-value enum in practice** (`'local'` works, anything else silently disables
learning, `GhostComponentHook.php:164`) with nothing in the config file signaling that.

**g. Checked, and it holds up:** the "lazy is a per-component opt-in" claim (matching the git history's
M7 "lazy opt-in" fix) is genuinely implemented now — `packageDefault('lazy')` is hardcoded `false` with no
`config()` read (`ConfigResolver.php:186-192`), so `#[Ghost(lazy: true)]` really is the only way in,
independent of `GHOSTWIRE_LEARNING`. I verified this from the code, not from the comment or changelog.

**h. Checked, and it holds up:** the component-name regex is not currently subject to the
"fixed-at-one-of-three-sites" drift pattern. All three PHP use sites (`ExportCommand.php:26`,
`GhostComponentHook.php:172`, `GhostwireServiceProvider.php:120`) reference the single shared
`LearnedTree::NAME_PATTERN` constant (`LearnedTree.php:42`, including its `/D` modifier for `$`-anchoring
parity with JS) rather than duplicating the regex literal — they cannot drift from each other in PHP. The
JS side necessarily keeps its own independent copy across the language boundary (acknowledged directly in
`LearnedTree.php:35-41`); that cross-language duplication is real but different from same-language drift,
and is already flagged in the code's own comments as something requiring manual sync.

**i. Not a stub:** `resources/dist/ghostwire.js` and `.css` exist and are non-trivial, so the
`ghostwire-assets` publish group and both Blade directives point at real build output.

**j. `InspectCommand`'s registry read is admittedly fragile by design** (comment, 111-119): it reads a
*protected* property via Reflection with zero compatibility guarantee (unlike the public
`Livewire::componentHook()` API used elsewhere), caught only by a blanket `ReflectionException` handler.
This is a documented, accepted risk rather than an oversight, but worth flagging as a real upgrade-fragility
point for `ghost:inspect` specifically.
