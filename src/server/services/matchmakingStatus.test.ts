import { describe, it, expect, vi } from 'vitest';
import { reviewMatchmakingMatch } from './commandBus';
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
