import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { UserRole } from '../shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  isSuperAdmin?: boolean;
}

export interface ActiveLab {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: AuthUser | null;
  lab: ActiveLab | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (user: AuthUser, lab: ActiveLab | null, tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  updateAccessToken: (token: string) => Promise<void>;
  updateRefreshToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
}

const ACCESS_TOKEN_KEY = 'ilab_access_token';
const REFRESH_TOKEN_KEY = 'ilab_refresh_token';
const USER_KEY = 'ilab_auth_user';
const LAB_KEY = 'ilab_auth_lab';

// Memory fallback cache across app lifecycle & re-renders
let memoryUser: AuthUser | null = null;
let memoryLab: ActiveLab | null = null;
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  lab: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  initAuth: async () => {
    // If already authenticated in memory, preserve it
    const currentState = get();
    if (currentState.isAuthenticated && currentState.user) {
      set({ isLoading: false });
      return;
    }

    try {
      const [accessToken, refreshToken, userJson, labJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY).catch(() => null),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null),
        SecureStore.getItemAsync(USER_KEY).catch(() => null),
        SecureStore.getItemAsync(LAB_KEY).catch(() => null),
      ]);

      if (userJson && (accessToken || refreshToken)) {
        const parsedUser = JSON.parse(userJson);
        const parsedLab = labJson ? JSON.parse(labJson) : null;
        memoryUser = parsedUser;
        memoryLab = parsedLab;
        memoryAccessToken = accessToken || '';
        memoryRefreshToken = refreshToken || '';

        set({
          accessToken: accessToken || '',
          refreshToken: refreshToken || '',
          user: parsedUser,
          lab: parsedLab,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (memoryUser && (memoryAccessToken || memoryRefreshToken)) {
        // Fallback to in-memory cache
        set({
          accessToken: memoryAccessToken,
          refreshToken: memoryRefreshToken,
          user: memoryUser,
          lab: memoryLab,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch {
      if (memoryUser && (memoryAccessToken || memoryRefreshToken)) {
        set({
          accessToken: memoryAccessToken,
          refreshToken: memoryRefreshToken,
          user: memoryUser,
          lab: memoryLab,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false, isAuthenticated: false });
      }
    }
  },

  setSession: async (user, lab, tokens) => {
    memoryUser = user;
    memoryLab = lab;
    memoryAccessToken = tokens.accessToken;
    memoryRefreshToken = tokens.refreshToken;

    try {
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken).catch(() => null),
        SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken).catch(() => null),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)).catch(() => null),
        lab ? SecureStore.setItemAsync(LAB_KEY, JSON.stringify(lab)).catch(() => null) : Promise.resolve(),
      ]);
    } catch (storeErr) {
      console.warn('[AuthStore] SecureStore write warning:', storeErr);
    }

    set({
      user,
      lab,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  updateAccessToken: async (accessToken) => {
    memoryAccessToken = accessToken;
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken).catch(() => null);
    } catch {}
    set({ accessToken });
  },

  updateRefreshToken: async (refreshToken) => {
    memoryRefreshToken = refreshToken;
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken).catch(() => null);
    } catch {}
    set({ refreshToken });
  },

  logout: async () => {
    memoryUser = null;
    memoryLab = null;
    memoryAccessToken = null;
    memoryRefreshToken = null;

    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => null),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => null),
        SecureStore.deleteItemAsync(USER_KEY).catch(() => null),
        SecureStore.deleteItemAsync(LAB_KEY).catch(() => null),
      ]);
    } catch {}

    set({
      user: null,
      lab: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
}));
