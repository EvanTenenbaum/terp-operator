// Task 13 — Type-level witness exclusivity and renderer signature tests.
//
// These tests use @ts-expect-error and expectTypeOf to assert at the
// TypeScript type level. The test bodies evaluate at runtime as no-ops
// (void _i, expectTypeOf are inert). The load-bearing check is pnpm
// typecheck: removing any @ts-expect-error should produce a tsc error.
//
// vitest runs this file but the tests always pass at runtime — that is
// intentional. The real gate is typecheck.

import { describe, it, expectTypeOf } from 'vitest';
import type {
  ExternalReceiptProjection,
  InternalReceiptProjection
} from './projections/types';
import {
  renderSignalText,
  getExternalReceipt,
  getInternalReceipt
} from './documentSnapshots';

describe('type-level witness exclusivity', () => {
  it('ExternalReceiptProjection cannot be assigned to InternalReceiptProjection', () => {
    const ext = {} as ExternalReceiptProjection;
    // @ts-expect-error — witness mismatch: __EXTERNAL_PROJECTED__ vs __INTERNAL_ONLY__
    const _i: InternalReceiptProjection = ext;
    void _i;
  });

  it('InternalReceiptProjection cannot be assigned to ExternalReceiptProjection', () => {
    const int = {} as InternalReceiptProjection;
    // @ts-expect-error
    const _e: ExternalReceiptProjection = int;
    void _e;
  });

  it('renderSignalText rejects InternalReceiptProjection at the signature', () => {
    // Type-level check only — body is never executed at runtime.
    void (() => {
      const int = {} as InternalReceiptProjection;
      // @ts-expect-error — renderSignalText accepts external only
      renderSignalText(int);
    });
  });

  it('getExternalReceipt return type does not unify with InternalReceiptProjection', () => {
    expectTypeOf(getExternalReceipt).returns
      .not.toMatchTypeOf<Promise<InternalReceiptProjection | null>>();
  });

  it('getInternalReceipt return type does not unify with ExternalReceiptProjection', () => {
    expectTypeOf(getInternalReceipt).returns
      .not.toMatchTypeOf<Promise<ExternalReceiptProjection | null>>();
  });
});
