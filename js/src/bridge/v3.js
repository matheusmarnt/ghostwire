function isPolledMethod(component, methodName) {
  const root = component.el;
  if (!root) return false;
  return Array.from(root.querySelectorAll('*')).some((el) => {
    for (const attr of el.attributes) {
      if (attr.name === 'wire:poll' || attr.name.startsWith('wire:poll.')) {
        return attr.value.trim() === methodName || attr.value.trim() === '';
      }
    }
    return false;
  });
}

export function createV3Bridge() {
  function subscribe(handlers) {
    window.Livewire.hook('commit', ({ component, commit, succeed, fail }) => {
      const actionNames = commit.calls.map((call) => call.method);
      const isSync = actionNames.length === 0;

      // A12 (SPEC-INT-21): no payload marker distinguishes a poll-triggered
      // commit from any other in Livewire 3. Heuristic: every call name
      // resolves to an element carrying a matching wire:poll directive in
      // the component root -> treat as polling and silence (SPEC-API-21
      // default). Any call name with no matching wire:poll element falls
      // through as "not polling".
      const looksLikePoll = actionNames.length > 0 && actionNames.every((name) => isPolledMethod(component, name));
      if (looksLikePoll) return;

      const ctx = { component, actionNames, isSync };
      handlers.onStart(ctx);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        handlers.onFinish(ctx);
      };

      succeed(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => handlers.onPostPaint(ctx));
        });
        finish();
      });
      fail(() => finish());
    });

    return () => {};
  }

  return { name: 'v3', subscribe };
}
