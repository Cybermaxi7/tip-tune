import * as StellarSdk from "@stellar/stellar-sdk";

export interface IStellarReadProvider {
  verifyTransaction(
    txHash: string,
    amount: string,
    recipientId: string,
    assetCode?: string,
    assetIssuer?: string,
  ): Promise<boolean>;
  getTransactionDetails(txHash: string): Promise<any>;
  getConversionRate(
    fromAssetCode: string,
    fromAssetIssuer: string | null,
    toAssetCode: string,
    toAssetIssuer: string | null,
    amount: number,
  ): Promise<{ rate: number; estimatedAmount: any }>;
}

export interface IStellarWriteProvider {
  sendMultiRecipientPayment(
    recipients: { destination: string; amount: string }[],
    sourceTxRef: string,
  ): Promise<string>;
}

export interface IStellarMintProvider {
  mintBadge(userId: string, badge: any): Promise<string | null>;
}
