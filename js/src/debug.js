// Developer diagnostics switch.
//
// This replaces a `process.env.NODE_ENV !== 'production'` gate that js/build.mjs
// folded to literal false, which made all 26 warning call sites unreachable in
// the only artifact anyone ships — FR-61 promises feedback nobody could
// receive. The flag is read from the package's own
// <script> tag, so there is no inline script and therefore no CSP nonce
// question, and a developer can also turn it on while debugging a real
// production incident, which is when these messages matter most.

let debug = false;

try {
  // currentScript is the package's own tag while this bundle executes.
  debug = document.currentScript?.dataset?.ghostwireDebug === '1';
} catch {
  // No document (unit tests, SSR-ish environments): stay off.
}

export function isDebug() {
  return debug;
}

/** Test-only seam. Production code must never call this. */
export function setDebugForTests(value) {
  debug = Boolean(value);
}
