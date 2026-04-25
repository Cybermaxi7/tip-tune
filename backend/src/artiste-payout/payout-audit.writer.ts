import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, QueryRunner } from "typeorm";
import {
  ArtistBalanceAudit,
  ArtistBalanceAuditType,
} from "./artist-balance-audit.entity";

export interface AuditWriteParams {
  artistId: string;
  assetCode: "XLM" | "USDC";
  eventType: ArtistBalanceAuditType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  pendingBefore: number;
  pendingAfter: number;
  payoutRequestId?: string;
  tipId?: string;
}

/**
 * Transaction-aware audit writer for payout balance mutations.
 *
 * Pass the active `QueryRunner` so the audit row participates in the same
 * DB transaction as the balance mutation. If the transaction rolls back,
 * the audit row rolls back with it — no audit drift.
 *
 * Omit `qr` only for stand-alone writes that are not paired with a
 * balance change (auto-commit mode).
 */
@Injectable()
export class PayoutAuditWriter {
  constructor(
    @InjectRepository(ArtistBalanceAudit)
    private readonly auditRepo: Repository<ArtistBalanceAudit>,
  ) {}

  private repo(qr?: QueryRunner): Repository<ArtistBalanceAudit> {
    return qr
      ? qr.manager.getRepository(ArtistBalanceAudit)
      : this.auditRepo;
  }

  async write(params: AuditWriteParams, qr?: QueryRunner): Promise<ArtistBalanceAudit> {
    const repo = this.repo(qr);
    const audit = repo.create({
      artistId: params.artistId,
      assetCode: params.assetCode,
      eventType: params.eventType,
      amount: params.amount,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      pendingBefore: params.pendingBefore,
      pendingAfter: params.pendingAfter,
      payoutRequestId: params.payoutRequestId,
      tipId: params.tipId,
    });
    return repo.save(audit);
  }

  async writeTipCredit(
    artistId: string,
    assetCode: "XLM" | "USDC",
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    pendingBefore: number,
    pendingAfter: number,
    tipId: string,
    qr?: QueryRunner,
  ): Promise<ArtistBalanceAudit> {
    return this.write(
      {
        artistId,
        assetCode,
        eventType: ArtistBalanceAuditType.TIP_CREDIT,
        amount,
        balanceBefore,
        balanceAfter,
        pendingBefore,
        pendingAfter,
        tipId,
      },
      qr,
    );
  }

  async writePayoutRequest(
    artistId: string,
    assetCode: "XLM" | "USDC",
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    pendingBefore: number,
    pendingAfter: number,
    payoutRequestId: string,
    qr?: QueryRunner,
  ): Promise<ArtistBalanceAudit> {
    return this.write(
      {
        artistId,
        assetCode,
        eventType: ArtistBalanceAuditType.PAYOUT_REQUEST,
        amount,
        balanceBefore,
        balanceAfter,
        pendingBefore,
        pendingAfter,
        payoutRequestId,
      },
      qr,
    );
  }

  async writePayoutCompleted(
    artistId: string,
    assetCode: "XLM" | "USDC",
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    pendingBefore: number,
    pendingAfter: number,
    payoutRequestId: string,
    qr?: QueryRunner,
  ): Promise<ArtistBalanceAudit> {
    return this.write(
      {
        artistId,
        assetCode,
        eventType: ArtistBalanceAuditType.PAYOUT_COMPLETED,
        amount,
        balanceBefore,
        balanceAfter,
        pendingBefore,
        pendingAfter,
        payoutRequestId,
      },
      qr,
    );
  }

  async writePayoutFailed(
    artistId: string,
    assetCode: "XLM" | "USDC",
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    pendingBefore: number,
    pendingAfter: number,
    payoutRequestId: string,
    qr?: QueryRunner,
  ): Promise<ArtistBalanceAudit> {
    return this.write(
      {
        artistId,
        assetCode,
        eventType: ArtistBalanceAuditType.PAYOUT_FAILED,
        amount,
        balanceBefore,
        balanceAfter,
        pendingBefore,
        pendingAfter,
        payoutRequestId,
      },
      qr,
    );
  }
}
