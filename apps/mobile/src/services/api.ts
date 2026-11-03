import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';

const SERVER_HOST_KEY = 'ilab_server_host';
// Default to the 24/7 Cloud Production Backend on Render
let currentServerHost = 'ilab-backend-npot.onrender.com';

export async function initServerHost(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync(SERVER_HOST_KEY);
    if (saved) {
      currentServerHost = saved;
    }
  } catch {}
  return currentServerHost;
}

export async function setServerHost(host: string): Promise<void> {
  currentServerHost = host.trim().replace(/\/$/, '');
  await SecureStore.setItemAsync(SERVER_HOST_KEY, currentServerHost);
}

export function getServerUrl(): string {
  if (currentServerHost.startsWith('http://') || currentServerHost.startsWith('https://')) {
    return `${currentServerHost.replace(/\/$/, '')}/api`;
  }
  const isSecure = currentServerHost.includes('onrender.com') || currentServerHost.includes('trycloudflare.com') || currentServerHost.includes('ngrok') || currentServerHost.includes('.com') || currentServerHost.includes('.app');
  const protocol = isSecure ? 'https' : 'http';
  return `${protocol}://${currentServerHost}/api`;
}

export function getCurrentHost(): string {
  return currentServerHost;
}

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

// Global Refresh Mutex to eliminate parallel 401 race conditions
let activeRefreshPromise: Promise<string | null> | null = null;

async function getFreshAccessToken(oldRefreshToken: string): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const baseUrl = getServerUrl();
      const refreshRes = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: oldRefreshToken }),
      });

      if (!refreshRes.ok) {
        // Only log out if server definitively tells us the token is revoked (401/403)
        if (refreshRes.status === 401 || refreshRes.status === 403) {
          const authStore = useAuthStore.getState();
          await authStore.logout();
        }
        return null;
      }

      const refreshData = await refreshRes.json();
      const newAccessToken = refreshData.data?.accessToken;
      const newRefreshToken = refreshData.data?.refreshToken;

      if (newAccessToken) {
        const authStore = useAuthStore.getState();
        await authStore.updateAccessToken(newAccessToken);
        if (newRefreshToken) {
          await authStore.updateRefreshToken(newRefreshToken);
        }
        return newAccessToken;
      }
      return null;
    } catch (networkErr) {
      // NEVER log out on transient network failures or Render waking up
      console.warn('[API] Token refresh network failure (preserved session):', networkErr);
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { requiresAuth = true, headers = {}, ...customConfig } = options;

  const authStore = useAuthStore.getState();
  const token = authStore.accessToken;
  const labId = authStore.lab?.id;
  const baseUrl = getServerUrl();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (requiresAuth && token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  if (labId) {
    requestHeaders['x-lab-id'] = labId;
  }

  try {
    let response = await fetch(`${baseUrl}${endpoint}`, {
      ...customConfig,
      headers: requestHeaders,
    });

    // Handle Token Refresh safely with Mutex
    if (response.status === 401 && requiresAuth && authStore.refreshToken) {
      const freshToken = await getFreshAccessToken(authStore.refreshToken);
      if (freshToken) {
        requestHeaders['Authorization'] = `Bearer ${freshToken}`;
        response = await fetch(`${baseUrl}${endpoint}`, {
          ...customConfig,
          headers: requestHeaders,
        });
      }
    }

    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error('Cloud Server waking up from sleep. Please wait 10-15 seconds and try again.');
      }
      throw new Error(`Server returned ${response.status} (${response.statusText || 'Unexpected response'})`);
    }

    if (!response.ok) {
      throw new Error(data?.message || `Server responded with status ${response.status}`);
    }

    return data;
  } catch (err: any) {
    if (err.message && err.message.includes('Network request failed')) {
      throw new Error(
        `Cannot connect to Lab Server (${currentServerHost}). Check Wi-Fi or update Server IP in Sign In screen.`
      );
    }
    throw err;
  }
}
