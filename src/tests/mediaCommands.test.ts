import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../server/services/mediaStorage', () => ({
  deleteMedia: vi.fn(async () => undefined)
}));

import {
  uploadBatchMedia,
  setBatchMediaRole,
  publishBatchMedia,
  deleteBatchMedia
} from '../server/services/commandBus';
import { deleteMedia } from '../server/services/mediaStorage';

const BATCH_ID = '550e8400-e29b-41d4-a716-446655440000';
const MEDIA_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_MEDIA_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeInsertReturning(returnedRows: unknown[]) {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(returnedRows))
    }))
  }));
}

function makeUpdateWhere(captureSet?: (value: unknown) => void, returnedRows: unknown[] = [{ id: MEDIA_ID }]) {
  return vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      captureSet?.(value);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(returnedRows))
        }))
      };
    })
  }));
}

function makeDeleteWhere() {
  return vi.fn(() => ({
    where: vi.fn(() => Promise.resolve())
  }));
}

describe('uploadBatchMedia', () => {
  it('inserts a batch_media row with role=additional and status=draft, returns the new id', async () => {
    let capturedInsertValues: any;
    const mockTx: any = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          capturedInsertValues = value;
          return {
            returning: vi.fn(() => Promise.resolve([{ id: MEDIA_ID }]))
          };
        })
      }))
    };

    const result = await uploadBatchMedia(
      mockTx,
      {
        batchId: BATCH_ID,
        filePath: '/storage/media/abc/file.jpg',
        originalFilename: 'photo.jpg',
        fileSize: 1234,
        mimeType: 'image/jpeg',
        thumbnailPath: '/storage/media/abc/thumb.jpg',
        mediumPath: '/storage/media/abc/medium.jpg',
        mediaType: 'photo',
        notes: 'hello'
      },
      USER_ID,
      'cmd-1'
    );

    expect(capturedInsertValues.batchId).toBe(BATCH_ID);
    expect(capturedInsertValues.filePath).toBe('/storage/media/abc/file.jpg');
    expect(capturedInsertValues.originalFilename).toBe('photo.jpg');
    expect(capturedInsertValues.fileSize).toBe(1234);
    expect(capturedInsertValues.mimeType).toBe('image/jpeg');
    expect(capturedInsertValues.thumbnailPath).toBe('/storage/media/abc/thumb.jpg');
    expect(capturedInsertValues.mediumPath).toBe('/storage/media/abc/medium.jpg');
    expect(capturedInsertValues.mediaType).toBe('photo');
    expect(capturedInsertValues.role).toBe('additional');
    expect(capturedInsertValues.status).toBe('draft');
    expect(capturedInsertValues.uploadedBy).toBe(USER_ID);
    expect(capturedInsertValues.notes).toBe('hello');

    expect(result.ok).toBe(true);
    expect(result.commandId).toBe('cmd-1');
    expect(result.affectedIds).toEqual([MEDIA_ID]);
  });

  it('accepts a video mediaType', async () => {
    let capturedInsertValues: any;
    const mockTx: any = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          capturedInsertValues = value;
          return {
            returning: vi.fn(() => Promise.resolve([{ id: MEDIA_ID }]))
          };
        })
      }))
    };

    await uploadBatchMedia(
      mockTx,
      {
        batchId: BATCH_ID,
        filePath: '/storage/media/abc/vid.mp4',
        originalFilename: 'video.mp4',
        fileSize: 5000,
        mimeType: 'video/mp4',
        mediaType: 'video'
      },
      USER_ID,
      'cmd-2'
    );

    expect(capturedInsertValues.mediaType).toBe('video');
    expect(capturedInsertValues.thumbnailPath).toBeNull();
    expect(capturedInsertValues.mediumPath).toBeNull();
    expect(capturedInsertValues.notes).toBeNull();
  });

  it('rejects an invalid mediaType', async () => {
    const mockTx: any = { insert: makeInsertReturning([{ id: MEDIA_ID }]) };
    await expect(
      uploadBatchMedia(
        mockTx,
        {
          batchId: BATCH_ID,
          filePath: '/x',
          originalFilename: 'x',
          fileSize: 1,
          mimeType: 'image/jpeg',
          mediaType: 'photo'
        },
        USER_ID,
        'cmd'
      )
    ).resolves.toBeTruthy();

    await expect(
      uploadBatchMedia(
        mockTx,
        {
          batchId: BATCH_ID,
          filePath: '/x',
          originalFilename: 'x',
          fileSize: 1,
          mimeType: 'image/jpeg',
          mediaType: 'bogus'
        },
        USER_ID,
        'cmd'
      )
    ).rejects.toThrow(/mediaType/i);
  });

  it('requires batchId to be a valid UUID', async () => {
    const mockTx: any = { insert: makeInsertReturning([{ id: MEDIA_ID }]) };
    await expect(
      uploadBatchMedia(
        mockTx,
        {
          batchId: 'not-a-uuid',
          filePath: '/x',
          originalFilename: 'x',
          fileSize: 1,
          mimeType: 'image/jpeg',
          mediaType: 'photo'
        },
        USER_ID,
        'cmd'
      )
    ).rejects.toThrow(/batchId/i);
  });

  it('requires fileSize to be a non-negative number', async () => {
    const mockTx: any = { insert: makeInsertReturning([{ id: MEDIA_ID }]) };
    await expect(
      uploadBatchMedia(
        mockTx,
        {
          batchId: BATCH_ID,
          filePath: '/x',
          originalFilename: 'x',
          fileSize: -5,
          mimeType: 'image/jpeg',
          mediaType: 'photo'
        },
        USER_ID,
        'cmd'
      )
    ).rejects.toThrow(/fileSize/i);
  });
});

describe('setBatchMediaRole', () => {
  it('updates the role to primary_photo when no conflicting primary exists', async () => {
    let capturedSet: any;
    const mockTx: any = {
      execute: vi.fn(() => Promise.resolve({
        rows: [{ id: MEDIA_ID, batch_id: BATCH_ID, role: 'additional', status: 'draft' }]
      })),
      update: makeUpdateWhere((v) => { capturedSet = v; }, [{ id: MEDIA_ID }])
    };

    const result = await setBatchMediaRole(
      mockTx,
      { mediaId: MEDIA_ID, role: 'primary_photo' },
      'cmd-role-1'
    );

    expect(capturedSet.role).toBe('primary_photo');
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([MEDIA_ID]);
  });

  it('allows reverting role to additional', async () => {
    let capturedSet: any;
    const mockTx: any = {
      execute: vi.fn(() => Promise.resolve({
        rows: [{ id: MEDIA_ID, batch_id: BATCH_ID, role: 'primary_photo', status: 'published' }]
      })),
      update: makeUpdateWhere((v) => { capturedSet = v; }, [{ id: MEDIA_ID }])
    };

    await setBatchMediaRole(
      mockTx,
      { mediaId: MEDIA_ID, role: 'additional' },
      'cmd-role-2'
    );

    expect(capturedSet.role).toBe('additional');
  });

  it('rejects an invalid role value', async () => {
    const mockTx: any = {
      execute: vi.fn(() => Promise.resolve({ rows: [{ id: MEDIA_ID, batch_id: BATCH_ID }] })),
      update: makeUpdateWhere()
    };

    await expect(
      setBatchMediaRole(mockTx, { mediaId: MEDIA_ID, role: 'banana' }, 'cmd')
    ).rejects.toThrow(/role/i);
  });

  it('throws when the media row is missing', async () => {
    const mockTx: any = {
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
      update: makeUpdateWhere()
    };

    await expect(
      setBatchMediaRole(mockTx, { mediaId: MEDIA_ID, role: 'primary_photo' }, 'cmd')
    ).rejects.toThrow(/not found/i);
  });

  it('uses FOR UPDATE to lock the row and any conflicting primary on the same batch', async () => {
    function extractSqlText(sqlObj: any): string {
      if (typeof sqlObj === 'string') return sqlObj;
      const chunks = sqlObj?.queryChunks;
      if (!Array.isArray(chunks)) return String(sqlObj);
      // queryChunks contains StringChunk objects whose .value is an array of strings.
      return chunks
        .map((c: any) => {
          if (typeof c?.value === 'string') return c.value;
          if (Array.isArray(c?.value)) return c.value.join(' ');
          return '';
        })
        .join(' ');
    }

    const executeCalls: string[] = [];
    const mockTx: any = {
      execute: vi.fn((sqlObj: any) => {
        executeCalls.push(extractSqlText(sqlObj));
        if (executeCalls.length === 1) {
          return Promise.resolve({
            rows: [{ id: MEDIA_ID, batch_id: BATCH_ID, role: 'additional', status: 'draft' }]
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      update: makeUpdateWhere()
    };

    await setBatchMediaRole(
      mockTx,
      { mediaId: MEDIA_ID, role: 'primary_photo' },
      'cmd-lock'
    );

    expect(executeCalls.length).toBeGreaterThanOrEqual(1);
    const combined = executeCalls.join(' ');
    expect(/FOR UPDATE/i.test(combined)).toBe(true);
  });

  it('surfaces a clear error when the partial-unique index throws on conflicting primary', async () => {
    const mockTx: any = {
      execute: vi.fn(() => Promise.resolve({
        rows: [{ id: MEDIA_ID, batch_id: BATCH_ID, role: 'additional', status: 'draft' }]
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.reject(
              Object.assign(new Error('duplicate key value violates unique constraint "batch_media_primary_photo_unique"'), { code: '23505' })
            ))
          }))
        }))
      }))
    };

    await expect(
      setBatchMediaRole(mockTx, { mediaId: OTHER_MEDIA_ID, role: 'primary_photo' }, 'cmd-conflict')
    ).rejects.toThrow(/already.*primary|primary.*already|unique/i);
  });
});

describe('publishBatchMedia', () => {
  it('transitions draft to published and sets published_at', async () => {
    let capturedSet: any;
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          capturedSet = value;
          return {
            where: vi.fn(() => ({
              returning: vi.fn(() => Promise.resolve([{ id: MEDIA_ID }]))
            }))
          };
        })
      }))
    };

    const result = await publishBatchMedia(
      mockTx,
      { mediaId: MEDIA_ID },
      'cmd-pub'
    );

    expect(capturedSet.status).toBe('published');
    expect(capturedSet.publishedAt).toBeInstanceOf(Date);
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([MEDIA_ID]);
  });

  it('throws when the row is not in draft (no rows updated)', async () => {
    const mockTx: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([]))
          }))
        }))
      }))
    };

    await expect(
      publishBatchMedia(mockTx, { mediaId: MEDIA_ID }, 'cmd-pub-fail')
    ).rejects.toThrow(/draft|not found/i);
  });

  it('rejects an invalid mediaId', async () => {
    const mockTx: any = { update: vi.fn() };
    await expect(
      publishBatchMedia(mockTx, { mediaId: 'bad-id' }, 'cmd')
    ).rejects.toThrow(/mediaId/i);
  });
});

describe('deleteBatchMedia', () => {
  beforeEach(() => {
    vi.mocked(deleteMedia).mockClear();
    vi.mocked(deleteMedia).mockResolvedValue(undefined);
  });

  it('reads the row, deletes the DB row, and best-effort deletes the files', async () => {
    const rowRead = {
      id: MEDIA_ID,
      filePath: '/storage/media/abc/file.jpg',
      thumbnailPath: '/storage/media/abc/thumb.jpg',
      mediumPath: '/storage/media/abc/medium.jpg'
    };

    let deleteCalled = false;
    const mockTx: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([rowRead]))
        }))
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => {
          deleteCalled = true;
          return Promise.resolve();
        })
      }))
    };

    const result = await deleteBatchMedia(
      mockTx,
      { mediaId: MEDIA_ID },
      'cmd-del'
    );

    expect(deleteCalled).toBe(true);
    expect(vi.mocked(deleteMedia)).toHaveBeenCalledWith(
      '/storage/media/abc/file.jpg',
      '/storage/media/abc/thumb.jpg',
      '/storage/media/abc/medium.jpg'
    );
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([MEDIA_ID]);
  });

  it('still succeeds when file cleanup fails (DB is source of truth)', async () => {
    const rowRead = {
      id: MEDIA_ID,
      filePath: '/missing.jpg',
      thumbnailPath: null,
      mediumPath: null
    };

    vi.mocked(deleteMedia).mockRejectedValueOnce(new Error('disk error'));

    const mockTx: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([rowRead]))
        }))
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    };

    const result = await deleteBatchMedia(
      mockTx,
      { mediaId: MEDIA_ID },
      'cmd-del-2'
    );

    expect(result.ok).toBe(true);
  });

  it('throws when the row is missing', async () => {
    const mockTx: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([]))
        }))
      })),
      delete: makeDeleteWhere()
    };

    await expect(
      deleteBatchMedia(mockTx, { mediaId: MEDIA_ID }, 'cmd')
    ).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid mediaId', async () => {
    const mockTx: any = { select: vi.fn(), delete: vi.fn() };
    await expect(
      deleteBatchMedia(mockTx, { mediaId: 'nope' }, 'cmd')
    ).rejects.toThrow(/mediaId/i);
  });
});
