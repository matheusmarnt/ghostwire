export function createV4Bridge() {
  function subscribe(handlers) {
    return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
      if (message.isSkipped()) return;

      // SPEC-API-21 default silence: wire:poll sets metadata.type === 'poll'
      // on its action (confirmed by capturing a real poll-triggered message —
      // see js/tests/bridge-v4.test.js). Unlike v3 (SPEC-INT-21/A12, no
      // payload marker so it needs a DOM-origin heuristic), v4 exposes this
      // natively, so no heuristic is needed here — a clean metadata check.
      // Reported as a fact on ctx now (Task 6) — index.js's per-host loop
      // decides silence, this bridge no longer unilaterally swallows the
      // message.
      const isPoll = message.getActions().length > 0
        && message.getActions().every((action) => action.metadata?.type === 'poll');

      const actionNames = message.getActions().map((action) => action.name);
      // SPEC-API-20: a literal empty-actions message is sync. Livewire 4's
      // own client API for a bare property write (Livewire.find(id).set(...),
      // and wire:model.live's internal $commit() call) never produces one —
      // it always wraps the write in a magic action ($set here; $commit is
      // the same category) for client-side promise bookkeeping, even though
      // no user-defined component method ran. Mirror the "every action name
      // matches a known-non-activating pattern" style already used in v3.js's
      // A12 poll heuristic: treat an actions list where every action is one
      // of these magic sync markers as sync too.
      const isSync = actionNames.length === 0 || actionNames.every((name) => name === '$set' || name === '$commit');

      // SPEC-API-22: two confirmed signals, combined.
      // (1) Synchronous, dispatch-time: a `wire:click.renderless="method"`
      // directive modifier sets action.metadata.renderless = true on the
      // client before the request is even sent (confirmed: grepped the
      // installed livewire/livewire ^4.0 dist/livewire.esm.js's action-
      // dispatch code — `let isRenderless =
      // action?.origin?.directive?.modifiers.includes("renderless"); if
      // (isRenderless) action.metadata.renderless = true;`). Mirrors isPoll's
      // metadata check above, same timing, so it's safe to gate onStart with
      // (matches "no configurable exception" fully for this case).
      // (2) Deferred, response-shape: a #[Renderless]-attributed PHP method
      // invoked via a *plain* wire:click carries NO client-side marker at all
      // — confirmed by a real capture (see the temporary investigation test
      // described in the Task 6 report): action.metadata was `{}` at
      // intercept time for DemoTable::renderlessBump() (a genuine
      // #[Renderless] action), same as any ordinary action — grepped
      // vendor/livewire/livewire/src for every "Renderless"/
      // "isRenderlessMethod" reference and confirmed it's resolved purely
      // server-side, via PHP reflection inside HandleComponents::
      // callMethods()/isCallRenderless(), never dehydrated to the client
      // ahead of a request. The one reliable signal for this case is the
      // RESPONSE: HandleComponents::render()
      // (src/Mechanisms/HandleComponents/HandleComponents.php:227-230) never
      // adds an "html" effect when the server decided to skip rendering —
      // confirmed: effects were {returns:[...]} for the #[Renderless] action
      // versus {returns:[...], html:"..."} for an ordinary one, both
      // captured from the real onSuccess payload. That signal only exists
      // post-response (in onSuccess below), not at intercept time like (1) —
      // so ctx.isRenderless starts from the synchronous check and is
      // corrected in onSuccess below, once the response arrives (confirmed
      // real ordering in dist/livewire.esm.js: invokeOnSuccess() always
      // precedes both invokeOnFinish() and the onRender-triggered
      // onPostPaint). NOTE: index.js's onPostPaint/onFinish do NOT read
      // this corrected value -- they gate on ctx._gwSkippedRenderless, a
      // snapshot taken at the start of onStart, before this correction can
      // ever run (see the comment above bridge.subscribe() in index.js).
      // This deferred correction is kept for callers/future work that need
      // the true post-response Renderless status; from onStart's point of
      // view it's write-only.
      const isRenderlessAtDispatch = message.getActions().length > 0
        && message.getActions().every((action) => action.metadata?.renderless === true);

      const ctx = {
        component: message.component,
        actionNames,
        isSync,
        isPoll,
        isRenderless: isRenderlessAtDispatch,
      };

      handlers.onStart(ctx);

      // Livewire internally calls the message's own invokeOnFinish() from
      // within invokeOnCancel()/invokeOnFailure()/invokeOnError() (see
      // vendor/livewire/livewire/dist/livewire.esm.js, Message class), which
      // fires the onFinish interceptor callback too. Since we register a
      // callback on all four terminal hooks, a cancelled/failed/errored
      // message would otherwise call handlers.onFinish(ctx) twice. Guard
      // with the same idempotent pattern as v3.js so it only ever fires once.
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        handlers.onFinish(ctx);
      };

      onSuccess(({ payload, onRender }) => {
        if (!ctx.isRenderless) {
          ctx.isRenderless = !Object.prototype.hasOwnProperty.call(payload?.effects ?? {}, 'html');
        }
        onRender(() => handlers.onPostPaint(ctx));
      });
      onError(() => finish());
      onFailure(() => finish());
      onCancel(() => finish());
      onFinish(() => finish());
    });
  }

  return { name: 'v4', subscribe };
}
