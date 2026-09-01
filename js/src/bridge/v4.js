export function createV4Bridge() {
  function subscribe(handlers) {
    return window.Livewire.interceptMessage(({ message, onSuccess, onError, onFailure, onCancel, onFinish }) => {
      if (message.isSkipped()) return;

      const ctx = {
        component: message.component,
        actionNames: message.getActions().map((action) => action.name),
        isSync: message.getActions().length === 0,
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
