function isPolledMethod(component, methodName) {
  const root = component.el;
  if (!root) return true; // SPEC-INT-21: on uncertainty, default to silence (treat as polled)
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.some((el) => {
    for (const attr of el.attributes) {
      if (attr.name === 'wire:poll' || attr.name.startsWith('wire:poll.')) {
        // Only match an explicit method target. A bare `wire:poll` (no
        // value) targets Livewire's own $refresh, which has an empty
        // `calls` array and is already silenced by the isSync check above
        // -- not by this heuristic. Treating an empty value as "matches
        // anything" used to silence every commit from a component that has
        // a bare wire:poll anywhere in it, including real user-triggered
        // actions like a save() button click.
        return attr.value.trim() === methodName;
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
      // through as "not polling". Reported as a fact on ctx now (Task 6) --
      // index.js's per-host loop decides silence, this bridge no longer
      // unilaterally swallows the message.
      const looksLikePoll = actionNames.length > 0 && actionNames.every((name) => isPolledMethod(component, name));

      // SPEC-API-22: v3's commit.calls carries no per-call metadata at all
      // (confirmed: each entry is only {path, method, params} -- grepped the
      // installed livewire/livewire ^3.6 dist/livewire.esm.js (resolved to
      // v3.8.7) for "renderless"/"Renderless": zero matches anywhere in the
      // client bundle, not even for a `.renderless` directive modifier). So
      // unlike v4, there is no dispatch-time signal of any kind here. The
      // one confirmed, reliable signal is the RESPONSE shape: a
      // #[Renderless]-triggered commit's response never carries an "html"
      // effect key (vendor/livewire/livewire/src/Mechanisms/HandleComponents/
      // HandleComponents.php's update() only calls
      // $context->addEffect('html', $html) when render() actually produced
      // output, and render() returns nothing once shouldSkipRender() is
      // true). Confirmed by a real capture: DemoTable::renderlessBump() (a
      // genuine #[Renderless] action, tests/Browser/Fixtures/DemoTable.php)
      // delivered succeed(response) with effects: {returns: [...]} -- no
      // "html" key -- versus effects: {returns: [...], html: "..."} for an
      // ordinary action, both captured with the temporary investigation test
      // described in the Task 6 report. That signal only exists once the
      // response arrives, in the `succeed` callback below -- not at commit
      // time like isSync/isPoll -- so ctx.isRenderless starts false and is
      // corrected here, once the response arrives. NOTE: index.js's
      // onPostPaint/onFinish do NOT read this corrected value -- they gate
      // on ctx._gwSkippedRenderless, a snapshot taken at the start of
      // onStart, before this correction can ever run (see the comment
      // above bridge.subscribe() in index.js). This deferred correction is
      // kept for callers/future work that need the true post-response
      // Renderless status; from onStart's point of view it's write-only.
      const ctx = { component, actionNames, isSync, isPoll: looksLikePoll, isRenderless: false };
      handlers.onStart(ctx);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        handlers.onFinish(ctx);
      };

      succeed((response) => {
        ctx.isRenderless = !Object.prototype.hasOwnProperty.call(response?.effects ?? {}, 'html');
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
