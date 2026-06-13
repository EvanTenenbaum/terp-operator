// @vitest-environment node
/**
 * UX-F11 (visual-convergence subset) — the Smart Suggestions grid renders
 * its reason text as finder-style "why" chips under the finder's "Why shown"
 * vocabulary. whyShownChips is the splitter behind the cell renderer.
 */
import { describe, it, expect } from 'vitest';
import { whyShownChips } from './SalesView.columns';

describe('whyShownChips (UX-F11)', () => {
  it('returns a single chip for a plain reason', () => {
    expect(whyShownChips('Bought 3x in the last 60 days')).toEqual([
      'Bought 3x in the last 60 days',
    ]);
  });

  it('splits semicolon-delimited reasons into individual chips (finder format)', () => {
    expect(whyShownChips('code match: m15; 41d aging')).toEqual([
      'code match: m15',
      '41d aging',
    ]);
  });

  it('splits middle-dot-delimited reasons', () => {
    expect(whyShownChips('aging stock · category match')).toEqual([
      'aging stock',
      'category match',
    ]);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(whyShownChips('  a ;  ; b  ')).toEqual(['a', 'b']);
  });

  it('returns no chips for null/undefined/empty values', () => {
    expect(whyShownChips(null)).toEqual([]);
    expect(whyShownChips(undefined)).toEqual([]);
    expect(whyShownChips('')).toEqual([]);
  });
});
