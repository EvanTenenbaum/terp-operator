export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export function bucketConfidence(dataCount: number): ConfidenceLevel {
  if (!Number.isInteger(dataCount)) {
    throw new Error('dataCount must be an integer');
  }
  if (dataCount < 0) {
    throw new Error('dataCount must be non-negative');
  }
  if (dataCount === 0) return 'none';
  if (dataCount <= 2) return 'low';
  if (dataCount <= 9) return 'medium';
  return 'high';
}
