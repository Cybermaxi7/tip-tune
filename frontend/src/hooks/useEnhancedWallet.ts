import { useWallet as useOriginalWallet } from "./useWallet";
import type { WalletConnectionState } from "../types/wallet";
import { WalletStateManager } from "../utils/walletState";
import {
  classifyWalletError,
  getWalletErrorInfo,
  getUserFacingErrorMessage,
  isWalletErrorRecoverable,
  type WalletErrorCategory,
} from "../utils/walletErrors";

/**
 * Enhanced wallet hook that provides consistent state management
 * across all wallet components with proper UX affordances.
 */
export const useEnhancedWallet = () => {
    const originalWallet = useOriginalWallet();

    // Derive connection state from original wallet properties
    const connectionState: WalletConnectionState = originalWallet.isConnecting
        ? "connecting"
        : originalWallet.isConnected
          ? "connected"
          : originalWallet.error
            ? WalletStateManager.getConnectionStatus(
                  originalWallet.isConnected,
                  originalWallet.isConnecting,
                  originalWallet.error,
              ).state
            : "disconnected";

    // Get classified error information
    const errorCategory: WalletErrorCategory = originalWallet.error
        ? classifyWalletError(new Error(originalWallet.error))
        : "unknown";

    const errorInfo = originalWallet.error
        ? getWalletErrorInfo(new Error(originalWallet.error))
        : null;

    const getConnectionMessage = (): string => {
        if (originalWallet.isConnecting) return "Connecting to wallet...";
        if (originalWallet.isConnected) return "Wallet connected successfully";
        if (originalWallet.error) {
            return getUserFacingErrorMessage(new Error(originalWallet.error));
        }
        return "Connect your wallet to get started";
    };

    const canRetry = (): boolean => {
        if (!originalWallet.error) return false;
        return isWalletErrorRecoverable(new Error(originalWallet.error));
    };

    const getStateIcon = (): string => {
        return WalletStateManager.getStateIcon(connectionState);
    };

    const getStateColor = (): string => {
        return WalletStateManager.getStateColor(connectionState);
    };

    const getErrorSolutions = () => {
        if (!originalWallet.error) {
            return WalletStateManager.getErrorSolutions(connectionState);
        }
        const info = getWalletErrorInfo(new Error(originalWallet.error));
        return {
            primary: info.action?.label || "Try Again",
            secondary: info.userMessage,
            installUrl: info.action?.link,
        };
    };

    const retryConnection = async () => {
        if (canRetry()) {
            await originalWallet.connect();
        }
    };

    const clearError = () => {
        // Error state is managed by the base wallet hook
        // This method triggers a reconnection attempt which clears errors
        if (originalWallet.error && !originalWallet.isConnected) {
            // The base wallet will clear error on next connection attempt
        }
    };

    return {
        ...originalWallet,
        connectionState,
        errorCategory,
        errorInfo,
        getConnectionMessage,
        canRetry,
        getStateIcon,
        getStateColor,
        getErrorSolutions,
        retryConnection,
        clearError,
    };
};

/**
 * Hook for getting wallet connection status with retry affordances
 */
export const useWalletConnectionStatus = () => {
    const wallet = useEnhancedWallet();

    return {
        getConnectionState: () => wallet.connectionState,
        getConnectionMessage: wallet.getConnectionMessage,
        canRetry: wallet.canRetry,
        getRetryAction: wallet.canRetry() ? wallet.retryConnection : undefined,
        getStateIcon: wallet.getStateIcon,
        getStateColor: wallet.getStateColor,
        getErrorSolutions: wallet.getErrorSolutions,
        retryConnection: wallet.retryConnection,
        clearError: wallet.clearError,
    };
};

/**
 * Hook for wallet connection actions with proper error handling
 */
export const useWalletActions = () => {
    const wallet = useEnhancedWallet();

    const connectWithRetry = async (): Promise<void> => {
        await wallet.connect();
    };

    const disconnectSafely = async (): Promise<void> => {
        try {
            await wallet.disconnect();
        } catch (error) {
            console.error("Failed to disconnect wallet:", error);
        }
    };

    const refreshWithFeedback = async (): Promise<void> => {
        try {
            await wallet.refreshBalance();
        } catch (error) {
            console.error("Failed to refresh balance:", error);
        }
    };

    return {
        connect: connectWithRetry,
        disconnect: disconnectSafely,
        refreshBalance: refreshWithFeedback,
        switchNetwork: wallet.switchNetwork,
        signTransaction: wallet.signTransaction,
    };
};
