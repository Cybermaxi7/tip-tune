import { Horizon, Networks, Keypair } from '@stellar/stellar-sdk';
import type { Network } from '../types/wallet';

export const getServer = (network: Network = 'testnet') => {
  switch (network) {
    case 'testnet':
      return new Horizon.Server('https://horizon-testnet.stellar.org');
    case 'mainnet':
      return new Horizon.Server('https://horizon.stellar.org');
    case 'futurenet':
      return new Horizon.Server('https://horizon-futurenet.stellar.org');
    case 'local':
      return new Horizon.Server('http://localhost:8000');
    default:
      return new Horizon.Server('https://horizon-testnet.stellar.org');
  }
};

export const getNetworkPassphrase = (network: Network = 'testnet'): string => {
  switch (network) {
    case 'testnet':
      return Networks.TESTNET;
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'local':
      return 'Local Network ; 2024';
    default:
      return Networks.TESTNET;
  }
};

export const isValidStellarAddress = (address: string): boolean => {
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
};

export const formatStellarAmount = (amount: string | number): string => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numAmount.toFixed(7);
};

export const truncateAddress = (address: string, startChars = 4, endChars = 4): string => {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

export const parseBalance = (balance: string): number => {
  return parseFloat(balance);
};
