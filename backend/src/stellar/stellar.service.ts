import { ConfigService } from "@nestjs/config";
import * as StellarSdk from "@stellar/stellar-sdk";
import { IStellarMintProvider, IStellarReadProvider, IStellarWriteProvider } from "./stellar-provider.interface";

@Injectable()
export class StellarService implements IStellarReadProvider, IStellarWriteProvider, IStellarMintProvider {
  private server: StellarSdk.Horizon.Server;
  private readonly logger = new Logger(StellarService.name);

  constructor(private configService: ConfigService) {
    const network = this.configService.get<string>(
      "STELLAR_NETWORK",
      "testnet",
    );
    const horizonUrl =
      network === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org";

    this.server = new StellarSdk.Horizon.Server(horizonUrl);
  }

  async verifyTransaction(
    txHash: string,
    amount: string,
    recipientId: string,
    assetCode: string = "XLM",
    assetIssuer?: string,
  ): Promise<boolean> {
    try {
      const tx = await this.server.transactions().transaction(txHash).call();

      if (!tx.successful) {
        this.logger.warn(`Transaction ${txHash} was not successful`);
        return false;
      }

      // Check if the transaction is recent (optional, but good practice to prevent replay of old txs)
      // For now, we rely on the database uniqueness constraint on txHash.

      // We need to inspect operations to ensure the correct amount was sent to the correct recipient
      const operations = await tx.operations();

      const paymentOp = operations.records.find((op: any) => {
        // Check type and basic fields
        const isPayment =
          op.type === "payment" ||
          op.type === "path_payment_strict_send" ||
          op.type === "path_payment_strict_receive";
        if (!isPayment || op.to !== recipientId) return false;

        // Check amount
        if (op.amount !== amount) return false;

        // Check asset
        if (assetCode === "XLM" || assetCode === "native") {
          return op.asset_type === "native";
        } else {
          return (
            (op.asset_code === assetCode && op.asset_issuer === assetIssuer) ||
            // Handle path payments where 'to' asset matches
            (op.asset_code === undefined &&
              op.asset_type === "native" &&
              assetCode === "XLM") // Fallback for some structures
          );
        }
      });

      if (!paymentOp) {
        this.logger.warn(
          `Transaction ${txHash} does not contain a valid payment operation to ${recipientId} for ${amount} ${assetCode}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error verifying transaction ${txHash}: ${error.message}`,
      );
      return false;
    }
  }

  async getConversionRate(
    fromAssetCode: string,
    fromAssetIssuer: string | null,
    toAssetCode: string,
    toAssetIssuer: string | null,
    amount: number,
  ) {
    try {
      const fromAsset =
        fromAssetCode === "XLM"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(fromAssetCode, fromAssetIssuer!);

      const toAsset =
        toAssetCode === "XLM"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(toAssetCode, toAssetIssuer!);

      // Use strict send path to find how much destination asset we get for source amount
      const paths = await this.server
        .strictSendPaths(fromAsset, amount.toString(), [toAsset])
        .call();

      if (paths.records && paths.records.length > 0) {
        // Return the best path's destination amount
        return {
          rate: parseFloat(paths.records[0].destination_amount) / amount,
          estimatedAmount: paths.records[0].destination_amount,
        };
      }
      return { rate: 0, estimatedAmount: 0 };
    } catch (error) {
      this.logger.error(`Error fetching conversion rate: ${error.message}`);
      return { rate: 0, estimatedAmount: 0 };
    }
  }

  async getTransactionDetails(txHash: string) {
    try {
      const tx = await this.server.transactions().transaction(txHash).call();
      return tx;
    } catch (error) {
      this.logger.error(
        `Error fetching transaction ${txHash}: ${error.message}`,
      );
      throw error;
    }
  }

  async mintBadge(userId: string, badge: any): Promise<string | null> {
    this.logger.log(`Minting badge ${badge.name} for user ${userId}`);
    // Real implementation logic here...
    // Removed ad-hoc mock check.
    return null; 
  }

  async sendMultiRecipientPayment(
    recipients: { destination: string; amount: string }[],
    sourceTxRef: string,
  ): Promise<string> {
    // ✅ ADD this implementation:
    const sourceKeypair = StellarSdk.Keypair.fromSecret(
      this.configService.get<string>("STELLAR_PAYOUT_SECRET_KEY")!,
    );
    const sourceAccount = await this.server.loadAccount(
      sourceKeypair.publicKey(),
    );
    const networkPassphrase =
      this.configService.get<string>("STELLAR_NETWORK") === "mainnet"
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET;

    const txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase,
    });

    for (const recipient of recipients) {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: recipient.destination,
          asset: StellarSdk.Asset.native(),
          amount: recipient.amount,
        }),
      );
    }

    const tx = txBuilder
      .addMemo(StellarSdk.Memo.text(`dist:${sourceTxRef.substring(0, 15)}`))
      .setTimeout(30)
      .build();

    tx.sign(sourceKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }
}
