import { useState, useEffect, useCallback, useRef } from "react";
import type { OnboardingData } from "../types/onboarding";
import { analytics } from "@/types/analytics";
import { onboardingService } from "@/services/onboardingService";

const initialData: OnboardingData = {
  currentStep: 0,
  completedSteps: [],
  profile: {
    name: "",
    bio: "",
    genre: [],
    profilePicture: null,
    profilePictureUrl: "",
  },
  wallet: {
    connected: false,
    publicKey: "",
    network: "testnet",
  },
  track: {
    file: null,
    title: "",
    description: "",
    coverArt: null,
    coverArtUrl: "",
    previewUrl: "",
  },
  checklist: {
    profile_complete: false,
    wallet_connected: false,
    track_uploaded: false,
    social_shared: false,
    bio_written: false,
  },
  startedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
};

export function useOnboardingPersistence() {
  const [data, setDataInternal] = useState<OnboardingData>(() => {
    const saved = onboardingService.loadDraft();
    return saved ? { ...initialData, ...saved } : initialData;
  });

  const stepStartTime = useRef<number>(Date.now());

  const setData = useCallback(
    (
      updater:
        | Partial<OnboardingData>
        | ((prev: OnboardingData) => OnboardingData),
    ) => {
      setDataInternal((prev) => {
        const next =
          typeof updater === "function"
            ? updater(prev)
            : { ...prev, ...updater, lastUpdated: new Date().toISOString() };
        return { ...next, lastUpdated: new Date().toISOString() };
      });
    },
    [],
  );

  // Auto-save to localStorage via service
  useEffect(() => {
    onboardingService.saveDraft(data);
  }, [data]);

  const saveDraft = useCallback(() => {
    onboardingService.saveDraft(data);
  }, [data]);

  const clearDraft = useCallback(() => {
    onboardingService.clearDraft();
  }, []);

  const hasDraft = useCallback(() => {
    return onboardingService.hasDraft();
  }, []);

  const goToStep = useCallback(
    (stepIndex: number) => {
      const elapsed = Date.now() - stepStartTime.current;
      analytics.onboardingStepCompleted(
        String(data.currentStep),
        data.currentStep,
        elapsed,
      );
      stepStartTime.current = Date.now();
      analytics.onboardingStepViewed(String(stepIndex), stepIndex);
      setData((prev) => ({
        ...prev,
        currentStep: stepIndex,
        completedSteps: prev.completedSteps.includes(prev.currentStep)
          ? prev.completedSteps
          : [...prev.completedSteps, prev.currentStep],
      }));
    },
    [data.currentStep, setData],
  );

  const markStepComplete = useCallback(
    (stepIndex: number) => {
      setData((prev) => ({
        ...prev,
        completedSteps: prev.completedSteps.includes(stepIndex)
          ? prev.completedSteps
          : [...prev.completedSteps, stepIndex],
      }));
    },
    [setData],
  );

  return {
    data,
    setData,
    saveDraft,
    clearDraft,
    hasDraft,
    goToStep,
    markStepComplete,
    stepStartTime,
  };
}
