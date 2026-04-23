import { Injectable, Logger } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { DataSource } from 'typeorm';

export enum RewardType {
  XLM = 'XLM',
  BADGE = 'BADGE',
}

@Injectable()
export class RewardDispatcherService {
  private readonly logger = new Logger(RewardDispatcherService.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly dataSource: DataSource,
  ) {}

  async dispatch(userId: string, reward: { type: string; value: number }): Promise<void> {
    this.logger.log(`Dispatching reward for user ${userId}: ${reward.type} = ${reward.value}`);

    // Idempotency check should be handled by the caller (ReferralService) by marking claimed first.
    // However, we can add an extra audit log here.
    
    try {
      if (reward.type === 'XLM') {
        // In a real app, you'd send a payment
        // await this.stellarService.sendMultiRecipientPayment([{ destination: userWallet, amount: reward.value.toString() }], `reward:${userId}`);
        this.logger.log(`[MOCK] Sent ${reward.value} XLM to user ${userId}`);
      } else if (reward.type === 'BADGE') {
        // await this.stellarService.mintBadge(userId, { name: 'Referral Hero' });
        this.logger.log(`[MOCK] Minted badge for user ${userId}`);
      }
      
      this.logger.log(`Reward successfully dispatched for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch reward for user ${userId}: ${error.message}`);
      throw error;
    }
  }
}
