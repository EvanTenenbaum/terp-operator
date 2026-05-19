export interface Weights {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

export interface SignalScores {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

function assertScore01to100(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${name} score must be an integer in [0,100]`);
  }
}

export function aggregateOverallScore(scores: SignalScores, weights: Weights): number {
  const weightSum =
    weights.revenueMomentum + weights.cashCollection + weights.profitability +
    weights.debtAging + weights.repaymentVelocity + weights.tenureDepth;
  if (weightSum !== 100) {
    throw new Error(`weights must sum to 100 (got ${weightSum})`);
  }
  assertScore01to100(scores.revenueMomentum,    'revenueMomentum');
  assertScore01to100(scores.cashCollection,     'cashCollection');
  assertScore01to100(scores.profitability,      'profitability');
  assertScore01to100(scores.debtAging,          'debtAging');
  assertScore01to100(scores.repaymentVelocity,  'repaymentVelocity');
  assertScore01to100(scores.tenureDepth,        'tenureDepth');

  const weighted =
    scores.revenueMomentum    * weights.revenueMomentum +
    scores.cashCollection     * weights.cashCollection +
    scores.profitability      * weights.profitability +
    scores.debtAging          * weights.debtAging +
    scores.repaymentVelocity  * weights.repaymentVelocity +
    scores.tenureDepth        * weights.tenureDepth;
  return Math.round(weighted / 100);
}

export function mapScoreToMultiplier(score: number): number {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`score must be an integer in [0,100] (got ${score})`);
  }
  if (score < 20)  return 0.0;
  if (score < 40)  return 0.5;
  if (score < 60)  return 1.0;
  if (score < 80)  return 2.0;
  if (score < 90)  return 3.0;
  return 4.0;
}
