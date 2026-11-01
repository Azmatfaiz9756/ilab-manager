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
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
}

const ACCESS_TOKEN_KEY = 'ilab_access_token';
const REFRESH_TOKEN_KEY = 'ilab_refresh_token';
const USER_KEY = 'ilab_auth_user';
const LAB_KEY = 'ilab_auth_lab';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  lab: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  initAuth: async () => {
    try {
      const [accessToken, refreshToken, userJson, labJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
        SecureStore.getItemAsync(LAB_KEY),
      ]);

      if (accessToken && userJson) {
        set({
          accessToken,
          refreshToken,
          user: JSON.parse(userJson),
          lab: labJson ? JSON.parse(labJson) : null,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setSession: async (user, lab, tokens) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
      lab ? SecureStore.setItemAsync(LAB_KEY, JSON.stringify(lab)) : Promise.resolve(),
    ]);

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
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    set({ accessToken });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(LAB_KEY),
    ]);

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
