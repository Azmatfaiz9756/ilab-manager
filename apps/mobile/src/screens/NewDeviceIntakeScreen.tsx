import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { validateIMEILuhn, DevicePriority, DeviceStatus, maskIMEI } from '../shared';
import { StatusBadge } from '../components/StatusBadge';

interface BatchDeviceItem {
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

export const NewDeviceIntakeScreen: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const queryClient = useQueryClient();

  // Top Operations Segment: 'intake' | 'sent_to_tech' | 'dispatch' | 'history'
  const [activeSegment, setActiveSegment] = useState<'intake' | 'sent_to_tech' | 'dispatch' | 'history'>('intake');

  // Sent to Technician search
  const [sentSearchQuery, setSentSearchQuery] = useState('');
  const { data: sentData, isLoading: sentLoading, refetch: refetchSent } = useQuery({
    queryKey: ['sent_to_tech_jobs'],
    queryFn: () => apiRequest('/repairs/dispatch-list?status=SENT_TO_TECH'),
    refetchInterval: 4000,
  });
  const sentJobs = sentData?.data || [];

  // Intake Mode: 'batch' | 'single'
  const [intakeMode, setIntakeMode] = useState<'batch' | 'single'>('batch');

  // ----------------------------------------------------
  // DATA FETCHING: Models, Faults, Team
  // ----------------------------------------------------
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['catalog_models'],
    queryFn: () => apiRequest('/catalog/models'),
  });
  const models = modelsData?.data || [];

  const { data: faultsData, isLoading: faultsLoading } = useQuery({
    queryKey: ['catalog_faults'],
    queryFn: () => apiRequest('/catalog/faults'),
  });
  const faultCategories = faultsData?.data || [];

  const { data: teamData } = useQuery({
    queryKey: ['team_list'],
    queryFn: () => apiRequest('/team'),
  });
  const technicians = (teamData?.data || []).filter(
    (m: any) => m.role === 'BOARD_TECHNICIAN' && m.isActive
  );

  // Flattened list of all faults for autocomplete
  const allCatalogFaults = useMemo(() => {
    const list: Array<{ id: string; name: string; categoryName: string }> = [];
    faultCategories.forEach((cat: any) => {
      cat.faults?.forEach((f: any) => {
        list.push({ id: f.id, name: f.name, categoryName: cat.name });
      });
    });
    return list;
  }, [faultCategories]);

  // ----------------------------------------------------
  // BATCH INTAKE STATE
  // ----------------------------------------------------
  const [defaultModelId, setDefaultModelId] = useState<string>('');
  const [defaultFaultIds, setDefaultFaultIds] = useState<string[]>([]);
  const [defaultCustomFaults, setDefaultCustomFaults] = useState<string[]>([]);
  const [receivedFrom, setReceivedFrom] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<DevicePriority>(DevicePriority.NORMAL);
  const [assignedTechId, setAssignedTechId] = useState<string>('');
  const [batchName, setBatchName] = useState('');

  // Auto-select technician if only 1 active board tech in lab
  React.useEffect(() => {
    if (technicians.length === 1 && !assignedTechId) {
      setAssignedTechId(technicians[0].id);
    }
  }, [technicians, assignedTechId]);

  // Scanned Batch List
  const [batchItems, setBatchItems] = useState<BatchDeviceItem[]>([]);
  const [manualImeiInput, setManualImeiInput] = useState('');

  // Expandable Category State for Fault Roots
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  // Autocomplete state for Batch Header
  const [faultSearchQuery, setFaultSearchQuery] = useState('');

  // Submitting state
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // ----------------------------------------------------
  // ROW-SPECIFIC EXTRA FAULT MODAL STATE
  // ----------------------------------------------------
  const [editingRowItem, setEditingRowItem] = useState<BatchDeviceItem | null>(null);
  const [rowFaultQuery, setRowFaultQuery] = useState('');

  // ----------------------------------------------------
  // CAMERA SCANNER STATE
  // ----------------------------------------------------
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerFeedbackBanner, setScannerFeedbackBanner] = useState<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedImeiRef = useRef<string>('');

  // Ensure default model is set once models load
  if (models.length > 0 && !defaultModelId) {
    // Default to iPhone 12 if available, else first model
    const iphone12 = models.find((m: any) => m.name.toLowerCase().includes('iphone 12'));
    setDefaultModelId(iphone12 ? iphone12.id : models[0].id);
  }

  // Helper to add IMEI into batch with Auto-Return Claim check
  const addImeiToBatch = async (rawImei: string): Promise<boolean> => {
    const clean = rawImei.trim();
    if (!clean) return false;

    // Check duplicate in current batch
    if (batchItems.some((b) => b.imei1 === clean)) {
      Alert.alert('Duplicate in Batch', `IMEI ${clean} is already scanned in this batch.`);
      return false;
    }

    const luhn = validateIMEILuhn(clean);
    if (!luhn.isValid) {
      Alert.alert('Invalid IMEI', `IMEI ${clean} is invalid or fails Luhn checksum.`);
      return false;
    }

    // Auto-Return Claim Live Detection
    let isReturn = false;
    let claimTypeStr = '';
    let prevJobNum = '';
    let prevTech = '';
    let prevDiag = '';

    try {
      const checkRes = await apiRequest('/devices/check-imei', {
        method: 'POST',
        body: JSON.stringify({
          imei: clean,
          faultIds: defaultFaultIds,
          customFaults: defaultCustomFaults,
        }),
      });

      if (checkRes.success && checkRes.data) {
        if (checkRes.data.isInLabNow) {
          Alert.alert(
            'Device Already in Lab',
            `IMEI ${clean} is currently active in the lab (Job: ${checkRes.data.currentActiveJob?.jobNumber}, Status: ${checkRes.data.currentActiveJob?.status}).`
          );
        }

        const evaluation = checkRes.data.evaluation;
        if (evaluation && evaluation.isReturnClaim) {
          isReturn = true;
          claimTypeStr = evaluation.claimType || 'SAME_FAULT';
          prevJobNum = evaluation.previousRepairJob?.jobNumber || '';
          prevTech = evaluation.previousRepairJob?.technicianName || '';
          prevDiag = evaluation.previousRepairJob?.diagnosis || '';

          Alert.alert(
            '🔴 RETURN CLAIM DETECTED',
            `IMEI: ${clean}\n\nThis phone was repaired before in this lab!\n• Previous Job: ${prevJobNum}\n• Technician: ${prevTech}\n• Diagnosis: ${prevDiag}\n\nAuto-flagged with Return Claim & URGENT priority.`
          );
        }
      }
    } catch {
      // Offline fallback: continue smoothly
    }

    const modelObj = models.find((m: any) => m.id === defaultModelId) || models[0];
    const newItem: BatchDeviceItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      imei1: clean,
      modelId: modelObj?.id || '',
      modelName: modelObj?.name || 'iPhone',
      faultIds: [...defaultFaultIds],
      customFaults: [...defaultCustomFaults],
      waterDamageStatus: false,
      priority: isReturn ? DevicePriority.URGENT : defaultPriority,
      isReturnClaim: isReturn,
      claimType: claimTypeStr,
      previousJobNumber: prevJobNum,
      previousTechName: prevTech,
      previousDiagnosis: prevDiag,
    };

    setBatchItems((prev) => [newItem, ...prev]);
    setScannerFeedbackBanner(
      isReturn
        ? `🔴 RETURN CLAIM: ${clean} (${prevTech})`
        : `✅ Added Device #${batchItems.length + 1}: ${clean}`
    );
    setTimeout(() => setScannerFeedbackBanner(null), 3000);
    return true;
  };

  // Barcode scanner callback (Prioritizes 1st / upper IMEI)
  const handleBarcodeScanned = (event: any) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1200) return; // 1.2s debounce

    const data = (event.data || '').trim();
    if (!data) return;

    // 1st Priority rule: extract all 15-digit numbers from barcode text
    const matches = data.match(/\b\d{15}\b/g);
    let candidateImei = '';
    if (matches && matches.length > 0) {
      // Always select the 1st / upper IMEI
      candidateImei = matches[0];
    } else {
      const digits = data.replace(/\D/g, '');
      if (digits.length >= 15) {
        candidateImei = digits.slice(0, 15);
      }
    }

    if (candidateImei && candidateImei.length === 15) {
      if (lastScannedImeiRef.current === candidateImei && now - lastScanTimeRef.current < 2500) {
        return; // Ignore repeated scan of same device
      }
      lastScanTimeRef.current = now;
      lastScannedImeiRef.current = candidateImei;
      addImeiToBatch(candidateImei);
    }
  };

  // Submit Bulk Batch Intake
  const handleSubmitBatch = async () => {
    if (batchItems.length === 0) {
      Alert.alert('Empty Batch', 'Please scan or add at least one device before submitting.');
      return;
    }

    setSubmittingBatch(true);
    try {
      const res = await apiRequest('/devices/bulk-intake', {
        method: 'POST',
        body: JSON.stringify({
          batchName: batchName.trim() || undefined,
          receivedFrom: receivedFrom.trim() || undefined,
          priority: defaultPriority,
          assignedTechnicianId: assignedTechId || undefined,
          items: batchItems.map((item) => ({
            imei1: item.imei1,
            imei2: item.imei2 || undefined,
            modelId: item.modelId,
            waterDamageStatus: item.waterDamageStatus,
            faultIds: item.faultIds,
            customFaults: item.customFaults,
            priority: item.priority,
            initialNotes: item.initialNotes || undefined,
          })),
        }),
      });

      if (res.success) {
        const { totalSuccess, totalFailed, created, failed } = res.data;
        const assignedTechObj = technicians.find((t: any) => t.id === assignedTechId);
        const assignedTechName = assignedTechObj?.name || 'Hardware Technician';

        let alertTitle = 'Batch Intake Complete';
        let msg = `Successfully registered ${totalSuccess} devices!\n`;

        if (assignedTechId) {
          alertTitle = '🚀 Sent to Technician';
          msg = `✅ ${totalSuccess} Phones sent to Hardware Technician (${assignedTechName})!\n\nStatus: Sent to Technician (Awaiting Handover)\nTechnician ke [📥 Incoming] workbench me handover accept karne ke liye bhej diye gaye hain.\n`;
        }

        if (created.length > 0) {
          msg += `\nJobs Created: ${created.slice(0, 3).map((c: any) => c.jobNumber).join(', ')}${created.length > 3 ? ` ...and ${created.length - 3} more` : ''}\n`;
        }
        if (totalFailed > 0) {
          msg += `\n⚠️ Skipped ${totalFailed} duplicate/invalid devices:\n${failed.map((f: any) => `${f.imei}: ${f.error}`).join('\n')}`;
        }

        Alert.alert(alertTitle, msg, [
          {
            text: assignedTechId ? 'View Sent Phones ➔' : 'OK',
            onPress: () => {
              setBatchItems([]);
              setBatchName('');
              queryClient.invalidateQueries({ queryKey: ['sent_to_tech_jobs'] });
              queryClient.invalidateQueries({ queryKey: ['my_repairs_list'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
              if (assignedTechId) {
                setActiveSegment('sent_to_tech');
              }
              onSuccess?.();
            },
          },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Batch Intake Failed', err.message || 'Could not process batch intake.');
    } finally {
      setSubmittingBatch(false);
    }
  };

  // ----------------------------------------------------
  // RETURN / WAPSI / DISPATCH STATE
  // ----------------------------------------------------
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [returnDateFilter, setReturnDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY'>('ALL');
  const [returnStatusFilter, setReturnStatusFilter] = useState<'READY' | 'DISPATCHED' | 'ALL'>('READY');

  const { data: dispatchData, isLoading: dispatchLoading, refetch: refetchDispatch } = useQuery({
    queryKey: ['dispatch_list', returnStatusFilter, returnDateFilter, returnSearchQuery],
    queryFn: () => {
      let url = `/repairs/dispatch-list?status=${returnStatusFilter}&search=${encodeURIComponent(returnSearchQuery)}`;
      if (returnDateFilter === 'TODAY') {
        const todayStr = new Date().toISOString().split('T')[0];
        url += `&date=${todayStr}`;
      } else if (returnDateFilter === 'YESTERDAY') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const yestStr = d.toISOString().split('T')[0];
        url += `&date=${yestStr}`;
      }
      return apiRequest(url);
    },
    enabled: activeSegment === 'dispatch' || activeSegment === 'history',
  });
  const dispatchJobs = dispatchData?.data || [];

  // Selected Jobs for Bulk Return
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  // Single Device Handover / Return Sheet State
  const [activeDispatchJob, setActiveDispatchJob] = useState<any | null>(null);
  const [handoverTo, setHandoverTo] = useState('');
  const [workDoneNotes, setWorkDoneNotes] = useState('');
  const [dispatchExtraNotes, setDispatchExtraNotes] = useState('');
  const [extraReturnFaults, setExtraReturnFaults] = useState<string[]>([]);
  const [extraFaultInput, setExtraFaultInput] = useState('');
  const [partsList, setPartsList] = useState<Array<{ partName: string; quantity: number; cost?: number }>>([]);
  const [partNameInput, setPartNameInput] = useState('');
  const [partCostInput, setPartCostInput] = useState('');
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);

  // Submit Single Return Handover
  const handleConfirmReturn = async () => {
    if (!activeDispatchJob) return;

    setDispatchSubmitting(true);
    try {
      const res = await apiRequest(`/repairs/${activeDispatchJob.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          returnedTo: handoverTo.trim() || undefined,
          workPerformed: workDoneNotes.trim() || undefined,
          dispatchNotes: dispatchExtraNotes.trim() || undefined,
          extraFaults: extraReturnFaults,
          partsUsed: partsList,
        }),
      });

      if (res.success) {
        Alert.alert('Device Returned', `Job ${activeDispatchJob.jobNumber} marked DISPATCHED & returned.`);
        setActiveDispatchJob(null);
        setHandoverTo('');
        setWorkDoneNotes('');
        setDispatchExtraNotes('');
        setExtraReturnFaults([]);
        setPartsList([]);
        refetchDispatch();
        queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      }
    } catch (err: any) {
      Alert.alert('Return Failed', err.message || 'Could not complete return.');
    } finally {
      setDispatchSubmitting(false);
    }
  };

  // Submit Bulk Return
  const handleBulkReturn = async () => {
    if (selectedJobIds.length === 0) return;

    Alert.prompt
      ? Alert.prompt(
          'Bulk Return Confirmation',
          `Enter recipient name for ${selectedJobIds.length} devices:`,
          async (recipient) => {
            if (!recipient) return;
            executeBulkReturn(recipient);
          }
        )
      : executeBulkReturn('Customer / Dealer');
  };

  const executeBulkReturn = async (recipient: string) => {
    setDispatchSubmitting(true);
    try {
      const res = await apiRequest('/repairs/bulk-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          jobIds: selectedJobIds,
          returnedTo: recipient,
        }),
      });
      if (res.success) {
        Alert.alert('Bulk Return Complete', `${res.data?.dispatchedCount || selectedJobIds.length} devices returned.`);
        setSelectedJobIds([]);
        refetchDispatch();
        queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      }
    } catch (err: any) {
      Alert.alert('Bulk Return Error', err.message);
    } finally {
      setDispatchSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // FAULT AUTOCOMPLETE SUGGESTION FILTERING
  // ----------------------------------------------------
  const filteredHeaderSuggestions = useMemo(() => {
    const q = faultSearchQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return allCatalogFaults.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.categoryName.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [faultSearchQuery, allCatalogFaults]);

  const filteredRowSuggestions = useMemo(() => {
    const q = rowFaultQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return allCatalogFaults.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.categoryName.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [rowFaultQuery, allCatalogFaults]);

  // Quick Main Fault Category Chips
  const mainCategories = [
    { key: 'FACE ID', label: '👁️ Face ID' },
    { key: 'DISPLAY', label: '📱 Display' },
    { key: 'POWER AND BOOT', label: '⚡ Power/Boot' },
    { key: 'CHARGING', label: '🔋 Charging' },
    { key: 'NETWORK', label: '📶 Network' },
    { key: 'FRONT CAMERA', label: '📷 Front Cam' },
    { key: 'REAR CAMERA', label: '📸 Rear Cam' },
    { key: 'AUDIO', label: '🔊 Audio/Spk' },
    { key: 'OTHER', label: '🛠️ Other' },
  ];

  return (
    <View style={styles.container}>
      {/* 1. TOP SEGMENT TABS (Intake | Sent to Tech | Return/Wapsi | History) */}
      <View style={styles.topSegmentBar}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'intake' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('intake')}
        >
          <Text style={[styles.segmentText, activeSegment === 'intake' && styles.segmentTextActive]}>
            📥 Intake Hub
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'sent_to_tech' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('sent_to_tech')}
        >
          <Text style={[styles.segmentText, activeSegment === 'sent_to_tech' && styles.segmentTextActive]}>
            🚀 Sent to Tech ({sentJobs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'dispatch' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('dispatch')}
        >
          <Text style={[styles.segmentText, activeSegment === 'dispatch' && styles.segmentTextActive]}>
            📤 Return / Wapsi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'history' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('history')}
        >
          <Text style={[styles.segmentText, activeSegment === 'history' && styles.segmentTextActive]}>
            📜 History
          </Text>
        </TouchableOpacity>
      </View>

      {/* ======================================================== */}
      {/* TAB 1: INTAKE (BATCH & SINGLE)                           */}
      {/* ======================================================== */}
      {activeSegment === 'intake' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Mode Switcher: 20-50 Batch vs Single */}
          <View style={styles.intakeModeContainer}>
            <TouchableOpacity
              style={[styles.modeBtn, intakeMode === 'batch' && styles.modeBtnActive]}
              onPress={() => setIntakeMode('batch')}
            >
              <Text style={[styles.modeBtnText, intakeMode === 'batch' && styles.modeBtnTextActive]}>
                📦 Bulk Batch (20–50+ Phones)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, intakeMode === 'single' && styles.modeBtnActive]}
              onPress={() => setIntakeMode('single')}
            >
              <Text style={[styles.modeBtnText, intakeMode === 'single' && styles.modeBtnTextActive]}>
                📱 Single Phone
              </Text>
            </TouchableOpacity>
          </View>

          {/* ---------------------------------------------------- */}
          {/* A. BATCH PRESET BAR: Set Model & Fault Once for All  */}
          {/* ---------------------------------------------------- */}
          <View style={styles.presetCard}>
            <View style={styles.presetCardHeader}>
              <Text style={styles.cardHeaderTitle}>⚡ Batch Template (Apply to All Phones)</Text>
              <Text style={styles.presetHint}>Set once — all scanned phones get this automatically</Text>
            </View>

            {/* Default Model Selector */}
            <Text style={styles.label}>1. Batch Model (e.g. iPhone 12 for all 20 phones)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelHorizontalScroll}>
              {models.map((m: any) => {
                const isSelected = m.id === defaultModelId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.modelChip, isSelected && styles.modelChipSelected]}
                    onPress={() => {
                      setDefaultModelId(m.id);
                      // Also offer to update existing batch rows
                      if (batchItems.length > 0) {
                        setBatchItems((prev) =>
                          prev.map((item) => ({ ...item, modelId: m.id, modelName: m.name }))
                        );
                      }
                    }}
                  >
                    <Text style={[styles.modelChipText, isSelected && styles.modelChipTextSelected]}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Default Main Faults Selector */}
            <Text style={[styles.label, { marginTop: spacing.sm }]}>
              2. Main Fault(s) (1-Tap Select or Expand Sub-Faults)
            </Text>
            <View style={styles.mainFaultsWrap}>
              {mainCategories.map((cat) => {
                const isCustomSelected = defaultCustomFaults.includes(cat.key);
                const isExpanded = expandedCategoryId === cat.key;
                const catObj = faultCategories.find((c: any) => c.name === cat.key);

                return (
                  <View key={cat.key} style={styles.mainFaultItem}>
                    <TouchableOpacity
                      style={[styles.mainFaultBtn, isCustomSelected && styles.mainFaultBtnSelected]}
                      onPress={() => {
                        // Toggle main fault tag
                        if (isCustomSelected) {
                          setDefaultCustomFaults((prev) => prev.filter((f) => f !== cat.key));
                        } else {
                          setDefaultCustomFaults((prev) => [...prev, cat.key]);
                        }
                      }}
                    >
                      <Text style={[styles.mainFaultText, isCustomSelected && styles.mainFaultTextSelected]}>
                        {cat.label}
                      </Text>
                      {catObj?.faults?.length > 0 && (
                        <TouchableOpacity
                          style={styles.expandArrowBtn}
                          onPress={() => setExpandedCategoryId(isExpanded ? null : cat.key)}
                        >
                          <Text style={styles.expandArrowText}>{isExpanded ? '▲' : '▾'}</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* Sub-fault expandable root */}
                    {isExpanded && catObj?.faults && (
                      <View style={styles.subFaultsContainer}>
                        {catObj.faults.map((sub: any) => {
                          const isSubSelected = defaultFaultIds.includes(sub.id);
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              style={[styles.subFaultChip, isSubSelected && styles.subFaultChipSelected]}
                              onPress={() => {
                                if (isSubSelected) {
                                  setDefaultFaultIds((prev) => prev.filter((id) => id !== sub.id));
                                } else {
                                  setDefaultFaultIds((prev) => [...prev, sub.id]);
                                }
                              }}
                            >
                              <Text style={[styles.subFaultText, isSubSelected && styles.subFaultTextSelected]}>
                                {isSubSelected ? '✓ ' : ''}{sub.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Smart Fault Autocomplete Input */}
            <Text style={[styles.label, { marginTop: spacing.sm }]}>
              🔍 Type to Auto-Suggest Fault (Click suggestion to add)
            </Text>
            <View style={styles.autocompleteInputRow}>
              <TextInput
                style={styles.autocompleteInput}
                placeholder="Type fault (e.g. fid, speaker, green, baseband)..."
                placeholderTextColor={colors.textMuted}
                value={faultSearchQuery}
                onChangeText={setFaultSearchQuery}
              />
              {faultSearchQuery.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.addCustomBtn}
                  onPress={() => {
                    const custom = faultSearchQuery.trim();
                    if (custom && !defaultCustomFaults.includes(custom)) {
                      setDefaultCustomFaults((prev) => [...prev, custom]);
                    }
                    setFaultSearchQuery('');
                  }}
                >
                  <Text style={styles.addCustomBtnText}>+ Add "{faultSearchQuery.trim()}"</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Suggestion Chips (User clicks to auto-fill) */}
            {filteredHeaderSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggestionsTitle}>💡 Suggestions (Tap to add):</Text>
                <View style={styles.suggestionsWrap}>
                  {filteredHeaderSuggestions.map((sug) => {
                    const alreadyAdded = defaultFaultIds.includes(sug.id);
                    return (
                      <TouchableOpacity
                        key={sug.id}
                        style={[styles.suggestionChip, alreadyAdded && styles.suggestionChipAdded]}
                        onPress={() => {
                          if (!alreadyAdded) {
                            setDefaultFaultIds((prev) => [...prev, sug.id]);
                          }
                          setFaultSearchQuery('');
                        }}
                      >
                        <Text style={styles.suggestionChipText}>
                          {alreadyAdded ? '✓ ' : '+ '}{sug.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Active Selected Faults Summary */}
            <View style={styles.activeFaultsBox}>
              <Text style={styles.activeFaultsLabel}>Active Default Faults:</Text>
              <View style={styles.activeFaultsWrap}>
                {defaultCustomFaults.map((cf) => (
                  <View key={cf} style={styles.faultActiveChip}>
                    <Text style={styles.faultActiveChipText}>{cf}</Text>
                    <TouchableOpacity onPress={() => setDefaultCustomFaults((p) => p.filter((x) => x !== cf))}>
                      <Text style={styles.faultActiveRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {defaultFaultIds.map((fId) => {
                  const faultObj = allCatalogFaults.find((f) => f.id === fId);
                  return (
                    <View key={fId} style={styles.faultActiveChip}>
                      <Text style={styles.faultActiveChipText}>{faultObj?.name || 'Fault'}</Text>
                      <TouchableOpacity onPress={() => setDefaultFaultIds((p) => p.filter((x) => x !== fId))}>
                        <Text style={styles.faultActiveRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {defaultCustomFaults.length === 0 && defaultFaultIds.length === 0 && (
                  <Text style={styles.noFaultsText}>No default faults selected yet (select above)</Text>
                )}
              </View>
            </View>

            {/* Customer / Received From & Technician */}
            <View style={styles.metaRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.label}>Customer / Shop Name</Text>
                <TextInput
                  style={styles.metaInput}
                  placeholder="e.g. Star Mobiles"
                  placeholderTextColor={colors.textMuted}
                  value={receivedFrom}
                  onChangeText={setReceivedFrom}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Batch Name (Optional)</Text>
                <TextInput
                  style={styles.metaInput}
                  placeholder="e.g. Lot #12 Nov"
                  placeholderTextColor={colors.textMuted}
                  value={batchName}
                  onChangeText={setBatchName}
                />
              </View>
            </View>

            {/* 3. ASSIGN TO HARDWARE TECHNICIAN */}
            <View style={{ marginTop: spacing.sm }}>
              <Text style={styles.label}>3. Assign to Hardware Technician (Target Workbench)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelHorizontalScroll}>
                {technicians.length === 0 ? (
                  <View style={{ paddingVertical: 6 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      No active Board Technicians found. Phones will enter General Queue.
                    </Text>
                  </View>
                ) : (
                  technicians.map((t: any) => {
                    const isSelected = t.id === assignedTechId;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.modelChip, isSelected && styles.techChipSelected]}
                        onPress={() => setAssignedTechId(isSelected ? '' : t.id)}
                      >
                        <Text style={[styles.modelChipText, isSelected && styles.techChipTextSelected]}>
                          {isSelected ? '✓ ' : '👤 '}{t.name} (Board Tech)
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>

          {/* ---------------------------------------------------- */}
          {/* B. CAMERA & BARCODE IMEI SCANNER                      */}
          {/* ---------------------------------------------------- */}
          <View style={styles.scannerActionCard}>
            <Text style={styles.scannerCardTitle}>📷 Barcode & Camera IMEI Scanner</Text>
            <Text style={styles.scannerCardSub}>
              Scans 1D Barcodes, Code128, QR & always prioritizes 1st/upper IMEI
            </Text>

            <TouchableOpacity
              style={styles.openScannerBtn}
              onPress={async () => {
                if (!cameraPermission?.granted) {
                  const res = await requestCameraPermission();
                  if (!res.granted) {
                    Alert.alert('Permission Required', 'Camera permission is required to scan IMEIs.');
                    return;
                  }
                }
                setScannerOpen(true);
              }}
            >
              <Text style={styles.openScannerBtnText}>
                📷 Start Continuous IMEI Scanner ({batchItems.length} Scanned)
              </Text>
            </TouchableOpacity>

            {/* Manual IMEI Fallback Row */}
            <View style={styles.manualImeiRow}>
              <TextInput
                style={styles.manualImeiInput}
                placeholder="Or type/paste 15-digit IMEI manually..."
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={15}
                value={manualImeiInput}
                onChangeText={setManualImeiInput}
              />
              <TouchableOpacity
                style={styles.addManualBtn}
                onPress={async () => {
                  if (manualImeiInput.trim().length === 15) {
                    const success = await addImeiToBatch(manualImeiInput.trim());
                    if (success) {
                      setManualImeiInput('');
                    }
                  } else {
                    Alert.alert('Invalid Length', 'Please enter a 15-digit IMEI.');
                  }
                }}
              >
                <Text style={styles.addManualBtnText}>+ Add Phone</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ---------------------------------------------------- */}
          {/* C. SCANNED BATCH TABLE & ROW OVERRIDES               */}
          {/* ---------------------------------------------------- */}
          <View style={styles.batchListCard}>
            <View style={styles.batchListHeader}>
              <View>
                <Text style={styles.batchListTitle}>📋 Scanned Phones ({batchItems.length})</Text>
                <Text style={styles.batchListSubtitle}>
                  You can edit individual faults or model for any specific device row
                </Text>
              </View>
              {batchItems.length > 0 && (
                <TouchableOpacity
                  style={styles.clearBatchBtn}
                  onPress={() => {
                    Alert.alert('Clear Batch', 'Remove all scanned phones from batch?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear All', style: 'destructive', onPress: () => setBatchItems([]) },
                    ]);
                  }}
                >
                  <Text style={styles.clearBatchBtnText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {batchItems.length === 0 ? (
              <View style={styles.emptyBatchBox}>
                <Text style={styles.emptyBatchIcon}>📦</Text>
                <Text style={styles.emptyBatchText}>No phones scanned yet.</Text>
                <Text style={styles.emptyBatchSubText}>
                  Tap "Start Continuous IMEI Scanner" above or type IMEI manually to add 20–50 phones.
                </Text>
              </View>
            ) : (
              batchItems.map((item, index) => {
                return (
                  <View key={item.id} style={styles.batchItemRow}>
                    <View style={styles.batchItemTop}>
                      <View style={styles.batchItemIndexBadge}>
                        <Text style={styles.batchItemIndexText}>#{batchItems.length - index}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text style={styles.batchItemImei}>{item.imei1}</Text>
                        <Text style={styles.batchItemModel}>{item.modelName}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteRowBtn}
                        onPress={() => setBatchItems((p) => p.filter((x) => x.id !== item.id))}
                      >
                        <Text style={styles.deleteRowBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Auto-Return Claim Alert Banner on Row */}
                    {item.isReturnClaim && (
                      <View style={styles.returnClaimRowBadge}>
                        <Text style={styles.returnClaimRowBadgeText}>
                          🔴 RETURN CLAIM ({item.claimType || 'SAME FAULT'})
                        </Text>
                        <Text style={styles.returnClaimRowBadgeSub}>
                          Prev Job: {item.previousJobNumber || 'N/A'} • Tech: {item.previousTechName || 'N/A'}{item.previousDiagnosis ? ` • Diagnosis: ${item.previousDiagnosis}` : ''}
                        </Text>
                      </View>
                    )}

                    {/* Faults Tags on this row */}
                    <View style={styles.rowFaultsWrap}>
                      {item.customFaults.map((cf) => (
                        <View key={cf} style={styles.rowFaultChip}>
                          <Text style={styles.rowFaultText}>{cf}</Text>
                          <TouchableOpacity
                            onPress={() => {
                              setBatchItems((prev) =>
                                prev.map((b) =>
                                  b.id === item.id
                                    ? { ...b, customFaults: b.customFaults.filter((x) => x !== cf) }
                                    : b
                                )
                              );
                            }}
                          >
                            <Text style={styles.rowFaultRemove}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {item.faultIds.map((fId) => {
                        const faultObj = allCatalogFaults.find((f) => f.id === fId);
                        return (
                          <View key={fId} style={styles.rowFaultChip}>
                            <Text style={styles.rowFaultText}>{faultObj?.name || 'Fault'}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                setBatchItems((prev) =>
                                  prev.map((b) =>
                                    b.id === item.id
                                      ? { ...b, faultIds: b.faultIds.filter((x) => x !== fId) }
                                      : b
                                  )
                                );
                              }}
                            >
                              <Text style={styles.rowFaultRemove}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}

                      {/* + Add Extra Fault to this specific phone */}
                      <TouchableOpacity
                        style={styles.addExtraFaultBtn}
                        onPress={() => {
                          setEditingRowItem(item);
                          setRowFaultQuery('');
                        }}
                      >
                        <Text style={styles.addExtraFaultBtnText}>+ Extra Fault</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}

            {/* Submit Batch Button */}
            {batchItems.length > 0 && (
              <TouchableOpacity
                style={styles.submitBatchBtn}
                onPress={handleSubmitBatch}
                disabled={submittingBatch}
              >
                {submittingBatch ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBatchBtnText}>
                    {assignedTechId
                      ? `🚀 Send ${batchItems.length} Phones to ${technicians.find((t: any) => t.id === assignedTechId)?.name || 'Technician'}`
                      : `📥 Register ${batchItems.length} Phones in Intake`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      {/* ======================================================== */}
      {/* TAB 1.5: SENT TO TECHNICIAN (LIVE WORKBENCH TRACKING)    */}
      {/* ======================================================== */}
      {activeSegment === 'sent_to_tech' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={sentLoading} onRefresh={() => { refetchSent(); }} tintColor={colors.primaryLight} />
          }
        >
          <View style={styles.filterCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardHeaderTitle}>🚀 Phones with Hardware Technicians</Text>
              <View style={styles.badgeLive}>
                <Text style={styles.badgeLiveText}>{sentJobs.length} Active</Text>
              </View>
            </View>
            <Text style={styles.presetHint}>Live tracking: Handover pending, board repairs, and parts status</Text>
            <TextInput
              style={styles.returnSearchInput}
              placeholder="Search by IMEI, Model, Tech Name, Job #..."
              placeholderTextColor={colors.textMuted}
              value={sentSearchQuery}
              onChangeText={setSentSearchQuery}
            />
          </View>

          {sentJobs.length === 0 && !sentLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
              <Text style={styles.emptyTitle}>No Phones Currently with Technicians</Text>
              <Text style={styles.emptyText}>
                When phones are assigned to Hardware Techs, they will appear here with live tracking.
              </Text>
            </View>
          ) : (
            sentJobs
              .filter((job: any) => {
                if (!sentSearchQuery.trim()) return true;
                const q = sentSearchQuery.toLowerCase();
                const model = job.device?.model?.name?.toLowerCase() || '';
                const jn = job.jobNumber?.toLowerCase() || '';
                const tech = job.assignments?.[0]?.technician?.name?.toLowerCase() || '';
                const imeis = job.device?.imeis?.map((i: any) => i.imei).join(' ') || '';
                return model.includes(q) || jn.includes(q) || tech.includes(q) || imeis.includes(q);
              })
              .map((job: any) => {
                const dev = job.device || {};
                const primaryImei = dev.imeis?.find((i: any) => i.isPrimary)?.imei || dev.imeis?.[0]?.imei || 'NO-IMEI';
                const techName = job.assignments?.[0]?.technician?.name || 'Assigned Technician';
                const isHandoverPending = job.status === DeviceStatus.ASSIGNED_TO_TECHNICIAN;

                return (
                  <View key={job.id} style={styles.sentCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.sentModelName}>{dev.model?.name || 'iPhone'}</Text>
                        <Text style={styles.sentImei}>IMEI: {primaryImei}</Text>
                      </View>
                      <StatusBadge status={job.status} />
                    </View>

                    <View style={styles.techHolderRow}>
                      <Text style={styles.techHolderLabel}>👤 Technician:</Text>
                      <Text style={styles.techHolderName}>{techName}</Text>
                      {isHandoverPending && (
                        <View style={styles.handoverPendingBadge}>
                          <Text style={styles.handoverPendingBadgeText}>🤝 Handover Pending</Text>
                        </View>
                      )}
                    </View>

                    {dev.faults && dev.faults.length > 0 && (
                      <View style={styles.rowFaultsWrap}>
                        {dev.faults.map((f: any) => (
                          <View key={f.id} style={styles.rowFaultChip}>
                            <Text style={styles.rowFaultText}>
                              {f.fault?.name || f.customFaultName || 'Fault'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.cardFooter}>
                      <Text style={styles.jobNumber}>Job #{job.jobNumber}</Text>
                      <Text style={[styles.priorityText, dev.priority === 'URGENT' && { color: colors.danger }]}>
                        {dev.priority || 'NORMAL'}
                      </Text>
                    </View>
                  </View>
                );
              })
          )}
        </ScrollView>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RETURN / WAPSI (DATE-WISE DELIVERY & DISPATCH)     */}
      {/* ======================================================== */}
      {activeSegment === 'dispatch' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Filter Bar: Date & Status */}
          <View style={styles.filterCard}>
            <Text style={styles.cardHeaderTitle}>📦 Device Handover & Return Station</Text>
            <Text style={styles.presetHint}>Find devices date-wise, record extra faults & parts used</Text>

            {/* Date Filters */}
            <View style={styles.filterRow}>
              {(['ALL', 'TODAY', 'YESTERDAY'] as const).map((df) => (
                <TouchableOpacity
                  key={df}
                  style={[styles.filterChip, returnDateFilter === df && styles.filterChipSelected]}
                  onPress={() => setReturnDateFilter(df)}
                >
                  <Text style={[styles.filterChipText, returnDateFilter === df && styles.filterChipTextSelected]}>
                    📅 {df}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status Filter */}
            <View style={[styles.filterRow, { marginTop: spacing.xs }]}>
              {(['READY', 'DISPATCHED', 'ALL'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterChip, returnStatusFilter === st && styles.filterChipSelected]}
                  onPress={() => setReturnStatusFilter(st)}
                >
                  <Text style={[styles.filterChipText, returnStatusFilter === st && styles.filterChipTextSelected]}>
                    {st === 'READY' ? '🟢 Ready for Return' : st === 'DISPATCHED' ? '📦 Returned History' : 'All'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.returnSearchInput}
              placeholder="Search by IMEI, Job ID, or Customer name..."
              placeholderTextColor={colors.textMuted}
              value={returnSearchQuery}
              onChangeText={setReturnSearchQuery}
            />

            {/* Bulk Return Action */}
            {selectedJobIds.length > 0 && (
              <TouchableOpacity style={styles.bulkReturnBtn} onPress={handleBulkReturn}>
                <Text style={styles.bulkReturnBtnText}>
                  📦 Return Selected ({selectedJobIds.length} Phones) in 1-Click
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Job List */}
          {dispatchLoading ? (
            <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginVertical: 30 }} />
          ) : dispatchJobs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No devices match the selected date or return filters.</Text>
            </View>
          ) : (
            dispatchJobs.map((job: any) => {
              const dev = job.device;
              const primaryImei = dev.imeis?.find((i: any) => i.isPrimary)?.imei || dev.imeis?.[0]?.imei;
              const isSelected = selectedJobIds.includes(job.id);
              const isDispatched = job.status === DeviceStatus.DISPATCHED;

              return (
                <View key={job.id} style={styles.dispatchCard}>
                  <View style={styles.dispatchCardTop}>
                    {!isDispatched && (
                      <TouchableOpacity
                        style={styles.checkboxTouch}
                        onPress={() => {
                          setSelectedJobIds((prev) =>
                            isSelected ? prev.filter((id) => id !== job.id) : [...prev, job.id]
                          );
                        }}
                      >
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                          {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                        </View>
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.dispatchModel}>{dev.model?.name}</Text>
                        <StatusBadge status={job.status} />
                      </View>
                      <Text style={styles.dispatchJobNum}>{job.jobNumber}</Text>
                      <Text style={styles.dispatchImei}>IMEI: {primaryImei}</Text>
                      {dev.receivedFrom && (
                        <Text style={styles.dispatchCustomer}>👤 Customer: {dev.receivedFrom}</Text>
                      )}
                    </View>
                  </View>

                  {/* Faults & Work Performed Preview */}
                  <View style={styles.dispatchMetaBox}>
                    <Text style={styles.dispatchMetaText}>
                      Faults: {dev.faults?.map((f: any) => f.fault?.name || f.customFaultName).join(', ') || 'N/A'}
                    </Text>
                    {job.attempts?.[0]?.workPerformed && (
                      <Text style={styles.dispatchMetaText}>
                        Work Done: {job.attempts[0].workPerformed}
                      </Text>
                    )}
                    {job.parts?.length > 0 && (
                      <Text style={styles.dispatchMetaText}>
                        Parts Used: {job.parts.map((p: any) => p.partName).join(', ')}
                      </Text>
                    )}
                  </View>

                  {/* Action Buttons */}
                  {!isDispatched ? (
                    <TouchableOpacity
                      style={styles.dispatchActionBtn}
                      onPress={() => {
                        setActiveDispatchJob(job);
                        setHandoverTo(dev.receivedFrom || '');
                        setWorkDoneNotes(job.attempts?.[0]?.workPerformed || '');
                        setDispatchExtraNotes('');
                        setExtraReturnFaults([]);
                        setPartsList([]);
                      }}
                    >
                      <Text style={styles.dispatchActionBtnText}>
                        📦 Return Device & Add Parts / Notes
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.dispatchedBadge}>
                      <Text style={styles.dispatchedBadgeText}>
                        ✓ RETURNED ON {new Date(job.updatedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ======================================================== */}
      {/* TAB 3: DATE-WISE HISTORY & AUDIT LOG                     */}
      {/* ======================================================== */}
      {activeSegment === 'history' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.filterCard}>
            <Text style={styles.cardHeaderTitle}>📜 Complete Date-Wise Audit & Delivery History</Text>
            <Text style={styles.presetHint}>Search any IMEI, Job, or customer to view full timeline</Text>
            <TextInput
              style={styles.returnSearchInput}
              placeholder="Filter history by IMEI, Model, Job #..."
              placeholderTextColor={colors.textMuted}
              value={returnSearchQuery}
              onChangeText={setReturnSearchQuery}
            />
          </View>

          {dispatchJobs.map((job: any) => {
            const dev = job.device;
            const primaryImei = dev.imeis?.find((i: any) => i.isPrimary)?.imei || dev.imeis?.[0]?.imei;
            return (
              <View key={job.id} style={styles.historyCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.historyModel}>{dev.model?.name}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(job.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.historyJobNumber}>{job.jobNumber}</Text>
                <Text style={styles.historyImei}>IMEI: {primaryImei}</Text>
                <Text style={styles.historyCustomer}>
                  Customer: {dev.receivedFrom || 'Direct Customer'} • Priority: {dev.priority}
                </Text>

                <View style={styles.historyDivider} />
                <Text style={styles.historyDetail}>
                  • Status: <Text style={{ color: colors.primaryLight, fontWeight: '700' }}>{job.status}</Text>
                </Text>
                <Text style={styles.historyDetail}>
                  • Initial Faults: {dev.faults?.map((f: any) => f.fault?.name || f.customFaultName).join(', ') || 'N/A'}
                </Text>
                {job.parts?.length > 0 && (
                  <Text style={styles.historyDetail}>
                    • Parts Replaced: {job.parts.map((p: any) => `${p.partName} (x${p.quantity})`).join(', ')}
                  </Text>
                )}
                {job.attempts?.[0]?.workPerformed && (
                  <Text style={styles.historyDetail}>
                    • Work Performed: {job.attempts[0].workPerformed}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ======================================================== */}
      {/* CAMERA SCANNER MODAL                                     */}
      {/* ======================================================== */}
      <Modal visible={scannerOpen} animationType="slide">
        <View style={styles.scannerModalContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'upc_a'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />

          {/* Scanner Overlay */}
          <View style={styles.scannerOverlay}>
            {/* Top Bar with Feedback */}
            <View style={styles.scannerTopBar}>
              <Text style={styles.scannerTopTitle}>📷 Rapid Barcode & IMEI Scanner</Text>
              <Text style={styles.scannerTopSub}>Hold camera over barcode or phone box</Text>
              {scannerFeedbackBanner && (
                <View style={styles.scannerBanner}>
                  <Text style={styles.scannerBannerText}>{scannerFeedbackBanner}</Text>
                </View>
              )}
            </View>

            {/* Viewfinder Reticle */}
            <View style={styles.viewfinderBox}>
              <View style={styles.viewfinderCornerTL} />
              <View style={styles.viewfinderCornerTR} />
              <View style={styles.viewfinderCornerBL} />
              <View style={styles.viewfinderCornerBR} />
              <View style={styles.laserLine} />
            </View>

            <Text style={styles.reticleHintText}>
              Align Barcode / IMEI in box • Top/1st IMEI scanned with priority
            </Text>

            {/* Counter & Close Button */}
            <View style={styles.scannerBottomControls}>
              <Text style={styles.scannedCountText}>
                Total Scanned in Batch: {batchItems.length}
              </Text>
              <TouchableOpacity
                style={styles.closeScannerModalBtn}
                onPress={() => setScannerOpen(false)}
              >
                <Text style={styles.closeScannerModalBtnText}>Done Scanning (View Batch)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* ROW-SPECIFIC EXTRA FAULT MODAL                           */}
      {/* ======================================================== */}
      <Modal visible={!!editingRowItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalCardTitle}>Add Extra Fault to Device</Text>
            <Text style={styles.modalCardSub}>
              IMEI: {editingRowItem?.imei1} ({editingRowItem?.modelName})
            </Text>

            {/* Current Faults */}
            <Text style={styles.label}>Current Faults:</Text>
            <View style={styles.activeFaultsWrap}>
              {editingRowItem?.customFaults.map((cf) => (
                <View key={cf} style={styles.faultActiveChip}>
                  <Text style={styles.faultActiveChipText}>{cf}</Text>
                </View>
              ))}
              {editingRowItem?.faultIds.map((fId) => {
                const f = allCatalogFaults.find((x) => x.id === fId);
                return (
                  <View key={fId} style={styles.faultActiveChip}>
                    <Text style={styles.faultActiveChipText}>{f?.name || 'Fault'}</Text>
                  </View>
                );
              })}
            </View>

            {/* Autocomplete Input */}
            <Text style={[styles.label, { marginTop: spacing.md }]}>
              Type fault to add (e.g. ear speaker, sensor, fid hide):
            </Text>
            <View style={styles.autocompleteInputRow}>
              <TextInput
                style={styles.autocompleteInput}
                placeholder="Type fault name..."
                placeholderTextColor={colors.textMuted}
                value={rowFaultQuery}
                onChangeText={setRowFaultQuery}
              />
              {rowFaultQuery.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.addCustomBtn}
                  onPress={() => {
                    const custom = rowFaultQuery.trim();
                    if (editingRowItem && custom) {
                      setBatchItems((prev) =>
                        prev.map((b) =>
                          b.id === editingRowItem.id && !b.customFaults.includes(custom)
                            ? { ...b, customFaults: [...b.customFaults, custom] }
                            : b
                        )
                      );
                      setEditingRowItem((prev) =>
                        prev ? { ...prev, customFaults: [...prev.customFaults, custom] } : null
                      );
                    }
                    setRowFaultQuery('');
                  }}
                >
                  <Text style={styles.addCustomBtnText}>+ Add "{rowFaultQuery.trim()}"</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Suggestions for row */}
            {filteredRowSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggestionsTitle}>💡 Suggestions (Tap to add):</Text>
                <View style={styles.suggestionsWrap}>
                  {filteredRowSuggestions.map((sug) => (
                    <TouchableOpacity
                      key={sug.id}
                      style={styles.suggestionChip}
                      onPress={() => {
                        if (editingRowItem && !editingRowItem.faultIds.includes(sug.id)) {
                          setBatchItems((prev) =>
                            prev.map((b) =>
                              b.id === editingRowItem.id
                                ? { ...b, faultIds: [...b.faultIds, sug.id] }
                                : b
                            )
                          );
                          setEditingRowItem((prev) =>
                            prev ? { ...prev, faultIds: [...prev.faultIds, sug.id] } : null
                          );
                        }
                        setRowFaultQuery('');
                      }}
                    >
                      <Text style={styles.suggestionChipText}>+ {sug.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setEditingRowItem(null);
                setRowFaultQuery('');
              }}
            >
              <Text style={styles.modalDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* RETURN & HANDOVER DETAIL SHEET                           */}
      {/* ======================================================== */}
      <Modal visible={!!activeDispatchJob} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalCardTitle}>Return & Delivery Handover</Text>
              <Text style={styles.modalCardSub}>
                Job: {activeDispatchJob?.jobNumber} • {activeDispatchJob?.device?.model?.name}
              </Text>

              {/* Handover Recipient */}
              <Text style={styles.label}>Handed Over / Returned To</Text>
              <TextInput
                style={styles.metaInput}
                placeholder="Recipient / Customer name..."
                placeholderTextColor={colors.textMuted}
                value={handoverTo}
                onChangeText={setHandoverTo}
              />

              {/* Extra Faults found/repaired during wapsi */}
              <Text style={[styles.label, { marginTop: spacing.sm }]}>
                Add Any Extra Faults Discovered / Fixed:
              </Text>
              <View style={styles.autocompleteInputRow}>
                <TextInput
                  style={styles.autocompleteInput}
                  placeholder="e.g. Ear Speaker Replaced, Sensor..."
                  placeholderTextColor={colors.textMuted}
                  value={extraFaultInput}
                  onChangeText={setExtraFaultInput}
                />
                {extraFaultInput.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.addCustomBtn}
                    onPress={() => {
                      if (extraFaultInput.trim() && !extraReturnFaults.includes(extraFaultInput.trim())) {
                        setExtraReturnFaults((prev) => [...prev, extraFaultInput.trim()]);
                      }
                      setExtraFaultInput('');
                    }}
                  >
                    <Text style={styles.addCustomBtnText}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {extraReturnFaults.length > 0 && (
                <View style={styles.activeFaultsWrap}>
                  {extraReturnFaults.map((f) => (
                    <View key={f} style={styles.faultActiveChip}>
                      <Text style={styles.faultActiveChipText}>{f}</Text>
                      <TouchableOpacity onPress={() => setExtraReturnFaults((p) => p.filter((x) => x !== f))}>
                        <Text style={styles.faultActiveRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Parts Installed / Replaced */}
              <Text style={[styles.label, { marginTop: spacing.sm }]}>
                Parts Installed / Replaced:
              </Text>
              <View style={styles.partsInputRow}>
                <TextInput
                  style={[styles.metaInput, { flex: 2, marginRight: 6 }]}
                  placeholder="Part name (e.g. Prism Flex, OLED)"
                  placeholderTextColor={colors.textMuted}
                  value={partNameInput}
                  onChangeText={setPartNameInput}
                />
                <TextInput
                  style={[styles.metaInput, { flex: 1, marginRight: 6 }]}
                  placeholder="Cost"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={partCostInput}
                  onChangeText={setPartCostInput}
                />
                <TouchableOpacity
                  style={styles.addPartBtn}
                  onPress={() => {
                    if (partNameInput.trim()) {
                      setPartsList((prev) => [
                        ...prev,
                        {
                          partName: partNameInput.trim(),
                          quantity: 1,
                          cost: partCostInput ? parseFloat(partCostInput) : undefined,
                        },
                      ]);
                      setPartNameInput('');
                      setPartCostInput('');
                    }
                  }}
                >
                  <Text style={styles.addPartBtnText}>+ Add Part</Text>
                </TouchableOpacity>
              </View>

              {partsList.map((p, idx) => (
                <View key={idx} style={styles.partItemRow}>
                  <Text style={styles.partItemText}>
                    • {p.partName} {p.cost ? `($${p.cost})` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => setPartsList((prev) => prev.filter((_, i) => i !== idx))}>
                    <Text style={styles.faultActiveRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Work Performed / Handover Notes */}
              <Text style={[styles.label, { marginTop: spacing.sm }]}>
                Work Performed / Handover Notes (Kiya kiya wo type karein):
              </Text>
              <TextInput
                style={[styles.metaInput, { minHeight: 65, textAlignVertical: 'top' }]}
                placeholder="Type all repairs and testing done on this device..."
                placeholderTextColor={colors.textMuted}
                multiline
                value={workDoneNotes}
                onChangeText={setWorkDoneNotes}
              />

              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.confirmReturnBtn}
                onPress={handleConfirmReturn}
                disabled={dispatchSubmitting}
              >
                {dispatchSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmReturnBtnText}>
                    ✓ Confirm Return & Mark DISPATCHED
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelReturnBtn}
                onPress={() => setActiveDispatchJob(null)}
              >
                <Text style={styles.cancelReturnBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ----------------------------------------------------
// STYLES
// ----------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 130, // Safe distance above tab bar
  },

  // Top Segment Controls
  topSegmentBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 4,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
  },

  // Mode Switcher
  intakeModeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modeBtnActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primaryLight,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeBtnTextActive: {
    color: colors.primaryLight,
    fontWeight: '800',
  },

  // Preset Card
  presetCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  presetCardHeader: {
    marginBottom: spacing.sm,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryLight,
  },
  presetHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },

  // Model chips horizontal scroll
  modelHorizontalScroll: {
    marginVertical: 4,
  },
  modelChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modelChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  modelChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modelChipTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },
  techChipSelected: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  techChipTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },

  // Main Fault Categories
  mainFaultsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  mainFaultItem: {
    marginBottom: 4,
  },
  mainFaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  mainFaultBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  mainFaultText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  mainFaultTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },
  expandArrowBtn: {
    paddingHorizontal: 6,
    marginLeft: 4,
  },
  expandArrowText: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Sub-faults Container
  subFaultsContainer: {
    backgroundColor: colors.background,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  subFaultChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  subFaultChipSelected: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryLight,
  },
  subFaultText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  subFaultTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },

  // Autocomplete Input
  autocompleteInputRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  autocompleteInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  addCustomBtn: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  addCustomBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Suggestions Box
  suggestionsBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryLight,
    marginBottom: 4,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  suggestionChipAdded: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryLight,
  },
  suggestionChipText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  // Active Faults Box
  activeFaultsBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
    marginTop: spacing.xs,
  },
  activeFaultsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  activeFaultsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  faultActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  faultActiveChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  faultActiveRemove: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  noFaultsText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Meta Inputs
  metaRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  metaInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  // Scanner Action Card
  scannerActionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  scannerCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  scannerCardSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  openScannerBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  openScannerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  manualImeiRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  manualImeiInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  addManualBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  addManualBtnText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 12,
  },

  // Batch List Card
  batchListCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  batchListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  batchListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  batchListSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  clearBatchBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearBatchBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBatchBox: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyBatchIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyBatchText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyBatchSubText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  batchItemRow: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  batchItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchItemIndexBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  batchItemIndexText: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 12,
  },
  batchItemImei: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  batchItemModel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  deleteRowBtn: {
    padding: 6,
  },
  deleteRowBtnText: {
    fontSize: 16,
  },
  returnClaimRowBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: borderRadius.sm,
    padding: 6,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  returnClaimRowBadgeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  returnClaimRowBadgeSub: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  rowFaultsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  rowFaultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rowFaultText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginRight: 4,
  },
  rowFaultRemove: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '800',
  },
  addExtraFaultBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  addExtraFaultBtnText: {
    fontSize: 10,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  submitBatchBtn: {
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBatchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Return / Dispatch Tab Styles
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },
  sentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  sentModelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sentImei: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  techHolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
    flexWrap: 'wrap',
    gap: 6,
  },
  techHolderLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  techHolderName: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
  handoverPendingBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: '#eab308',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  handoverPendingBadgeText: {
    color: '#eab308',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeLive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  badgeLiveText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.xs,
  },
  jobNumber: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priorityText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '700',
  },
  returnSearchInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginTop: spacing.sm,
  },
  bulkReturnBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  bulkReturnBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  dispatchCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  dispatchCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxTouch: {
    marginRight: spacing.sm,
    paddingTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryLight,
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  dispatchModel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  dispatchJobNum: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
    marginTop: 2,
  },
  dispatchImei: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  dispatchCustomer: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  dispatchMetaBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
    marginVertical: spacing.sm,
  },
  dispatchMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dispatchActionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  dispatchActionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  dispatchedBadge: {
    backgroundColor: colors.successBackground,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  dispatchedBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
  },

  // History Tab Styles
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  historyModel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  historyJobNumber: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
    marginTop: 2,
  },
  historyImei: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  historyCustomer: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: spacing.sm,
  },
  historyDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },

  // Scanner Modal
  scannerModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.md,
  },
  scannerTopBar: {
    alignItems: 'center',
    width: '100%',
  },
  scannerTopTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  scannerTopSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scannerBanner: {
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginTop: 8,
  },
  scannerBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  viewfinderBox: {
    width: 280,
    height: 160,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    backgroundColor: 'rgba(0,0,0,0.1)',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderCornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 20,
    height: 20,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primaryLight,
  },
  viewfinderCornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primaryLight,
  },
  viewfinderCornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primaryLight,
  },
  viewfinderCornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primaryLight,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#ef4444',
  },
  reticleHintText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  scannerBottomControls: {
    alignItems: 'center',
    width: '100%',
  },
  scannedCountText: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  closeScannerModalBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  closeScannerModalBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Generic Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalCardSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  modalDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  modalDoneBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Handover Sheet
  partsInputRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  addPartBtn: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  addPartBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  partItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginVertical: 2,
  },
  partItemText: {
    color: colors.textPrimary,
    fontSize: 12,
  },
  confirmReturnBtn: {
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  confirmReturnBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  cancelReturnBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cancelReturnBtnText: {
    color: colors.textMuted,
    fontSize: 13,
  },

  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
