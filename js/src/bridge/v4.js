export function createV4Bridge() {
  function subscribe(handlers) {
    return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
      if (message.isSkipped()) return;

      // SPEC-API-21 default silence: wire:poll sets metadata.type === 'poll'
      // on its action (confirmed by capturing a real poll-triggered message —
      // see js/tests/bridge-v4.test.js). Unlike v3 (SPEC-INT-21/A12, no
      // payload marker so it needs a DOM-origin heuristic), v4 exposes this
      // natively, so no heuristic is needed here — a clean metadata check.
      const isPoll = message.getActions().length > 0
        && message.getActions().every((action) => action.metadata?.type === 'poll');
      if (isPoll) return;

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
      const isSync = actionNames.length === 0 || actionNames.every((name) => name === '$set');

      const ctx = {
        component: message.component,
        actionNames,
        isSync,
      };

      handlers.onStart(ctx);

      onSuccess(({ onRender }) => {
        onRender(() => handlers.onPostPaint(ctx));
      });
      onError(() => handlers.onFinish(ctx));
      onFailure(() => handlers.onFinish(ctx));
      onCancel(() => handlers.onFinish(ctx));
      onFinish(() => handlers.onFinish(ctx));
    });
  }

  return { name: 'v4', subscribe };
}
