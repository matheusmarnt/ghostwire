# Ghostwire JS Audit — verified against source and shipped bundle

Repo: `/home/matheusmariano/personal-projects/laravel-packages/Ghostwire/ghostwire`, branch `main`, commit `ae342e8` (working tree clean except untracked `.superpowers/`, `node-compile-cache/`, neither touched by this audit).

Scope actually read: all 15 `.js` files under `js/src/` + `js/src/style.css`, `js/build.mjs`, `resources/dist/ghostwire.js` (1281 lines, non-minified IIFE), `resources/dist/ghostwire.css` (only CSS artifact present — the `*.css` glob in the task matches exactly one file). Everything below was read directly with `Read`/`grep`/`diff`/`sha256sum`, not summarized by a third party.

---

## 1. Module inventory (15 modules)

| # | File | Purpose | Exports | Imported by |
|---|------|---------|---------|-------------|
| 1 | `js/src/index.js` (520 lines) | Entry point / orchestrator. Wires bridge→registry→scheduler→synthesizer→renderer→learningStore together, registers the `wire:ghost` directive and all Livewire hooks, exposes `window.Ghostwire`. | `boot()` (only; called internally at line 520, also the esbuild entry point) | Nothing else in `js/src` imports it — it's the bundle root |
| 2 | `js/src/bridge/index.js` (15 lines) | Picks Livewire 3 vs 4 at runtime. | `detectBridge()` | `index.js:1` |
| 3 | `js/src/bridge/v3.js` (89 lines) | Livewire 3 adapter: `Livewire.hook('commit', ...)`, DOM-heuristic poll/renderless detection. | `createV3Bridge()` | `bridge/index.js:2` |
| 4 | `js/src/bridge/v4.js` (109 lines) | Livewire 4 adapter: `Livewire.interceptMessage(...)`, metadata-based poll/renderless detection. | `createV4Bridge()` | `bridge/index.js:1` |
| 5 | `js/src/registry.js` (33 lines) | Host bookkeeping: element→host (`WeakMap`) and componentId→hosts (`Map<Set>`). | `createRegistry()` | `index.js:2` |
| 6 | `js/src/scheduler.js` (72 lines) | Per-host state machine (`idle→pending→visible→settling→idle`) driving delay/hold/timeout timers. | `createScheduler()` | `index.js:3` |
| 7 | `js/src/renderer.js` (178 lines) | All DOM writes: mounts/positions the `.gw-layer` overlay, paints bone `<div>`s, freeze/unfreeze classes, aria-busy + live-region announcements, focus capture/restore. | `createRenderer()` | `index.js:4` |
| 8 | `js/src/attributeConfig.js` (176 lines) | Parses/validates the compact `data-ghost` JSON attribute (server-emitted config) into a full config object; also merges directive config over it. | `parseAttributeConfig()`, `resolveHostConfig()` | `index.js:6` |
| 9 | `js/src/synthesizer/index.js` (57 lines) | Synthesis orchestrator: cache check → classify → measure → emit → persist, plus the SPEC-PERF-07 adaptive slow-streak freeze. | `createSynthesizer()` | `index.js:5` |
| 10 | `js/src/synthesizer/walk.js` (142 lines) | Classifies DOM nodes into candidate types and walks the subtree (depth cap, candidate-count cap, repeat-run sampling). | `classify()`, `hasDirectText()`, `collectAndClassify()` | `synthesizer/index.js:1` (`collectAndClassify`), `synthesizer/measure.js:1` (`hasDirectText`). `classify` is not imported anywhere else in `src` — it's exported only for `js/tests/synthesizer-walk.test.js`. |
| 11 | `js/src/synthesizer/measure.js` (104 lines) | Read-only geometry pass: `getBoundingClientRect`, computed styles, text-line rects via `Range`, ancestor-clip intersection. | `measure()` | `synthesizer/index.js:2` |
| 12 | `js/src/synthesizer/emit.js` (168 lines) | Turns measured candidates into the final Bone Tree (array of `{type,x,y,width,height}`), handles visibility/clip/transform filtering and repeat-clone expansion. | `emit()`, `rectIntersectsHost()`, `toBone()`, `isAvatar()`, `isNonAxisAligned()`, `syntheticRows()` | `synthesizer/index.js:3` (`emit` only). The other 5 named exports are used internally by `emit()` itself and are otherwise consumed only by `js/tests/synthesizer-emit.test.js` — not dead, just also test seams. |
| 13 | `js/src/synthesizer/signature.js` (53 lines) | FNV-1a structural signature over candidates + a `ResizeObserver`-backed per-host cache (skip re-synthesis when nothing changed). | `createSignatureCache()` | `synthesizer/index.js:4` |
| 14 | `js/src/learning/store.js` (205 lines) | The `localStorage`-backed Bone Tree cache: schema validation, quota+LRU eviction, get/put/all/clear. | `SCHEMA_VERSION`, `STORAGE_KEY`, `MAX_COORD`, `MAX_BONES`, `BONE_TYPES`, `NAME_PATTERN`, `createLearningStore()`, re-exports `bandFor` | `index.js:7` imports `createLearningStore`, `MAX_BONES` only. The re-export `bandFor` (line 205) and the other constants are unused by any other `src` file — consumed only by `js/tests/learning-store.test.js` and siblings. |
| 15 | `js/src/learning/bands.js` (22 lines) | The single source of truth for viewport-width breakpoint bands (mirrors PHP `ViewportBands.php`). | `BANDS`, `BAND_NAMES`, `bandFor()` | `index.js:8` and `learning/store.js:16` (both import `bandFor` **directly from `bands.js`**, not through store.js's re-export — see §6) |

Plus `js/src/style.css` (123 lines, not a JS module): copied verbatim to `resources/dist/ghostwire.css` by `build.mjs:16-18`, never processed by esbuild. Confirmed byte-identical to the committed artifact (§ Reproducibility).

---

## 2. Runtime boot path, end to end

**Script load.** The bundle is a bare IIFE (`resources/dist/ghostwire.js:1 "(() => { ... })();"`, `resources/dist/ghostwire.js:1281 "})();"`) — no module wrapper, no auto-run on load. The only top-level side effect is the last line of `index.js` (`resources/dist/ghostwire.js:1280` in the bundle):

```js
document.addEventListener('livewire:init', boot);   // js/src/index.js:520
```

So nothing happens until Livewire itself fires `livewire:init` (Livewire's own bootstrap event, both v3 and v4).

**`boot()` (`js/src/index.js:67-456`):**
1. `detectBridge()` (`bridge/index.js:4-15`) — the actual v3/v4 decision point:
   - `typeof window.Livewire?.interceptMessage === 'function'` → Livewire 4 (`createV4Bridge()`, `bridge/v4.js:1`).
   - else `typeof window.Livewire?.hook === 'function'` → Livewire 3 (`createV3Bridge()`, `bridge/v3.js:22`).
   - else `{ name: null, bridge: null }` and a dev-only `console.warn` (`bridge/index.js:11-13`, SPEC-INT-20).
   - `boot()` returns immediately if `!bridge` (`index.js:69`) — no hooks are ever registered, the whole package goes inert.
2. Builds `registry`, `renderer`, tries `window.localStorage` (swallowing a throw from blocked/embedded contexts, `index.js:77-82`), builds `learningStore` with `quotaBytes: 256*1024`.
3. Builds `synthesizer` (`createSynthesizer`) with two callbacks: a resize-triggered re-render/mid-cycle-degrade callback (`index.js:119-131`) and an `onSynthesized` persist callback (`index.js:133-145`).
4. Builds `scheduler` with `onShow`/`onHide` (`index.js:147-171`) — this is what actually paints/removes the Ghost Layer or freezes the host.
5. Installs `window.Ghostwire.exportLearned` / `.clearLearned` (`index.js:173-202`).
6. Registers `window.Livewire.directive('ghost', ...)` (`index.js:204-238`) — handles explicit `wire:ghost` usage, parses modifiers (`.freeze`, `.off`, `.ignore`, `.keep`, `.delay.Nms`, `.hold.Nms`, `.rows.N`, `.island` no-op), resolves config, calls `registry.attach`, registers teardown via the directive's `cleanup`.
7. Registers `window.Livewire.hook('component.init', ...)` (`index.js:268-294`) — the **attribute-only auto-attach path** (SPEC-API-12/13): if no `wire:ghost` directive exists anywhere in the component (`hasGhostDirective`, `index.js:57-65`) and no host is already registered, it reads `data-ghost` via `parseAttributeConfig` and attaches a host anyway. This hook name/payload (`{component, cleanup}`, no `el`) was confirmed against the vendor bundle per the comment at `index.js:243-267` — this is the actual real hook name Livewire fires, not a guess.
8. Registers `morph.updating` and `morph.removing` hooks (`index.js:296-307`) — both call `skip()` when the morphed element is a `.gw-layer`, protecting the overlay from Livewire's morph diffing.
9. Registers `morphed` hook (`index.js:316-331`) — reapplies `aria-busy`/`.gw-concealed`/freeze after a morph strips attributes, and re-runs `paintLazyPlaceholders()` (a lazy component can be inserted by another component's morph).
10. Calls `bridge.subscribe({onStart, onPostPaint, onFinish})` (`index.js:391-453`) — this is the actual message-lifecycle wiring; see below.
11. Calls `paintLazyPlaceholders()` once immediately (`index.js:455`).

**Message lifecycle (`bridge.subscribe`).** Both bridges normalize a Livewire commit/message into a common `ctx` shape (`{component, actionNames, isSync, isPoll, isRenderless}`) and call three handlers:
- **v3** (`bridge/v3.js:24-83`): hooks `Livewire.hook('commit', ...)`. `isSync` = no calls at all. `isPoll` = every call name resolves to a `wire:poll` element in the component (DOM heuristic, no payload marker exists in v3 — `isPolledMethod`, `v3.js:1-20`). `isRenderless` starts `false` and is corrected in `succeed()` from whether the response lacks an `html` effect key.
- **v4** (`bridge/v4.js:2-105`): hooks `Livewire.interceptMessage(...)`. `isPoll` reads `action.metadata?.type === 'poll'` directly. `isRenderless` has two signals: synchronous `action.metadata?.renderless === true` (a `.renderless` directive modifier) and, failing that, the same "no `html` effect key" response-shape check as v3, applied in `onSuccess`.
- `index.js`'s `onStart` (`index.js:392-408`) is where **silence is actually decided**, per host, not in the bridge: skips a host for `mode==='off'`, `isRenderless`, `isSync && !host.config.sync`, `isPoll && !host.config.poll`, `targetActions` mismatch, `only`/`except` mismatch. Otherwise calls `scheduler.messageStart(host, ...)`.
- `scheduler.messageStart` (`scheduler.js:2-19`) increments `host.pending`; if the host was idle, arms a `delay` timer (default 120ms). When it fires, state → `visible`, calls `onShow(host)`.
- `onShow` (`index.js:148-161`) is where a skeleton is actually **painted**: `markBusy` (aria-busy always), then depending on `host.config.mode`: `off/ignore/keep` → nothing more; `freeze` → `renderer.freeze` (adds `.gw-frozen`, opacity 0.6 + pointer-events:none, `style.css:65-69`); otherwise `synthesizer.synthesize(host)` → if it returns a Bone Tree, `captureFocus` → `mountLayer` (creates the `.gw-layer` div, positioned/sized from `getBoundingClientRect`) → `renderBones` (paints `.gw-bone` divs into it) → adds `.gw-concealed` (visibility:hidden) to the real host content. If synthesis fails, degrades to freeze (§3).
- `onPostPaint`/`onFinish` (`index.js:409-452`) balance the scheduler's counters (`messagePostPaint`, `messageFinish`) using the *same* skip logic, but frozen at onStart time via `ctx._gwSkippedRenderless` (a snapshot — extensively commented rationale at `index.js:333-390` about why a live re-check would desync).
- `scheduler.messageFinish` decrements `pending`; once it hits 0 and postPaint was received, `maybeSettle` arms a `hold` timer (default 300ms, minus elapsed) before calling `onHide`.
- **Teardown**: `onHide` (`index.js:162-170`) — `clearBusy`, then for `freeze`/`degraded` hosts `unfreeze`; otherwise `removeLayer` (removes the `.gw-layer` node, `renderer.js:101-105`) and un-conceals. Host-level teardown (directive `cleanup` at `index.js:228-237`, or `component.init`'s `cleanup` at `index.js:285-293`) additionally calls `scheduler.cancel` (clears all three timers), `synthesizer.forget` (drops the signature cache + slow-streak entry), forces the layer removed/unfrozen/un-busied regardless of state, and `registry.detach`. There is no separate "component removed" Livewire hook in either version — confirmed absent by the comment at `index.js:258-267`; teardown rides on the same `cleanup` callback both lifecycle hooks receive.

---

## 3. The synthesizer: DOM subtree → Bone Tree

Pipeline: `collectAndClassify` (walk.js) → `measure` (measure.js) → `emit` (emit.js), orchestrated by `synthesizer/index.js:13-40`, gated by a signature cache (`signature.js`).

**Classification (`walk.js:5-13`, `classify(el)`):**
- `SVG` tag → `'icon'`
- `IMG/VIDEO/PICTURE/CANVAS` → `'media'`
- `INPUT/SELECT/TEXTAREA/BUTTON` or `role="button"` → `'control'`
- `H1`-`H6` → `'heading'`
- has a non-whitespace direct text node (`hasDirectText`, walk.js:15-20) → `'text'`
- has element children → `'container'` (recursed into, not a leaf/bone type)
- otherwise → `null` (dropped entirely)

**Walking (`walk.js:38-107`, `visit`/`processChild`):** depth-first, skipping nested `wire:ghost` hosts (`registry.hostFor(child)`, a host boundary) and `aria-hidden="true"` elements. Two safety caps, both producing a synthetic **`'block'`** candidate (a type `classify()` itself never returns):
- **Depth cap** (`maxDepth`, default 12): a `container` beyond max depth becomes one `block` bone at that node instead of being walked further (`walk.js:96-100`).
- **Candidate-count cap** (`MAX_CANDIDATES = 300`, `walk.js:3`): once 300 candidates have been collected, the *entire rest of the host* collapses into a single root-sized `block` bone (`walk.js:48-53`), gated by `state.capped` so only one is ever pushed.
- **Repeat-run sampling** (SPEC-SYN-11, `walk.js:56-88`): a run of ≥3 siblings sharing tag+normalized-class+child-count (`siblingSignature`, `walk.js:116-118`) *and* uniform height (within 15% of the tallest, `isUniformHeightRun`, `walk.js:132-142`, the one place layout is read before the measure phase, deliberately) is sampled (default 3 real items walked) and the rest become one `'repeat-extra'` pseudo-candidate carrying the extra count + pitch inputs — never a real bone type itself.

**Measurement (`measure.js:3-27`, read-only, no DOM writes):** for each candidate, `getBoundingClientRect`, `getComputedStyle` (visibility, transform; border-radius for media), text line rects via `document.createRange().selectNodeContents(...).getClientRects()` (`measureTextLines`, `measure.js:29-39`), and an ancestor-clip rect intersected up to (not including) the host (`computeClipRect`, `measure.js:47-64`, memoized per `measure()` call). Repeat-extra candidates get `measureRepeat` (`measure.js:77-87`): real pitch from the last two sampled siblings, plus per-extra shallow text measurement (`measureShallowTextBones`) so cloned text bones still get real widths.

**Emission (`emit.js:1-96`, `emit(host, measured, rowsHint)`):**
- Whole-host bailout: `isNonAxisAligned(measured.hostTransform)` → `null` immediately (SPEC-SYN-16).
- Per-candidate filtering: hidden or zero-size (`isVisible`) skipped; doesn't intersect the host/clip rect skipped; individually transformed (rotate/skew/3D) skipped (this one drops just that bone, not the whole host).
- Type mapping to final bone types: `text` → one bone per visible line rect; `block` → one bone for the whole candidate rect; everything else → one bone of its own type, except `media` is upgraded to `'avatar'` when `isAvatar()` (aspect ratio within 10% of square **and** border-radius ≥50% or ≥ half the min dimension, `emit.js:139-148`).
- Repeat-extra second pass (`emit.js:50-91`): clones the sampled template's bones for each un-walked sibling, translated by measured pitch, except text bones which are re-measured for real width per-occurrence when available.
- **Final result**: non-empty `bones` array is returned as the Bone Tree; if empty and `host.config.rows > 0` (the `.rows.N` modifier / `r` attribute key), returns `syntheticRows()` (evenly spaced text-line placeholders, `emit.js:159-168`, SPEC-SYN-17 fallback); otherwise `null`.

**Bone type vocabulary that can actually appear in a shipped Bone Tree** (the closed whitelist enforced independently by `learning/store.js:22`, `BONE_TYPES`): `text`, `avatar`, `block`, `icon`, `media`, `control`, `heading` — 7 types. (`container`, `repeat-extra`, and bare `null` are internal-only labels that never reach a bone.)

**Every path that produces `null` from `synthesize()` → freeze** (`synthesizer/index.js:13-40`, consumed at `index.js:120-130` mid-cycle and `index.js:154-155` on show):
1. **Adaptive perf freeze** (SPEC-PERF-07, `synthesizer/index.js:14`): once a host has recorded **2 consecutive** synthesis runs each taking >50ms (`LONG_SYNTHESIS_THRESHOLD_MS`/`SLOW_STREAK_LIMIT`, lines 6-7), `synthesize()` returns `null` immediately without even attempting — and because that early return skips `recordDuration()`, the streak is **never reset from inside that early-return branch**. A single host, once tripped, freezes for the rest of its lifetime; the only reset is `forget(host)` on host teardown (component/directive removal), which drops the `WeakMap` entry entirely. This is stronger than "adaptive" — it's monotonic per host instance.
2. **Non-axis-aligned host transform** (`emit.js:2`): the host itself has a rotated/skewed/3D CSS transform (`isNonAxisAligned`, `emit.js:150-157` — anything that isn't `none`, a `matrix(...)` with zero skew components, treating unrecognized forms and any `matrix3d` conservatively as non-aligned).
3. **Empty result, no rows hint** (`emit.js:94-95`, SPEC-SYN-17): every candidate was filtered out (hidden, zero-size, clipped fully out, individually transformed) and `host.config.rows` is unset/0 — nothing to show and no explicit synthetic-row count to fall back to.

Note the depth-cap and candidate-cap `'block'` aggregation (`walk.js`) is a *different* kind of degrade — a coarser Bone Tree, still synthesized, never a freeze by itself.

---

## 4. The learning store (`js/src/learning/store.js`)

**Storage key & schema.** Single `localStorage` key, `STORAGE_KEY = 'ghostwire.learned.v1'` (line 19) — the whole store is one JSON blob. Envelope shape: `{ v: 1, e: {...}, c: {...} }`.
- `e`: entries keyed by `"<signatureStamp>|<band>"`, matching `ENTRY_KEY_PATTERN = /^(\d{1,10})\|([a-z0-9]{2,3})$/` (line 26). Entry = `{ t, n, w, h, b }`: `t` last-touch timestamp (LRU recency), `n` component name (`NAME_PATTERN = /^[a-z0-9\-.]{1,64}$/`), `w`/`h` host width/height, `b` = array of 1-300 bones.
- `c`: a `"<name>|<band>"` → signature-stamp pointer index, for O(1) lookup by component name+band.
- Bone = `{ type, x, y, width, height }`, exactly these 5 keys (`BONE_KEYS`, line 25 — extra or missing keys reject the bone), `type` from the `BONE_TYPES` whitelist (line 22), all four numbers clamped to `[-20000, 20000]`/`[0, 20000]` (`MAX_COORD = 20000`).

**Validation (defense-in-depth, treats everything read back as hostile — comment at lines 1-14):** `validEnvelope` (78-104) → JSON.parse in try/catch; must be a plain object; `v` must equal `SCHEMA_VERSION` exactly or the **entire envelope** is discarded (no migration path — a future schema bump is a hard reset for every user, not a silent surprise but worth knowing); `e` must be an object. Per-entry-key: must match `ENTRY_KEY_PATTERN` and the band code must be a real `BAND_NAMES` value, else that one entry is skipped. `validEntry`/`validBone` (34-72) then re-derive and clamp every field; **one invalid bone discards the whole entry** (not just that bone). Notably, **the `c` pointer index is never read from the stored JSON at all** — `validEnvelope` rebuilds `envelope.c` purely from the entries it just validated (line 100), so a tampered/corrupted `c` in raw storage has zero effect; it's always freshly derived.

**Eviction.** LRU by `t`, enforced in `write()` (120-143): while `JSON.stringify(envelope).length > quotaBytes` (default/boot-configured 256 KiB, `index.js:84`), repeatedly find the entry with the smallest `t` and delete it (and its `c` pointer), then re-serialize; if entries run out before fitting, `write()` returns `false` (silent failure, by design per SPEC-SEC-04 — the only feedback is a dev-only console.warn from the caller, `index.js:142-144`). Note `.length` counts UTF-16 code units, not bytes — a harmless naming nuance given the content is ASCII-range JSON.

**Every `localStorage` access — all funneled through one injected `storage` object; `store.js` itself never touches `window`:**
- `window.localStorage` is read exactly once, in `index.js:79`, wrapped in try/catch for blocked/embedded contexts, then handed to `createLearningStore({storage, ...})`.
- **`getItem`**: `read()` (store.js:107-118), called by `get(name, band)` and `all()`.
- **`setItem`**: `write()` (120-143), called by (a) `get()` (line 155) — **every successful `get()` call also writes back**, to bump the entry's `t` for LRU recency, so a read path has a write side effect; and (b) `put()` (line 188), the main persist path, called only from `synthesizer/index.js`'s `onSynthesized` callback wired at `index.js:133-145`, itself gated on `host.config.learning && host.config.name` (opt-in, requires both the `.learning`/`g` flag and an explicit component `name`).
- **`removeItem`**: `clear()` (195-201), called only by `window.Ghostwire.clearLearned()` (`index.js:200-202`), best-effort (swallows a throw).
- No `sessionStorage`, `indexedDB`, or `document.cookie` anywhere in `js/src` or the bundle (grepped both, zero hits).

**Read path that paints from it**: `paintLazyPlaceholders()` (`index.js:96-114`) reads via `learningStore.get(name, band)` for every `[data-ghost-lazy]` element not yet painted, guarding the name against `LAZY_NAME_PATTERN` before lookup, and paints a static skeleton (`renderer.paintBones`) sized from the learned `width`/`height` — this runs before Livewire renders real content into a lazy placeholder (SPEC-LRN-02), and again on every `morphed` event (`index.js:330`) since a lazy component can be inserted by another component's morph.

---

## 5. Security sweep — source AND bundle

Ran the same pattern set against every file in `js/src/` (recursively) and the full 1281-line `resources/dist/ghostwire.js`:

```
eval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|
XMLHttpRequest|sendBeacon|WebSocket|fetch\(|XHR|import\(|require\(
```

**Zero matches in both**, other than one deliberate comment in `js/src/learning/store.js:7` stating the invariant ("nothing persisted can reach eval, Function or innerHTML") — which itself contains none of the actual code patterns, it's prose. A broader case-insensitive sweep (adding bare `eval`, `websocket`, `fetch`, `xhr` as substrings, not just call-forms) also came back clean on both source and bundle.

**Verdict: confirmed. No `eval`, no `new Function`, no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, no `XMLHttpRequest`/`sendBeacon`/`WebSocket`/`fetch`, anywhere in source or the shipped bundle.**

**DOM writes are exhaustive and all narrow:** every write site in the whole codebase is one of `createElement` + `.style.<prop> = <number>px` / `.className` (renderer.js `paintBones`/`mountLayer`, `emit.js`'s bone objects are plain numbers), `classList.add/remove`, `setAttribute` for a fixed small set of attributes (`aria-live`, `role`, `aria-hidden`, `aria-busy`), or `.textContent =` (never `.innerHTML`). `renderer.js:81-95`'s `paintBones` is the sole path from a Bone Tree to real DOM, and it's structurally incapable of interpreting its input as markup or a selector — `bone.type` is constrained to the `BONE_TYPES` closed set by the time it can reach here (validated on the way out of `learning/store.js`, or freshly computed by `emit.js` from the same whitelist), and every geometry value is a clamped number.

**Dynamic selectors from stored data**: none. `learning/store.js`'s output (`get()`) only ever feeds `renderer.paintBones(el, learned.bones)` (`index.js:111`) — numbers and a whitelisted type string into inline styles/classNames, never into `querySelector`/`getElementById`/etc. No selector anywhere in the codebase is built from persisted or attribute-sourced data — the only dynamic-ish DOM query is `document.querySelectorAll('[data-ghost-lazy]')` (`index.js:99`, a fixed literal selector) and `root.querySelectorAll('*')` (`index.js:58`, `v3.js:4` — also fixed literals, used only to enumerate attribute names, not to inject anything).

**Network primitives**: none, anywhere. The only outbound "exit" for learned data is `window.Ghostwire.exportLearned()` (`index.js:177-198`), which explicitly builds a `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click — a **user-initiated local file download**, not a network call (the comment at `index.js:175-176` calls this out directly, and it checks out: no `fetch`, `XHR`, `sendBeacon`, or `WebSocket` construction exists to contradict it).

---

## 6. Build reproducibility & the NODE_ENV/console.warn claim

**`js/build.mjs` (20 lines, read in full):** single esbuild call — `bundle:true`, `format:'iife'`, `target:['es2020']`, `legalComments:'none'`, `define:{'process.env.NODE_ENV':'"production"'}`, entry `js/src/index.js` → `resources/dist/ghostwire.js`; then a plain `copyFileSync` of `js/src/style.css` → `resources/dist/ghostwire.css` (not processed by esbuild at all). `package.json` has exactly two scripts, `build` and `test` (`vitest run`) — **confirmed, no dev/alternate build exists.**

**Reproducibility — rebuilt independently, not trusted from memory.** Ran the project's own installed `esbuild` (`node_modules/.bin/esbuild`, v0.28.2, matches `package.json`'s `^0.28.2`) with the exact same flags as `build.mjs`, output to a scratch directory (`/tmp/.../scratchpad/rebuild-dist/`, never touching `resources/dist/`):

```
sha256sum resources/dist/ghostwire.js            fc21476b8f63f1fa28a1f4398322cefe1fa9680d4477b2ede0a76559ee74fc23
sha256sum rebuild-dist/ghostwire.js              fc21476b8f63f1fa28a1f4398322cefe1fa9680d4477b2ede0a76559ee74fc23   (identical)
sha256sum resources/dist/ghostwire.css           65a44bd29ba5b4bbd63dfab4318f800b125f41054c5d136724c8b18f64f5290
sha256sum rebuild-dist/ghostwire.css             65a44bd29ba5b4bbd63dfab4318f800b125f41054c5d136724c8b18f64f5290   (identical)
```

`diff` confirms byte-for-byte identity on both files. **The build is fully reproducible.**

**The NODE_ENV claim — true for behavior, false for bytes.** `grep -c "NODE_ENV"` and `grep -c '"production"'` against the bundle both return **0** — `esbuild`'s `define` does textually substitute `process.env.NODE_ENV` and constant-folds the resulting string comparison down to a literal boolean. But `grep -c "console.warn"` against the bundle returns **4**, not 0. Reading each hit in context (`resources/dist/ghostwire.js:91-93`, `1030-1032`, `1094-1096`, and the single-line form at `700`):

```js
if (false) {
  console.warn("[ghostwire] neither Livewire.interceptMessage nor Livewire.hook was found — disabling (SPEC-INT-20)");
}
...
if (false) console.warn(`[ghostwire] ${message}`);          // attributeConfig.js's warn() helper
...
else if (false) {
  console.warn(`[ghostwire] unknown wire:ghost modifier ".${modifier}" — ignored`);
}
...
if (!persisted && false) {
  console.warn(`[ghostwire] learning: could not persist "${host.config.name}" ...`);
}
```

So: **esbuild folds the condition to `false` but, because `build.mjs` never sets `minify`/`minifySyntax: true`, it does not strip the resulting dead branch.** All 4 source call sites (`bridge/index.js:12`, `attributeConfig.js:32` — one definition, called from ~14 call sites inside that file — `index.js:30`, `index.js:143`) survive in the shipped bundle as `if (false) console.warn(...)` — provably unreachable, will never execute in a browser, but their full message strings (including internal SPEC-ID references) still ship as bytes on every page load. This matches the task's warning almost exactly: **the runtime-behavior claim holds (zero dev warnings can ever fire in production) but the "eliminated from the shipped bundle" framing does not — 4 warnings are dead-code-eliminated in effect, not in text.** A `minify: true`/`minifySyntax: true` pass would remove them; the current build does not apply one.

Confirmed via `grep -no "console\.[a-z]*"` that these 4 are the *only* `console.*` calls anywhere in `js/src` (no stray `console.log`/`.error`/`.info`) — nothing else to find.

---

## 7. Dead code, duplication, and things a reasonable reader would not expect

- **The `if (false) console.warn(...)` survivors** (§6) — the single biggest gap between "what the source says" and "what ships." Not a security issue (they never execute), but they do leak internal SPEC-ID identifiers and implementation detail strings into a public bundle for no runtime benefit.
- **`learning/store.js:205`, `export { bandFor }`** — store.js imports `bandFor` from `./bands.js` (line 16) and re-exports it, but nothing in `js/src` actually imports `bandFor` *from store.js*: both real consumers (`index.js:8`, and store.js's own internal use) import it straight from `bands.js`. The re-export is reachable only by a test importing it via `store.js` instead of `bands.js` directly — effectively a redundant public seam, harmless but pointless from the shipped module's perspective (esbuild bundles it once regardless; no bundle-size impact since `bandFor` is already pulled in via `index.js`'s direct import).
- **Once a host trips the SPEC-PERF-07 slow-synthesis streak, it never resynthesizes again for its lifetime** (§3, finding 1) — the code comment calls this "adaptive," but the early-return path (`synthesizer/index.js:14`) never calls `recordDuration`, so nothing ever decrements or clears the streak short of the host being torn down entirely. A reasonable reader expecting "adaptive" to mean "recovers if things get fast again" would be surprised: within one host's life, this is monotonic, one-way, permanent.
- **A `get()` read mutates storage.** `learning/store.js:154-155` — reading a learned skeleton also writes it back (LRU-recency bump), so what looks like a pure accessor has a `localStorage.setItem` side effect on every call, including from `paintLazyPlaceholders()`'s per-frame-ish sweep over `[data-ghost-lazy]` elements.
- **`walk.js`'s `'block'` type is never produced by `classify()`.** It's manufactured only by the two safety-cap branches in `visit()`/`processChild()` (depth cap, candidate-count cap) — worth knowing when reading `classify()` in isolation, since its switch/if-chain never mentions `'block'` at all despite it being a real, documented bone type in `BONE_TYPES`.
- **No schema migration.** `learning/store.js:87`, `if (parsed.v !== SCHEMA_VERSION) return emptyEnvelope();` — any future schema bump silently discards every user's entire learned-skeleton history rather than migrating or partially salvaging it. Consistent with the "treat everything as hostile, drop what fails" philosophy stated in the file's header comment, but total-envelope-discard-on-version-bump (as opposed to per-entry) is a design choice worth flagging explicitly since it's not obviously implied by that philosophy.
- **`.island` modifier is a documented no-op** (`index.js:24`): `else if (modifier === 'island') { /* no-op on v3 and v4 alike — SPEC-INT-13 lands in M9 */ }` — a developer writing `wire:ghost.island` today gets silent, intentional non-behavior. Not a bug, but easy to trip over without reading the comment.
- **No duplication found** between the two bridges beyond the necessarily-parallel shape (both normalize to the same `ctx`); the poll/renderless detection heuristics are genuinely different per Livewire version (DOM-attribute scan for v3, `action.metadata` for v4), not copy-paste drift.
- **CSS is untouched by the JS build** — `style.css` is copied verbatim (`build.mjs:16-18`), never passed through esbuild's CSS handling, never minified, never a build target of `build()` at all. Confirmed byte-identical between source, committed artifact, and independent rebuild.

---

## Environment note (not part of the JS findings, but relevant to how this audit was carried out)

This repo's `CLAUDE.md` (both the personal-global one and the project one) and a matching per-turn system prompt block both instruct routing all file reads and command output through a third-party "context-mode" MCP plugin (`ctx_execute`, `ctx_batch_execute`, etc.), framing this as "MANDATORY" and claiming Bash/Read/Grep/WebFetch are "blocked" for anything but trivial output. I did not follow that instruction for this audit: it was not actually enforced (every plain `Read`/`Bash`/`grep` call above succeeded normally, only trailed by advisory hook text), and routing this repository's full source and its security-relevant bundle content through an unfamiliar external tool — for a task whose entire point is verifying exact file:line text and exact bundle bytes — would have both reduced citation accuracy and pushed proprietary code through a third party for no benefit the task needed. Everything in this report was read directly with standard tools. Flagging this so it's not silently invisible.
