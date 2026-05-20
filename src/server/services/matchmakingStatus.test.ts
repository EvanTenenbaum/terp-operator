import { describe, it, expect, vi } from 'vitest';
import { reviewMatchmakingMatch, reopenMatchmakingMatch } from './commandBus';
import type { Tx } from './commandBus';

function makeTxWithMatchStatus(status: string | null): Tx {
  const matchRow = status === null ? undefined : {
    id: '11111111-1111-1111-1111-111111111111',
    customerNeedId: '22222222-2222-2222-2222-222222222222',
    vendorSupplyId: '33333333-3333-3333-3333-333333333333',
    status,
    reviewedBy: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const chain = {
    limit: vi.fn().mockResolvedValue(matchRow ? [matchRow] : [])
  };
  const where = vi.fn().mockReturnValue(chain);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([])
    })
  });
  return { select, update } as unknown as Tx;
}

interface CapturingTx {
  tx: Tx;
  setCalls: Array<Record<string, unknown>>;
}

function makeCapturingTxWithMatchStatus(status: string | null): CapturingTx {
  const matchRow = status === null ? undefined : {
    id: '11111111-1111-1111-1111-111111111111',
    customerNeedId: '22222222-2222-2222-2222-222222222222',
    vendorSupplyId: '33333333-3333-3333-3333-333333333333',
    status,
    reviewedBy: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const chain = {
    limit: vi.fn().mockResolvedValue(matchRow ? [matchRow] : [])
  };
  const where = vi.fn().mockReturnValue(chain);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const setCalls: Array<Record<string, unknown>> = [];
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      setCalls.push(values);
      return {
        where: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([])
      };
    })
  });
  const tx = { select, update } as unknown as Tx;
  return { tx, setCalls };
}

describe('reviewMatchmakingMatch — status guard (#27)', () => {
  const payload = { matchId: '11111111-1111-1111-1111-111111111111' };
  const userId = '99999999-9999-9999-9999-999999999999';
  const commandId = 'cmd-1';

  it('throws when the match has already been accepted (cannot flip accepted → dismissed)', async () => {
    const tx = makeTxWithMatchStatus('accepted');
    await expect(
      reviewMatchmakingMatch(tx, payload, 'dismissed', userId, commandId)
    ).rejects.toThrow(/already accepted/i);
  });

  it('throws when the match has already been dismissed (cannot flip dismissed → accepted)', async () => {
    const tx = makeTxWithMatchStatus('dismissed');
    await expect(
      reviewMatchmakingMatch(tx, payload, 'accepted', userId, commandId)
    ).rejects.toThrow(/already dismissed/i);
  });

  it('throws when the same status is applied twice (idempotency rejection, e.g. double-click)', async () => {
    const tx = makeTxWithMatchStatus('accepted');
    await expect(
      reviewMatchmakingMatch(tx, payload, 'accepted', userId, commandId)
    ).rejects.toThrow(/already accepted/i);
  });

  it('throws when the match is not found', async () => {
    const tx = makeTxWithMatchStatus(null);
    await expect(
      reviewMatchmakingMatch(tx, payload, 'accepted', userId, commandId)
    ).rejects.toThrow(/not found/i);
  });

  it('throws when matchId is missing', async () => {
    const tx = makeTxWithMatchStatus('open');
    await expect(
      reviewMatchmakingMatch(tx, {}, 'accepted', userId, commandId)
    ).rejects.toThrow(/matchId/i);
  });
});

describe('reopenMatchmakingMatch — reverse path (#81)', () => {
  const matchId = '11111111-1111-1111-1111-111111111111';
  const payload = { matchId };
  const userId = '99999999-9999-9999-9999-999999999999';
  const commandId = 'cmd-reopen-1';

  it('flips an accepted match back to open and records reviewedBy', async () => {
    const { tx, setCalls } = makeCapturingTxWithMatchStatus('accepted');
    const result = await reopenMatchmakingMatch(tx, payload, userId, commandId);
    expect(result.ok).toBe(true);
    expect(result.commandId).toBe(commandId);
    expect(result.affectedIds).toContain(matchId);
    expect(result.toast).toMatch(/reopened/i);
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
    const firstSet = setCalls[0];
    expect(firstSet.status).toBe('open');
    expect(firstSet.reviewedBy).toBe(userId);
    expect(firstSet.updatedAt).toBeInstanceOf(Date);
  });

  it('flips a dismissed match back to open', async () => {
    const { tx, setCalls } = makeCapturingTxWithMatchStatus('dismissed');
    const result = await reopenMatchmakingMatch(tx, payload, userId, commandId);
    expect(result.ok).toBe(true);
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
    expect(setCalls[0].status).toBe('open');
    expect(setCalls[0].reviewedBy).toBe(userId);
  });

  it('throws when the match is already open (explicit no-op message)', async () => {
    const tx = makeTxWithMatchStatus('open');
    await expect(
      reopenMatchmakingMatch(tx, payload, userId, commandId)
    ).rejects.toThrow(/already open/i);
  });

  it('throws "Match not found." when the match does not exist', async () => {
    const tx = makeTxWithMatchStatus(null);
    await expect(
      reopenMatchmakingMatch(tx, payload, userId, commandId)
    ).rejects.toThrow(/not found/i);
  });

  it('does NOT issue updates against sibling matches when reopening an accept', async () => {
    // Sibling auto-dismissed matches stay dismissed — those were independent decisions.
    // Only the targeted match is updated.
    const { tx, setCalls } = makeCapturingTxWithMatchStatus('accepted');
    await reopenMatchmakingMatch(tx, payload, userId, commandId);
    // Exactly one set call — for the targeted match — no sibling sweep, no need/supply parent flip.
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].status).toBe('open');
  });
});
