export interface RetryPolicy {
  maxRetries: number;
  getDelayMs(attemptNumber: number): number;
  shouldRetry(attemptNumber: number, nextRetryAt: Date | null): boolean;
}

export class ScheduledReleaseRetryPolicy implements RetryPolicy {
  readonly maxRetries: number;
  private readonly backoffStrategy: 'exponential' | 'fixed';
  private readonly baseDelayMs: number;

  constructor(
    maxRetries: number = 3,
    baseDelayMs: number = 5000,
    backoffStrategy: 'exponential' | 'fixed' = 'fixed',
  ) {
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.backoffStrategy = backoffStrategy;
  }

  getDelayMs(attemptNumber: number): number {
    if (this.backoffStrategy === 'exponential') {
      return this.baseDelayMs * Math.pow(2, attemptNumber - 1);
    }
    return this.baseDelayMs;
  }

  shouldRetry(attemptNumber: number, nextRetryAt: Date | null): boolean {
    if (attemptNumber >= this.maxRetries) {
      return false;
    }

    if (!nextRetryAt) {
      return true;
    }

    const now = new Date();
    return nextRetryAt <= now;
  }

  getNextRetryTime(attemptNumber: number): Date {
    const delayMs = this.getDelayMs(attemptNumber);
    return new Date(Date.now() + delayMs);
  }
}
