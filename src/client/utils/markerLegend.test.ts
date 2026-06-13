/**
 * UX-H07 — markerLegend utility tests.
 *
 * Verifies:
 *  - markerTooltip returns undefined for blank/unknown values.
 *  - legacy markers produce tooltips that include 'inferred'.
 *  - ownership markers produce tooltips with the correct confidence level.
 *  - Case-insensitive lookup works for known markers.
 */
import { describe, it, expect } from 'vitest';
import {
  markerTooltip,
  LEGACY_MARKER_LEGEND,
  OWNERSHIP_LEGEND,
} from './markerLegend';

describe('markerTooltip — legacy markers', () => {
  it('returns undefined for empty string', () => {
    expect(markerTooltip('', 'legacy')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(markerTooltip(null, 'legacy')).toBeUndefined();
  });

  it('returns undefined for unknown marker', () => {
    expect(markerTooltip('ZZZZ', 'legacy')).toBeUndefined();
  });

  it('returns a tooltip for "C" (consignment inferred)', () => {
    const tip = markerTooltip('C', 'legacy');
    expect(tip).toBeDefined();
    expect(tip).toContain('inferred');
    expect(tip).toContain('consignment');
  });

  it('returns a tooltip for "O" (owned inferred)', () => {
    const tip = markerTooltip('O', 'legacy');
    expect(tip).toBeDefined();
    expect(tip).toContain('owned');
  });

  it('returns a tooltip for "F" (flex inferred)', () => {
    const tip = markerTooltip('F', 'legacy');
    expect(tip).toBeDefined();
    expect(tip).toContain('flex');
  });

  it('returns a tooltip for "OFC" legacy marker', () => {
    const tip = markerTooltip('OFC', 'legacy');
    expect(tip).toBeDefined();
    expect(tip).toContain('office');
  });

  it('case-insensitive: "c" resolves same as "C"', () => {
    const tipLower = markerTooltip('c', 'legacy');
    const tipUpper = markerTooltip('C', 'legacy');
    expect(tipLower).toBe(tipUpper);
  });
});

describe('markerTooltip — ownership markers', () => {
  it('returns a tooltip for "OWN" (confirmed)', () => {
    const tip = markerTooltip('OWN', 'ownership');
    expect(tip).toBeDefined();
    expect(tip).toContain('[Confirmed]');
    expect(tip).toContain('owned outright');
  });

  it('returns a tooltip for "CONSIGNMENT" (confirmed)', () => {
    const tip = markerTooltip('CONSIGNMENT', 'ownership');
    expect(tip).toBeDefined();
    expect(tip).toContain('[Confirmed]');
    expect(tip).toContain('consignment');
  });

  it('returns a tooltip for "UNKNOWN" (inferred)', () => {
    const tip = markerTooltip('UNKNOWN', 'ownership');
    expect(tip).toBeDefined();
    expect(tip).toContain('[Inferred');
    expect(tip).toContain('not yet classified');
  });

  it('returns a tooltip for "OFC" (confirmed office)', () => {
    const tip = markerTooltip('OFC', 'ownership');
    expect(tip).toBeDefined();
    expect(tip).toContain('[Confirmed]');
  });

  it('returns undefined for unrecognised ownership code', () => {
    expect(markerTooltip('VENDOR_HOLD', 'ownership')).toBeUndefined();
  });
});

describe('LEGACY_MARKER_LEGEND integrity', () => {
  it('all entries have a label, confidence, and description', () => {
    for (const [key, entry] of Object.entries(LEGACY_MARKER_LEGEND)) {
      expect(entry.label, `${key} label`).toBeTruthy();
      expect(['confirmed', 'inferred']).toContain(entry.confidence);
      expect(entry.description, `${key} description`).toBeTruthy();
    }
  });

  it('all legacy markers are classified as inferred', () => {
    for (const entry of Object.values(LEGACY_MARKER_LEGEND)) {
      expect(entry.confidence).toBe('inferred');
    }
  });
});

describe('OWNERSHIP_LEGEND integrity', () => {
  it('all entries have a label, confidence, and description', () => {
    for (const [key, entry] of Object.entries(OWNERSHIP_LEGEND)) {
      expect(entry.label, `${key} label`).toBeTruthy();
      expect(['confirmed', 'inferred']).toContain(entry.confidence);
      expect(entry.description, `${key} description`).toBeTruthy();
    }
  });

  it('OWN and CONSIGNMENT and OFC are confirmed', () => {
    expect(OWNERSHIP_LEGEND['OWN'].confidence).toBe('confirmed');
    expect(OWNERSHIP_LEGEND['CONSIGNMENT'].confidence).toBe('confirmed');
    expect(OWNERSHIP_LEGEND['OFC'].confidence).toBe('confirmed');
  });

  it('UNKNOWN is inferred', () => {
    expect(OWNERSHIP_LEGEND['UNKNOWN'].confidence).toBe('inferred');
  });
});
