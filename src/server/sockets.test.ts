/**
 * CAP-030 / TER-1518 — Socket pick event helpers: unit tests
 *
 * Spec requirement: emitPickEvent and emitPickOrderAndQueue must be safe to call
 * when the socket server is not initialized (e.g., in unit tests / offline scenarios).
 * This satisfies the "sockets unavailable → graceful fallback" requirement.
 *
 * When sockets are unavailable, the pick queue UI still reconciles via
 * react-query's staleness interval (30s pickQueue, 10s pickListWithLines).
 */
import { describe, it, expect } from 'vitest';
import { emitPickEvent, emitPickOrderAndQueue } from './sockets';

describe('emitPickEvent (no-op when socket server not initialized)', () => {
  it('does not throw when called before createSocketServer', () => {
    // _io is null here (server not started) — must be a silent no-op.
    expect(() => emitPickEvent('pick:queue', { kind: 'test', at: new Date().toISOString() })).not.toThrow();
  });

  it('does not throw for pick:order channel before server init', () => {
    expect(() => emitPickEvent(`pick:order:${'00000000-0000-0000-0000-000000000001'}`, { kind: 'test', at: new Date().toISOString() })).not.toThrow();
  });
});

describe('emitPickOrderAndQueue (no-op when socket server not initialized)', () => {
  it('emits both channels without throwing when io is null', () => {
    const orderId = '00000000-0000-0000-0000-000000000002';
    expect(() =>
      emitPickOrderAndQueue(orderId, { kind: 'line_released', at: new Date().toISOString() })
    ).not.toThrow();
  });
});
