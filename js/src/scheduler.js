export function createScheduler({ onShow, onHide }, defaults = { delay: 120, hold: 300, timeout: 15000 }) {
  function messageStart(host, overrides = {}) {
    host.pending += 1;
    if (host.state !== 'idle') return;

    host.cfg = { ...defaults, ...overrides };
    host.postPaintReceived = false;
    host.state = 'pending';

    host.delayTimer = setTimeout(() => {
      if (host.state !== 'pending') return;
      host.state = 'visible';
      host.shownAt = Date.now();
      onShow(host);
      maybeSettle(host);
    }, host.cfg.delay);

    host.timeoutTimer = setTimeout(() => forceIdle(host), host.cfg.timeout);
  }

  function messagePostPaint(host) {
    host.postPaintReceived = true;
    maybeSettle(host);
  }

  function messageFinish(host) {
    host.pending = Math.max(0, host.pending - 1);
    if (host.pending > 0) return;

    if (host.state === 'pending') {
      clearTimeout(host.delayTimer);
      clearTimeout(host.timeoutTimer);
      host.state = 'idle';
      return;
    }

    maybeSettle(host);
  }

  function maybeSettle(host) {
    if (host.state !== 'visible' || !host.postPaintReceived || host.pending > 0) return;

    const elapsed = Date.now() - host.shownAt;
    const remaining = Math.max(0, host.cfg.hold - elapsed);

    clearTimeout(host.holdTimer);
    host.holdTimer = setTimeout(() => {
      if (host.state !== 'visible') return;
      clearTimeout(host.timeoutTimer);
      host.state = 'settling';
      onHide(host);
      host.state = 'idle';
    }, remaining);
  }

  function forceIdle(host) {
    clearTimeout(host.delayTimer);
    clearTimeout(host.holdTimer);
    const wasVisible = host.state === 'visible' || host.state === 'settling';
    host.state = 'idle';
    host.pending = 0;
    if (wasVisible) onHide(host);
  }

  function cancel(host) {
    clearTimeout(host.delayTimer);
    clearTimeout(host.holdTimer);
    clearTimeout(host.timeoutTimer);
  }

  return { messageStart, messagePostPaint, messageFinish, forceIdle, cancel };
}
