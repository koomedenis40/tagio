import type { PriceCandidate } from './price';

export type LockState =
  | { phase: 'searching' }
  | { phase: 'locked'; candidate: PriceCandidate; since: number };

/**
 * Keeps the number on screen steady.
 * A price locks after it is read the same way in `confirmFrames` results in a row,
 * stays until a different price is confirmed, and is released after `releaseFrames`
 * results with no price at all (the camera moved away).
 */
export class PriceLocker {
  private state: LockState = { phase: 'searching' };
  private pending?: { amount: number; count: number };
  private misses = 0;

  constructor(
    private readonly confirmFrames = 2,
    private readonly releaseFrames = 6,
  ) {}

  get current(): LockState {
    return this.state;
  }

  feed(candidate: PriceCandidate | undefined, now = Date.now()): LockState {
    if (!candidate) {
      this.pending = undefined;
      this.misses += 1;
      if (this.state.phase === 'locked' && this.misses >= this.releaseFrames) {
        this.state = { phase: 'searching' };
      }
      return this.state;
    }
    this.misses = 0;

    if (this.state.phase === 'locked' && sameAmount(this.state.candidate.amount, candidate.amount)) {
      this.pending = undefined;
      return this.state;
    }

    if (this.pending && sameAmount(this.pending.amount, candidate.amount)) {
      this.pending.count += 1;
    } else {
      this.pending = { amount: candidate.amount, count: 1 };
    }

    if (this.pending.count >= this.confirmFrames) {
      this.state = { phase: 'locked', candidate, since: now };
      this.pending = undefined;
    }
    return this.state;
  }

  reset(): void {
    this.state = { phase: 'searching' };
    this.pending = undefined;
    this.misses = 0;
  }
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}
