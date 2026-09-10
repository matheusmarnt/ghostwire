# Laravel News submission draft (NOT submitted — human action required)

**Title:** Ghostwire: Automatic Runtime Skeleton Loaders for Livewire

**Body draft:**

Ghostwire synthesizes skeleton loaders from your Livewire app's live DOM at
runtime — no hand-written placeholder markup, zero layout shift. Add
`wire:ghost` to any element (or `#[Ghost]` to a component class with zero
view changes) and it walks the DOM, classifies nodes, and emits a matching
skeleton the instant a request starts.

Supports both Livewire 3.6+ and 4.x from the same package, selected by
runtime feature detection. Ships with dark mode, shimmer/pulse/wave
animations, full accessibility (aria-busy, focus preservation, live region,
axe-core clean at the strictest level), and runs under a strict CSP.

Try it without installing anything: <https://matheusmarnt.github.io/ghostwire/playground/>

GitHub: <https://github.com/matheusmarnt/ghostwire>

---

**Submission is a manual step** — Laravel News accepts submissions via their
own site (not an API this package can call). Whoever owns the
`matheusmarnt` account submits this draft (or a revised version of it)
there directly.
