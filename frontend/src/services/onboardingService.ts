import type { OnboardingData } from "../types/onboarding";
import { analytics } from "@/types/analytics";

const STORAGE_KEY = "tiptune_onboarding_draft";

export type OnboardingSubmissionResult =
  | { success: true; data: OnboardingData }
  | { success: false; error: string; recoverable: boolean };

export type WalletVerificationResult =
  | { success: true; publicKey: string; network: string }
  | { success: false; error: string; recoverable: boolean };

export type OnboardingStepType =
  | "welcome"
  | "profile"
  | "wallet"
  | "upload"
  | "promotion"
  | "complete";

/**
 * Service layer for onboarding operations.
 * Separates draft management, wallet verification, and submission logic
 * from UI components.
 */
export const onboardingService = {
  // ==================== Draft Management ====================

  loadDraft(): OnboardingData | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      return JSON.parse(saved) as OnboardingData;
    } catch {
      return null;
    }
  },

  saveDraft(data: OnboardingData): void {
    try {
      const serializable = {
        ...data,
        profile: {
          ...data.profile,
          profilePicture: null, // File objects can't be serialized
        },
        track: {
          ...data.track,
          file: null,
          coverArt: null,
        },
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      analytics.onboardingDraftSaved(String(data.currentStep));
    } catch (error) {
      console.error("Failed to save onboarding draft:", error);
    }
  },

  clearDraft(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear onboarding draft:", error);
    }
  },

  hasDraft(): boolean {
    return !!localStorage.getItem(STORAGE_KEY);
  },

  // ==================== Wallet Verification ====================

  /**
   * Verifies wallet connection through adapter pattern.
   * Currently uses a staged local adapter for development.
   * Replace with real Freighter/Albedo SDK integration.
   */
  async verifyWalletConnection(
    walletType: "freighter" | "albedo",
  ): Promise<WalletVerificationResult> {
    try {
      // Simulate wallet connection delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Mock public key generation (replace with actual SDK call)
      const mockPublicKey = `GBDV${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}...MOCK${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

      const result: WalletVerificationResult = {
        success: true,
        publicKey: mockPublicKey,
        network: "testnet",
      };

      analytics.walletConnected("testnet");
      return result;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect wallet",
        recoverable: true,
      };
    }
  },

  // ==================== Submission ====================

  /**
   * Submits completed onboarding data.
   * Uses staged adapter for local development.
   */
  async submitOnboarding(
    data: OnboardingData,
  ): Promise<OnboardingSubmissionResult> {
    try {
      // Validate required fields
      if (!data.profile.name || !data.profile.bio) {
        return {
          success: false,
          error: "Profile information is incomplete",
          recoverable: true,
        };
      }

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock submission (replace with actual API call)
      analytics.onboardingCompleted(String(data.currentStep));

      // Clear draft after successful submission
      this.clearDraft();

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Submission failed. Your progress has been saved.",
        recoverable: true,
      };
    }
  },

  // ==================== Step Navigation ====================

  calculateProgress(data: OnboardingData): number {
    const totalSteps = 6; // welcome, profile, wallet, upload, promotion, complete
    return Math.round((data.completedSteps.length / totalSteps) * 100);
  },

  canProceedToNextStep(data: OnboardingData, currentStep: number): boolean {
    switch (currentStep) {
      case 0: // welcome
        return true;
      case 1: // profile
        return !!(data.profile.name && data.profile.bio);
      case 2: // wallet
        return true; // wallet is skippable
      case 3: // upload
        return true; // upload is skippable
      case 4: // promotion
        return true;
      default:
        return false;
    }
  },
};
