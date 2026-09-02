import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from '../src/scheduler.js';

function makeHost() {
  return { el: document.createElement('div'), component: { id: 'c1' }, config: {}, state: 'idle', pending: 0, layer: null };
}

describe('scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not show if finish arrives before the delay elapses (SPEC-TIME-01)', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    const scheduler = createScheduler({ onShow, onHide }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    vi.advanceTimersByTime(50);
    scheduler.messagePostPaint(host);
    scheduler.messageFinish(host);

    expect(onShow).not.toHaveBeenCalled();
    expect(host.state).toBe('idle');
  });

  it('shows after the delay elapses while still pending', () => {
    const onShow = vi.fn();
    const scheduler = createScheduler({ onShow, onHide: vi.fn() }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    vi.advanceTimersByTime(120);

    expect(onShow).toHaveBeenCalledOnce();
    expect(host.state).toBe('visible');
  });

  it('holds for the minimum duration before hiding, from the moment it became visible', () => {
    const onHide = vi.fn();
    const scheduler = createScheduler({ onShow: vi.fn(), onHide }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    vi.advanceTimersByTime(120); // now visible
    vi.advanceTimersByTime(100);
    scheduler.messagePostPaint(host);
    scheduler.messageFinish(host); // postPaint + finish at t=220ms since shown

    expect(onHide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199); // t=299ms since shown — still short of 300ms hold
    expect(onHide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // t=300ms since shown
    expect(onHide).toHaveBeenCalledOnce();
    expect(host.state).toBe('idle');
  });

  it('ref-counts concurrent messages on the same host (SPEC-INT-11)', () => {
    const onHide = vi.fn();
    const scheduler = createScheduler({ onShow: vi.fn(), onHide }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    scheduler.messageStart(host); // second concurrent message
    vi.advanceTimersByTime(120);
    scheduler.messagePostPaint(host);
    scheduler.messageFinish(host); // only one of the two finished

    vi.advanceTimersByTime(500);
    expect(onHide).not.toHaveBeenCalled(); // still pending on the second message

    scheduler.messageFinish(host);
    vi.advanceTimersByTime(300);
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('force-removes unconditionally at the absolute timeout (SPEC-INT-12)', () => {
    const onHide = vi.fn();
    const scheduler = createScheduler({ onShow: vi.fn(), onHide }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    vi.advanceTimersByTime(15000);

    expect(onHide).toHaveBeenCalledOnce();
    expect(host.state).toBe('idle');
    expect(host.pending).toBe(0);
  });

  it('cancel() clears all pending timers without calling onHide', () => {
    const onHide = vi.fn();
    const scheduler = createScheduler({ onShow: vi.fn(), onHide }, { delay: 120, hold: 300, timeout: 15000 });
    const host = makeHost();

    scheduler.messageStart(host);
    scheduler.cancel(host);
    vi.advanceTimersByTime(20000);

    expect(onHide).not.toHaveBeenCalled();
  });
});
