import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type CurrencyCode = 'AED' | 'INR' | 'USD' | 'SAR' | 'EUR' | 'GBP';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
}

export const CURRENCY_LIST: CurrencyConfig[] = [
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
];

export interface SettingsState {
  currency: CurrencyCode;
  currencySymbol: string;
  printerWidth: '58mm' | '80mm';
  labName: string;
  labPhone: string;
  labAddress: string;
  receiptFooter: string;
  isLoading: boolean;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  setPrinterWidth: (width: '58mm' | '80mm') => Promise<void>;
  updateLabInfo: (info: { labName?: string; labPhone?: string; labAddress?: string; receiptFooter?: string }) => Promise<void>;
  initSettings: () => Promise<void>;
  formatMoney: (amount?: number | null) => string;
}

const SETTINGS_KEY = 'ilab_settings_data_v1';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  currency: 'AED',
  currencySymbol: 'AED',
  printerWidth: '58mm',
  labName: 'iLab Service Center',
  labPhone: '+971 50 123 4567',
  labAddress: 'Shop #12, Mobile Market',
  receiptFooter: 'Thank you for choosing iLab! 30-day warranty on repaired parts.',
  isLoading: true,

  initSettings: async () => {
    try {
      const stored = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const config = CURRENCY_LIST.find((c) => c.code === parsed.currency) || CURRENCY_LIST[0];
        set({
          currency: config.code,
          currencySymbol: config.symbol,
          printerWidth: parsed.printerWidth || '58mm',
          labName: parsed.labName || 'iLab Service Center',
          labPhone: parsed.labPhone || '+971 50 123 4567',
          labAddress: parsed.labAddress || 'Shop #12, Mobile Market',
          receiptFooter: parsed.receiptFooter || 'Thank you for choosing iLab! 30-day warranty.',
          isLoading: false,
        });
        return;
      }
    } catch {
      // Fallback defaults
    }
    set({ isLoading: false });
  },

  setCurrency: async (code: CurrencyCode) => {
    const config = CURRENCY_LIST.find((c) => c.code === code) || CURRENCY_LIST[0];
    set({ currency: config.code, currencySymbol: config.symbol });
    const current = get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({
          currency: current.currency,
          printerWidth: current.printerWidth,
          labName: current.labName,
          labPhone: current.labPhone,
          labAddress: current.labAddress,
          receiptFooter: current.receiptFooter,
        })
      );
    } catch {
      // Ignore
    }
  },

  setPrinterWidth: async (printerWidth: '58mm' | '80mm') => {
    set({ printerWidth });
    const current = get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({
          currency: current.currency,
          printerWidth: current.printerWidth,
          labName: current.labName,
          labPhone: current.labPhone,
          labAddress: current.labAddress,
          receiptFooter: current.receiptFooter,
        })
      );
    } catch {
      // Ignore
    }
  },

  updateLabInfo: async (info) => {
    set((prev) => ({
      ...prev,
      ...info,
    }));
    const current = get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({
          currency: current.currency,
          printerWidth: current.printerWidth,
          labName: current.labName,
          labPhone: current.labPhone,
          labAddress: current.labAddress,
          receiptFooter: current.receiptFooter,
        })
      );
    } catch {
      // Ignore
    }
  },

  formatMoney: (amount?: number | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return `${get().currencySymbol} 0`;
    return `${get().currencySymbol} ${amount.toLocaleString()}`;
  },
}));
