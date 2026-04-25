import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, LessThan } from "typeorm";
import {
  ScheduledRelease,
  ReleaseStatus,
} from "./entities/scheduled-release.entity";

/** How long (ms) a claim lease is held before another worker may steal it. */
const LEASE_TTL_MS = 60_000; // 1 minute

/**
 * Provides exactly-once claim semantics for scheduled-release publication.
 *
 * Uses a single `UPDATE … WHERE claimedBy IS NULL (OR claimExpiresAt < NOW)`
 * conditional update so only one worker wins the race — no advisory locks or
 * external services required.
 */
@Injectable()
export class ScheduledReleaseLockService {
  private readonly logger = new Logger(ScheduledReleaseLockService.name);

  constructor(
    @InjectRepository(ScheduledRelease)
    private readonly repo: Repository<ScheduledRelease>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Attempt to claim `releaseId` for `workerId`.
   *
   * Returns `true` when this worker won the lease, `false` when another
   * worker already holds a valid lease.
   *
   * The claim is granted only when:
   * - `claimedBy` is NULL (never claimed), OR
   * - `claimExpiresAt` is in the past (previous lease expired).
   *
   * The status is atomically moved to PUBLISHING on success.
   */
  async claimRelease(releaseId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);

    const result = await this.dataSource
      .createQueryBuilder()
      .update(ScheduledRelease)
      .set({
        claimedBy: workerId,
        claimExpiresAt: expiresAt,
        status: ReleaseStatus.PUBLISHING,
        lastAttemptAt: now,
      })
      .where("id = :id", { id: releaseId })
      .andWhere("status = :status", { status: ReleaseStatus.PENDING })
      .andWhere(
        "(claimedBy IS NULL OR claimExpiresAt < :now)",
        { now },
      )
      .execute();

    const claimed = (result.affected ?? 0) > 0;
    if (claimed) {
      this.logger.debug(`Worker ${workerId} claimed release ${releaseId}`);
    }
    return claimed;
  }

  /**
   * Release the claim after successful or permanently-failed publication.
   * Clears the lease fields and sets the terminal status.
   */
  async releaseClaim(
    releaseId: string,
    workerId: string,
    terminalStatus: ReleaseStatus.PUBLISHED | ReleaseStatus.FAILED_PERMANENTLY,
    extra: Partial<ScheduledRelease> = {},
  ): Promise<void> {
    await this.repo.update(
      { id: releaseId, claimedBy: workerId },
      {
        claimedBy: null,
        claimExpiresAt: null,
        status: terminalStatus,
        ...extra,
      },
    );
  }

  /**
   * Reset stale leases so they become claimable again.
   *
   * Call periodically (e.g. every 30 s) to recover from workers that died
   * mid-publication without releasing their lease.
   */
  async releaseExpiredLeases(): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(ScheduledRelease)
      .set({
        claimedBy: null,
        claimExpiresAt: null,
        status: ReleaseStatus.PENDING,
      })
      .where("status = :status", { status: ReleaseStatus.PUBLISHING })
      .andWhere("claimExpiresAt < :now", { now: new Date() })
      .execute();

    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.warn(`Reset ${count} expired release lease(s)`);
    }
    return count;
  }
}
