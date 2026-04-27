import { analytics } from "@/types/analytics";

// ==================== Types ====================

export type ThemeMode = "dark" | "light" | "system";

export interface DisplaySettings {
  theme: ThemeMode;
  compactMode: boolean;
  showAnimations: boolean;
  highContrast: boolean;
  oledDark: boolean;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  tipNotifications: boolean;
  followNotifications: boolean;
  commentNotifications: boolean;
}

export interface PrivacySettings {
  profileVisibility: "public" | "private" | "followers";
  showTipHistory: boolean;
  showPlayHistory: boolean;
  allowMessages: boolean;
}

export interface ProfileSettings {
  username: string;
  bio: string;
  profileImage: string | null;
}

export interface UserSettings {
  display: DisplaySettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  profile: ProfileSettings;
}

export type SettingsSection = keyof UserSettings;

export interface SettingsState {
  settings: UserSettings;
  originalSettings: UserSettings;
  isDirty: boolean;
  isSynced: boolean;
  isLoading: boolean;
  lastSaved: Date | null;
}

// ==================== Default Values ====================

const defaultDisplaySettings: DisplaySettings = {
  theme: "system",
  compactMode: false,
  showAnimations: true,
  highContrast: false,
  oledDark: false,
};

const defaultNotificationSettings: NotificationSettings = {
  emailNotifications: true,
  pushNotifications: true,
  tipNotifications: true,
  followNotifications: true,
  commentNotifications: true,
};

const defaultPrivacySettings: PrivacySettings = {
  profileVisibility: "public",
  showTipHistory: true,
  showPlayHistory: true,
  allowMessages: true,
};

const defaultProfileSettings: ProfileSettings = {
  username: "",
  bio: "",
  profileImage: null,
};

const defaultSettings: UserSettings = {
  display: defaultDisplaySettings,
  notifications: defaultNotificationSettings,
  privacy: defaultPrivacySettings,
  profile: defaultProfileSettings,
};

// ==================== Local Storage Keys ====================

const STORAGE_KEYS = {
  display: "tiptune.settings.display.v1",
  notifications: "tiptune.settings.notifications.v1",
  privacy: "tiptune.settings.privacy.v1",
  profile: "tiptune.settings.profile.v1",
};

// ==================== Serialization Helpers ====================

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    return { ...defaultValue, ...JSON.parse(saved) };
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save settings to ${key}:`, error);
  }
}

// ==================== Settings Store ====================

class SettingsStore {
  private state: SettingsState;
  private listeners: Set<() => void>;

  constructor() {
    this.state = {
      settings: this.loadAllSettings(),
      originalSettings: this.loadAllSettings(),
      isDirty: false,
      isSynced: false,
      isLoading: false,
      lastSaved: null,
    };
    this.listeners = new Set();
  }

  // ==================== State Access ====================

  getState(): SettingsState {
    return { ...this.state };
  }

  getSettings(): UserSettings {
    return this.state.settings;
  }

  getSection<K extends SettingsSection>(section: K): UserSettings[K] {
    return this.state.settings[section];
  }

  isSectionDirty<K extends SettingsSection>(section: K): boolean {
    return (
      JSON.stringify(this.state.settings[section]) !==
      JSON.stringify(this.state.originalSettings[section])
    );
  }

  // ==================== State Mutations ====================

  updateSection<K extends SettingsSection>(
    section: K,
    updates: Partial<UserSettings[K]>
  ): void {
    const currentSection = this.state.settings[section];
    const updatedSection = { ...currentSection, ...updates };

    this.setState({
      settings: {
        ...this.state.settings,
        [section]: updatedSection,
      },
      isDirty: true,
    });

    // Auto-save to local storage
    this.saveSectionToStorage(section, updatedSection);
  }

  updateSettings(updates: Partial<UserSettings>): void {
    const updatedSettings = { ...this.state.settings, ...updates };

    this.setState({
      settings: updatedSettings,
      isDirty: true,
    });

    // Auto-save all updated sections to local storage
    Object.keys(updates).forEach((key) => {
      const section = key as SettingsSection;
      this.saveSectionToStorage(section, updatedSettings[section]);
    });
  }

  async save(): Promise<boolean> {
    this.setState({ isLoading: true });

    try {
      // In the future, this will sync to backend
      // For now, local storage is already updated via updateSection
      // Simulate eventual remote sync
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.setState({
        originalSettings: { ...this.state.settings },
        isDirty: false,
        isSynced: true,
        lastSaved: new Date(),
        isLoading: false,
      });

      console.log("Settings saved successfully");
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      this.setState({
        isSynced: false,
        isLoading: false,
      });
      return false;
    }
  }

  rollback(): void {
    this.setState({
      settings: { ...this.state.originalSettings },
      isDirty: false,
    });

    // Restore local storage from original settings
    this.saveAllToStorage(this.state.originalSettings);
  }

  rollbackSection<K extends SettingsSection>(section: K): void {
    const originalSection = this.state.originalSettings[section];

    this.setState({
      settings: {
        ...this.state.settings,
        [section]: originalSection,
      },
    });

    this.saveSectionToStorage(section, originalSection);
  }

  // ==================== Remote Sync (Future) ====================

  async syncFromRemote(remoteSettings: Partial<UserSettings>): Promise<void> {
    const merged = {
      ...this.state.settings,
      ...remoteSettings,
    };

    this.setState({
      settings: merged,
      originalSettings: merged,
      isDirty: false,
      isSynced: true,
      lastSaved: new Date(),
    });

    this.saveAllToStorage(merged);
  }

  // ==================== Offline Mode ====================

  isOffline(): boolean {
    return !navigator.onLine;
  }

  async saveWhenOnline(): Promise<boolean> {
    if (this.isOffline()) {
      // Wait for online status
      return new Promise((resolve) => {
        const handler = async () => {
          window.removeEventListener("online", handler);
          const result = await this.save();
          resolve(result);
        };
        window.addEventListener("online", handler);
      });
    }

    return this.save();
  }

  // ==================== Persistence ====================

  private loadAllSettings(): UserSettings {
    return {
      display: loadFromStorage(STORAGE_KEYS.display, defaultDisplaySettings),
      notifications: loadFromStorage(
        STORAGE_KEYS.notifications,
        defaultNotificationSettings
      ),
      privacy: loadFromStorage(STORAGE_KEYS.privacy, defaultPrivacySettings),
      profile: loadFromStorage(STORAGE_KEYS.profile, defaultProfileSettings),
    };
  }

  private saveSectionToStorage<K extends SettingsSection>(
    section: K,
    data: UserSettings[K]
  ): void {
    const key = STORAGE_KEYS[section];
    saveToStorage(key, data);
  }

  private saveAllToStorage(settings: UserSettings): void {
    (Object.keys(settings) as SettingsSection[]).forEach((section) => {
      this.saveSectionToStorage(section, settings[section]);
    });
  }

  // ==================== Reactivity ====================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(updates: Partial<SettingsState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// ==================== Singleton Export ====================

export const settingsStore = new SettingsStore();
