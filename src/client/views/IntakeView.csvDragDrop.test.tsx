// @vitest-environment jsdom
// TER-1627 / TER-1658: CSV import removed from MVP intake.
// The CSV drag-and-drop UI was removed by TER-1658 — these tests are
// no longer valid.  Keep the file as a placeholder so when CSV import
// is re-introduced we have a starting point.
import { describe, it, expect } from 'vitest';

describe('CSV import (removed, TER-1658)', () => {
  it('placeholder — CSV import UI was removed from IntakeView', () => {
    // TER-1658: CSV import retired from MVP. All intake must originate
    // from a purchase order via receivePurchaseOrder.
    expect(true).toBe(true);
  });
});
