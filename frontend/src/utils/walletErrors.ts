import { WalletErrorCode } from "../types/wallet";

// ==================== Error Classification ====================

export type WalletErrorCategory =
  | "user_rejected"
  | "wallet_locked"
  | "wallet_not_installed"
  | "network_error"
  | "timeout"
  | "insufficient_funds"
  | "invalid_request"
  | "unknown";

export interface WalletErrorInfo {
  category: WalletErrorCategory;
  code: WalletErrorCode | string;
  message: string;
  userMessage: string;
  recoverable: boolean;
  action?: {
    label: string;
    handler?: () => void | Promise<void>;
    link?: string;
  };
  technicalDetails?: string;
}

// ==================== Error Classification Map ====================

const ERROR_PATTERNS: Record<string, WalletErrorCategory> = {
  // User rejected errors
  "user_rejected": "user_rejected",
  "rejected": "user_rejected",
  "denied": "user_rejected",
  "cancelled": "user_rejected",
  "canceled": "user_rejected",

  // Wallet locked errors
  "locked": "wallet_locked",
  "unlock": "wallet_locked",

  // Not installed errors
  "not_installed": "wallet_not_installed",
  "not installed": "wallet_not_installed",
  "freighter": "wallet_not_installed",
  "extension not found": "wallet_not_installed",

  // Network errors
  "network": "network_error",
  "connection": "network_error",
  "timeout": "timeout",
  "unreachable": "network_error",

  // Insufficient funds
  "insufficient": "insufficient_funds",
  "balance": "insufficient_funds",
  "funds": "insufficient_funds",

  // Invalid request
  "invalid": "invalid_request",
  "malformed": "invalid_request",
};

// ==================== Error Resolution Database ====================

const ERROR_RESOLUTIONS: Record<
  WalletErrorCategory,
  Omit<WalletErrorInfo, "code" | "message">
> = {
  user_rejected: {
    category: "user_rejected",
    userMessage: "Connection request was denied. You can try again when ready.",
    recoverable: true,
    action: {
      label: "Try Again",
    },
    technicalDetails: "User explicitly rejected the wallet connection request",
  },
  wallet_locked: {
    category: "wallet_locked",
    userMessage:
      "Your wallet is locked. Please unlock Freighter and try connecting again.",
    recoverable: true,
    action: {
      label: "Unlock Wallet",
      link: "https://freighter.app",
    },
    technicalDetails: "Wallet extension is locked and requires authentication",
  },
  wallet_not_installed: {
    category: "wallet_not_installed",
    userMessage:
      "Freighter wallet is not installed. Please install it to continue.",
    recoverable: false,
    action: {
      label: "Install Freighter",
      link: "https://freighter.app",
    },
    technicalDetails: "Wallet extension is not detected in the browser",
  },
  network_error: {
    category: "network_error",
    userMessage:
      "Network connection failed. Please check your internet connection and try again.",
    recoverable: true,
    action: {
      label: "Retry Connection",
    },
    technicalDetails: "Failed to establish network connection to wallet or blockchain",
  },
  timeout: {
    category: "timeout",
    userMessage:
      "Connection timed out. The wallet took too long to respond. Please try again.",
    recoverable: true,
    action: {
      label: "Try Again",
    },
    technicalDetails: "Wallet connection request exceeded timeout threshold",
  },
  insufficient_funds: {
    category: "insufficient_funds",
    userMessage:
      "Insufficient funds in your wallet to complete this transaction.",
    recoverable: false,
    action: {
      label: "Add Funds",
      link: "https://stellar.org/use-wallet",
    },
    technicalDetails: "Wallet balance is insufficient for transaction requirements",
  },
  invalid_request: {
    category: "invalid_request",
    userMessage: "Invalid request format. Please try again or contact support.",
    recoverable: false,
    action: {
      label: "Contact Support",
      link: "mailto:support@tiptune.com",
    },
    technicalDetails: "Request parameters are malformed or invalid",
  },
  unknown: {
    category: "unknown",
    userMessage: "An unexpected error occurred. Please try again.",
    recoverable: true,
    action: {
      label: "Try Again",
    },
    technicalDetails: "Unclassified error occurred during wallet operation",
  },
};

// ==================== Error Classification Functions ====================

/**
 * Classifies a wallet error into a specific category
 */
export function classifyWalletError(error: Error | unknown): WalletErrorCategory {
  if (!error) return "unknown";

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  for (const [pattern, category] of Object.entries(ERROR_PATTERNS)) {
    if (message.includes(pattern)) {
      return category;
    }
  }

  return "unknown";
}

/**
 * Gets detailed error information for user display
 */
export function getWalletErrorInfo(
  error: Error | unknown,
  code?: WalletErrorCode | string
): WalletErrorInfo {
  const category = classifyWalletError(error);
  const resolution = ERROR_RESOLUTIONS[category];

  const errorMessage =
    error instanceof Error ? error.message : String(error);

  return {
    ...resolution,
    code: code || category,
    message: errorMessage,
    action: {
      ...resolution.action!,
    },
  };
}

/**
 * Gets user-friendly error message
 */
export function getUserFacingErrorMessage(error: Error | unknown): string {
  const info = getWalletErrorInfo(error);
  return info.userMessage;
}

/**
 * Determines if an error is recoverable
 */
export function isWalletErrorRecoverable(error: Error | unknown): boolean {
  const info = getWalletErrorInfo(error);
  return info.recoverable;
}

/**
 * Gets the appropriate action for an error
 */
export function getWalletErrorAction(
  error: Error | unknown
): WalletErrorInfo["action"] | undefined {
  const info = getWalletErrorInfo(error);
  return info.action;
}

// ==================== Specific Error Constructors ====================

/**
 * Creates a standardized wallet error
 */
export function createWalletError(
  code: WalletErrorCode,
  message: string,
  originalError?: unknown
): Error {
  const error = new Error(message);
  error.name = "WalletError";
  (error as any).code = code;
  (error as any).originalError = originalError;
  return error;
}

/**
 * Creates a timeout error
 */
export function createTimeoutError(timeoutMs: number): Error {
  return createWalletError(
    WalletErrorCode.NETWORK_ERROR,
    `Connection timed out after ${timeoutMs}ms`
  );
}

/**
 * Creates a not installed error
 */
export function createNotInstalledError(): Error {
  return createWalletError(
    WalletErrorCode.NOT_INSTALLED,
    "Freighter wallet is not installed"
  );
}

/**
 * Creates a user rejected error
 */
export function createUserRejectedError(): Error {
  return createWalletError(
    WalletErrorCode.USER_REJECTED,
    "User rejected the connection request"
  );
}

/**
 * Creates a locked wallet error
 */
export function createLockedWalletError(): Error {
  return createWalletError(
    WalletErrorCode.LOCKED,
    "Wallet is locked. Please unlock and try again"
  );
}
