import { Injectable, Logger } from "@nestjs/common";
import { IStellarMintProvider, IStellarReadProvider, IStellarWriteProvider } from "./stellar-provider.interface";

@Injectable()
export class MockStellarService implements IStellarReadProvider, IStellarWriteProvider, IStellarMintProvider {
  private readonly logger = new Logger(MockStellarService.name);

  async verifyTransaction(): Promise<boolean> {
    return true;
  }

  async getTransactionDetails(): Promise<any> {
    return { successful: true, created_at: new Date().toISOString(), operations: () => Promise.resolve({ records: [] }) };
  }

  async getConversionRate() {
    return { rate: 1, estimatedAmount: "1" };
  }

  async sendMultiRecipientPayment(): Promise<string> {
    return "mock_tx_hash_" + Date.now();
  }

  async mintBadge(userId: string, badge: any): Promise<string | null> {
    this.logger.log(`[MOCK] Minting badge ${badge.name} for user ${userId}`);
    return "mock_mint_hash_" + Date.now();
  }
}
