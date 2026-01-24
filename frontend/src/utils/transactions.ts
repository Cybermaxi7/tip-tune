import { Horizon, TransactionBuilder, Asset, Operation, Memo, BASE_FEE } from '@stellar/stellar-sdk';
import type { Network } from '../types/wallet';
import { getNetworkPassphrase } from './stellar';

export interface PaymentParams {
  from: string;
  to: string;
  amount: string;
  asset?: Asset;
  memo?: string;
}

/**
 * Build a payment transaction
 */
export const buildPaymentTransaction = async (
  params: PaymentParams,
  network: Network = 'testnet'
): Promise<string> => {
  try {
    const server = new Horizon.Server(
      network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    // Load source account
    const sourceAccount = await server.loadAccount(params.from);

    // Create transaction builder
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(network),
    });

    // Add payment operation
    const asset = params.asset || Asset.native();
    transaction.addOperation(
      Operation.payment({
        destination: params.to,
        asset: asset,
        amount: params.amount,
      })
    );

    // Add memo if provided
    if (params.memo) {
      transaction.addMemo(Memo.text(params.memo));
    }

    // Set timeout (5 minutes)
    transaction.setTimeout(300);

    // Build transaction
    const builtTransaction = transaction.build();

    // Return XDR string
    return builtTransaction.toXDR();
  } catch (error) {
    throw new Error(
      `Failed to build transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Submit a signed transaction to the network
 */
export const submitTransaction = async (
  signedXdr: string,
  network: Network = 'testnet'
): Promise<Horizon.HorizonApi.SubmitTransactionResponse> => {
  try {
    const server = new Horizon.Server(
      network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    const transaction = TransactionBuilder.fromXDR(
      signedXdr,
      getNetworkPassphrase(network)
    );

    return await server.submitTransaction(transaction);
  } catch (error) {
    // Check if it's a Horizon error (rudimentary check if type isn't available)
    if (error && typeof error === 'object' && 'response' in error) {
        const horizonError = error as any;
        if (horizonError.response?.extras?.result_codes?.transaction) {
             throw new Error(
                `Transaction failed: ${horizonError.response.extras.result_codes.transaction}`
              );
        }
    }
    
    throw new Error(
      `Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
