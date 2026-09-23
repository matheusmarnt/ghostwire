import { isDebug } from '../debug.js';

function isPolledMethod(component, methodName) {
  const root = component.el;
  if (!root) return true; // On uncertainty, default to silence (treat as polled)
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
      // Blindagem: this callback runs inside Livewire's own commit-dispatch
      // machinery, same failure class as v4.js's interceptMessage — an
      // uncaught throw here propagates out and kills every Livewire request
      // on the page, not just this commit's skeleton. A missing skeleton is
      // an acceptable degradation; a dead Livewire app is not. Neither this
      // callback nor its registered succeed/fail handlers below ever call
      // anything equivalent to preventDefault() on Livewire's own dispatch,
      // so catching and returning here can't interrupt Livewire's own
      // succeed/fail flow for this commit.
      try {
        const actionNames = commit.calls.map((call) => call.method);
        const isSync = actionNames.length === 0;

        // No payload marker distinguishes a poll-triggered
        // commit from any other in Livewire 3. Heuristic: every call name
        // resolves to an element carrying a matching wire:poll directive in
        // the component root -> treat as polling and silence (default).
        // Any call name with no matching wire:poll element falls
        // through as "not polling". Reported as a fact on ctx now --
        // index.js's per-host loop decides silence, this bridge no longer
        // unilaterally swallows the message.
        const looksLikePoll = actionNames.length > 0 && actionNames.every((name) => isPolledMethod(component, name));

        // v3's commit.calls carries no per-call metadata at all
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
        // ordinary action, both captured with that temporary investigation
        // test. That signal only exists once the
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
      } catch (error) {
        // Contain any throwing callback (blindagem) -- same failure class as
        // v4.js's isSkipped crash: an uncaught throw here propagates out
        // through Livewire's own dispatch and kills every Livewire request
        // on the page, not just this commit's skeleton.
        if (isDebug()) console.warn('[ghostwire] v3 bridge commit hook callback threw — skeleton skipped for this commit:', error);
      }
    });

    return () => {};
  }

  return { name: 'v3', subscribe };
}
