import { create } from 'zustand';
import { DevicePriority } from '../shared';

export interface BatchDeviceItem {
  id: string;
  imei1: string;
  imei2?: string;
  modelId: string;
  modelName: string;
  faultIds: string[];
  customFaults: string[];
  waterDamageStatus: boolean;
  priority: DevicePriority;
  initialNotes?: string;
  isReturnClaim?: boolean;
  claimType?: string;
  previousJobNumber?: string;
  previousTechName?: string;
  previousDiagnosis?: string;
}

interface BatchIntakeState {
  intakeMode: 'batch' | 'single';
  batchName: string;
  receivedFrom: string;
  assignedTechId: string;
  defaultModelId: string;
  defaultFaultIds: string[];
  defaultCustomFaults: string[];
  defaultPriority: DevicePriority;
  batchItems: BatchDeviceItem[];

  setIntakeMode: (mode: 'batch' | 'single') => void;
  setBatchName: (name: string) => void;
  setReceivedFrom: (from: string) => void;
  setAssignedTechId: (id: string) => void;
  setDefaultModelId: (id: string) => void;
  setDefaultFaultIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setDefaultCustomFaults: (faults: string[] | ((prev: string[]) => string[])) => void;
  setDefaultPriority: (priority: DevicePriority) => void;

  setBatchItems: (items: BatchDeviceItem[] | ((prev: BatchDeviceItem[]) => BatchDeviceItem[])) => void;
  addBatchItem: (item: BatchDeviceItem) => void;
  removeBatchItem: (id: string) => void;
  updateBatchItem: (id: string, updates: Partial<BatchDeviceItem>) => void;
  clearBatch: () => void;
}

export const useBatchIntakeStore = create<BatchIntakeState>((set) => ({
  intakeMode: 'batch',
  batchName: '',
  receivedFrom: '',
  assignedTechId: '',
  defaultModelId: '',
  defaultFaultIds: [],
  defaultCustomFaults: [],
  defaultPriority: DevicePriority.NORMAL,
  batchItems: [],

  setIntakeMode: (mode) => set({ intakeMode: mode }),
  setBatchName: (name) => set({ batchName: name }),
  setReceivedFrom: (from) => set({ receivedFrom: from }),
  setAssignedTechId: (id) => set({ assignedTechId: id }),
  setDefaultModelId: (id) => set({ defaultModelId: id }),
  setDefaultFaultIds: (updater) =>
    set((state) => ({
      defaultFaultIds: typeof updater === 'function' ? updater(state.defaultFaultIds) : updater,
    })),
  setDefaultCustomFaults: (updater) =>
    set((state) => ({
      defaultCustomFaults: typeof updater === 'function' ? updater(state.defaultCustomFaults) : updater,
    })),
  setDefaultPriority: (priority) => set({ defaultPriority: priority }),

  setBatchItems: (updater) =>
    set((state) => ({
      batchItems: typeof updater === 'function' ? updater(state.batchItems) : updater,
    })),
  addBatchItem: (item) =>
    set((state) => ({
      batchItems: [item, ...state.batchItems],
    })),
  removeBatchItem: (id) =>
    set((state) => ({
      batchItems: state.batchItems.filter((i) => i.id !== id),
    })),
  updateBatchItem: (id, updates) =>
    set((state) => ({
      batchItems: state.batchItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),
  clearBatch: () =>
    set({
      batchItems: [],
      batchName: '',
    }),
}));
