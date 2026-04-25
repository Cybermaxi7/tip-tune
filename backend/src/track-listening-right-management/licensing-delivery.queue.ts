import { Injectable, Logger } from "@nestjs/common";

export type DeliveryType = "mail" | "notification";

export interface DeliveryJob {
  id: string;
  type: DeliveryType;
  referenceId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledAt: Date;
  exhausted: boolean;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

/**
 * In-process outbox for licensing mail and notification delivery.
 *
 * Keeps request creation synchronous while deferring external delivery
 * to a background retry loop. Failed deliveries are captured with retry
 * metadata instead of being silently dropped.
 *
 * Replace the `execute` method with a real queue (BullMQ, etc.) when
 * moving to a distributed deployment.
 */
@Injectable()
export class LicensingDeliveryQueue {
  private readonly logger = new Logger(LicensingDeliveryQueue.name);
  private readonly jobs = new Map<string, DeliveryJob>();
  private ticker: NodeJS.Timeout | null = null;

  onModuleInit() {
    this.ticker = setInterval(() => this.flush(), RETRY_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.ticker) clearInterval(this.ticker);
  }

  enqueue(
    type: DeliveryType,
    referenceId: string,
    payload: Record<string, unknown>,
  ): string {
    const id = `${type}:${referenceId}:${Date.now()}`;
    const job: DeliveryJob = {
      id,
      type,
      referenceId,
      payload,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      lastError: null,
      scheduledAt: new Date(),
      exhausted: false,
    };
    this.jobs.set(id, job);
    this.logger.debug(`Enqueued ${type} delivery for ${referenceId} [${id}]`);
    return id;
  }

  /** Retrieve a job by ID (useful in tests / observability). */
  getJob(id: string): DeliveryJob | undefined {
    return this.jobs.get(id);
  }

  /** All jobs, including exhausted ones. */
  allJobs(): DeliveryJob[] {
    return Array.from(this.jobs.values());
  }

  pendingJobs(): DeliveryJob[] {
    return this.allJobs().filter((j) => !j.exhausted && j.attempts < j.maxAttempts);
  }

  exhaustedJobs(): DeliveryJob[] {
    return this.allJobs().filter((j) => j.exhausted);
  }

  /**
   * Register a delivery executor. The executor receives each pending job
   * and should throw on failure so the queue can record the error and retry.
   */
  registerExecutor(
    executor: (job: DeliveryJob) => Promise<void>,
  ): void {
    this.executor = executor;
  }

  private executor: ((job: DeliveryJob) => Promise<void>) | null = null;

  async flush(): Promise<void> {
    if (!this.executor) return;
    for (const job of this.pendingJobs()) {
      try {
        job.attempts += 1;
        await this.executor(job);
        this.jobs.delete(job.id);
        this.logger.debug(`Delivered ${job.type} job ${job.id} (attempt ${job.attempts})`);
      } catch (err) {
        job.lastError = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Delivery failed for job ${job.id} (attempt ${job.attempts}/${job.maxAttempts}): ${job.lastError}`,
        );
        if (job.attempts >= job.maxAttempts) {
          job.exhausted = true;
          this.logger.error(
            `Job ${job.id} exhausted after ${job.maxAttempts} attempts — manual replay required`,
          );
        }
      }
    }
  }
}
