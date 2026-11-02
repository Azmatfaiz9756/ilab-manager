import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { printSingleDeviceLabel } from '../services/labelPrinter';

export const IMEISearchScreen: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [deviceDetailLoading, setDeviceDetailLoading] = useState(false);

  // Scanner modal state
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const lastScanTimeRef = useRef<number>(0);

  const handleSearch = async (termOverride?: string) => {
    const term = (termOverride !== undefined ? termOverride : searchTerm).trim();
    if (!term) return;
    setSearching(true);
    setSelectedDevice(null);
    try {
      const res = await apiRequest(`/devices?search=${encodeURIComponent(term)}`);
      setSearchResults(res.data || []);
      if ((res.data || []).length === 1) {
        handleSelectDevice(res.data[0].id);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDevice = async (id: string) => {
    setDeviceDetailLoading(true);
    try {
      const res = await apiRequest(`/devices/${id}`);
      setSelectedDevice(res.data);
    } catch {
      setSelectedDevice(null);
    } finally {
      setDeviceDetailLoading(false);
    }
  };

  const openCameraScanner = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Permission Required', 'Camera access is required to scan IMEI barcodes.');
        return;
      }
    }
    setScannerOpen(true);
  };

  const handleBarcodeScanned = (event: any) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;

    const data = (event.data || '').trim();
    if (!data) return;

    const matches = data.match(/\b\d{15}\b/g);
    let candidateImei = '';
    if (matches && matches.length > 0) {
      candidateImei = matches[0];
    } else {
      const digits = data.replace(/\D/g, '');
      if (digits.length >= 15) candidateImei = digits.slice(0, 15);
    }

    if (candidateImei && candidateImei.length === 15) {
      setScannerOpen(false);
      setSearchTerm(candidateImei);
      handleSearch(candidateImei);
    }
  };

  const handlePrintLabel = async (dev: any) => {
    const primaryImei = dev.imeis?.find((i: any) => i.isPrimary)?.imei || dev.imeis?.[0]?.imei || 'N/A';
    const faultNames = (dev.faults || []).map((df: any) => df.fault?.name || df.customFaultName).filter(Boolean);
    try {
      await printSingleDeviceLabel({
        imei: primaryImei,
        modelName: dev.model?.name || 'iPhone',
        jobNumber: dev.repairJobs?.[0]?.jobNumber || 'N/A',
        faults: faultNames,
        priority: dev.priority || 'NORMAL',
      });
      Alert.alert('Label Printed', `Thermal label dispatched for ${primaryImei}`);
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Could not print label');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>IMEI & History Search</Text>

      {/* Search Input Bar + Scanner Button */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter IMEI, Serial, or Job ID..."
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => handleSearch()}
        />
        <TouchableOpacity style={styles.scannerIconBtn} onPress={openCameraScanner}>
          <Text style={{ fontSize: 18 }}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch()} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {/* Results List */}
      {!selectedDevice && (
        <View>
          {searchResults.length === 0 && !searching && searchTerm.length > 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No device found matching "{searchTerm}"</Text>
            </View>
          )}

          {searchResults.map((device) => {
            const primaryImei = device.imeis.find((i: any) => i.isPrimary)?.imei || device.imeis[0]?.imei;
            return (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                onPress={() => handleSelectDevice(device.id)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.modelName}>{device.model?.name}</Text>
                  <StatusBadge status={device.currentStatus} size="sm" />
                </View>
                <Text style={styles.imeiText}>IMEI: {primaryImei}</Text>
                <Text style={styles.statsText}>
                  Repairs: {device.totalRepairCount} • Returns: {device.totalReturnCount} • Dept: {device.currentDepartment}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Device Profile & Chronological Timeline */}
      {deviceDetailLoading && <ActivityIndicator color={colors.primaryLight} size="large" style={{ marginVertical: 20 }} />}

      {selectedDevice && (
        <View style={styles.profileContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedDevice(null)}>
              <Text style={styles.backBtnText}>← Back to search results</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.printLabelBtn} onPress={() => handlePrintLabel(selectedDevice)}>
              <Text style={styles.printLabelBtnText}>🖨️ Print Label</Text>
            </TouchableOpacity>
          </View>

          {/* Profile Card */}
          <View style={styles.profileCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.profileTitle}>{selectedDevice.model?.name}</Text>
              <StatusBadge status={selectedDevice.currentStatus} size="sm" />
            </View>
            <Text style={styles.profileImei}>IMEI 1: {selectedDevice.imeis?.[0]?.imei}</Text>
            {selectedDevice.imeis?.[1] && <Text style={styles.profileImei}>IMEI 2: {selectedDevice.imeis[1].imei}</Text>}
            <Text style={styles.profileMeta}>Department: {selectedDevice.currentDepartment}</Text>
            <Text style={styles.profileMeta}>
              Total Repairs: {selectedDevice.totalRepairCount} | Returns: {selectedDevice.totalReturnCount}
            </Text>
            {selectedDevice.initialNotes && (
              <Text style={styles.profileNotes}>Notes: {selectedDevice.initialNotes}</Text>
            )}

            {/* Diagnosed Faults */}
            {(selectedDevice.faults || []).length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sectionSmallTitle}>Diagnosed Faults:</Text>
                <View style={styles.faultChipsRow}>
                  {selectedDevice.faults.map((f: any, idx: number) => (
                    <View key={f.id || idx} style={styles.faultChip}>
                      <Text style={styles.faultChipText}>{f.fault?.name || f.customFaultName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Complete Repair History */}
          <Text style={styles.timelineHeader}>🔧 Repair Jobs & Service History</Text>
          {(selectedDevice.repairJobs || []).length === 0 ? (
            <Text style={styles.emptyTextSmall}>No repair jobs recorded yet.</Text>
          ) : (
            (selectedDevice.repairJobs || []).map((job: any) => (
              <View key={job.id} style={styles.jobHistoryCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.jobHistoryNumber}>{job.jobNumber}</Text>
                  <StatusBadge status={job.status} size="sm" />
                </View>
                <Text style={styles.jobHistoryDate}>{new Date(job.createdAt).toLocaleString()}</Text>

                {/* Assigned Technician */}
                {job.assignments?.[0]?.technician && (
                  <Text style={styles.jobHistoryTech}>
                    Technician: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{job.assignments[0].technician.name}</Text>
                  </Text>
                )}

                {/* Attempt diagnosis & work performed */}
                {job.attempts?.[0] && (
                  <View style={styles.attemptBox}>
                    {job.attempts[0].diagnosis && (
                      <Text style={styles.attemptText}>
                        <Text style={{ fontWeight: '700', color: colors.primaryLight }}>Diagnosis: </Text>
                        {job.attempts[0].diagnosis}
                      </Text>
                    )}
                    {job.attempts[0].workPerformed && (
                      <Text style={styles.attemptText}>
                        <Text style={{ fontWeight: '700', color: colors.success }}>Work Done: </Text>
                        {job.attempts[0].workPerformed}
                      </Text>
                    )}
                    {job.attempts[0].componentsReplaced && (
                      <Text style={styles.attemptText}>
                        <Text style={{ fontWeight: '700', color: colors.warning }}>Parts Replaced: </Text>
                        {job.attempts[0].componentsReplaced}
                      </Text>
                    )}
                  </View>
                )}

                {/* Parts Used */}
                {(job.parts || []).length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Spare Parts Used:</Text>
                    {job.parts.map((p: any, idx: number) => (
                      <Text key={p.id || idx} style={{ fontSize: 12, color: colors.textPrimary }}>
                        • {p.partName} - {p.cost ? `${p.cost}` : 'Stock'} ({p.status})
                      </Text>
                    ))}
                  </View>
                )}

                {/* QC Inspection Notes */}
                {(job.qcInspections || []).length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>QC Inspections:</Text>
                    {job.qcInspections.map((qc: any, idx: number) => (
                      <Text key={qc.id || idx} style={{ fontSize: 12, color: qc.decision === 'QC_PASSED' ? colors.success : colors.danger }}>
                        • [{qc.decision}]: {qc.notes || qc.failureReason || 'Inspected'} by {qc.qcTechnician?.name || 'QC'}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}

          {/* Movement Timeline */}
          <Text style={[styles.timelineHeader, { marginTop: spacing.lg }]}>📍 Movement & Custody Timeline</Text>
          {(selectedDevice.movements || []).length === 0 ? (
            <Text style={styles.emptyTextSmall}>No movement history logged.</Text>
          ) : (
            (selectedDevice.movements || []).map((m: any, idx: number) => (
              <View key={m.id || idx} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineDate}>{new Date(m.movedAt).toLocaleString()}</Text>
                  <Text style={styles.timelineReason}>{m.reason}</Text>
                  <Text style={styles.timelineRoute}>
                    {m.fromDepartment} → {m.toDepartment}
                  </Text>
                  {m.notes && <Text style={styles.timelineNotes}>"{m.notes}"</Text>}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Camera Barcode Scanner Modal */}
      <Modal visible={scannerOpen} animationType="fade" transparent onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerModalContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>📷 Scan Device IMEI Barcode</Text>
            <TouchableOpacity onPress={() => setScannerOpen(false)} style={styles.scannerCloseBtn}>
              <Text style={styles.scannerCloseBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.scannerFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['code128', 'code39', 'qr', 'ean13', 'upc_a'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.viewfinderGuide} />
          </View>
          <View style={styles.scannerFooter}>
            <Text style={styles.scannerHint}>Align the IMEI barcode inside the viewfinder box</Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 110,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchBarContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    fontSize: 14,
  },
  scannerIconBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyTextSmall: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  deviceCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  imeiText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statsText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  profileContainer: {
    marginTop: spacing.sm,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backBtnText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 14,
  },
  printLabelBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
  },
  printLabelBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  profileCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileImei: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 3,
  },
  profileMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },
  profileNotes: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 5,
    fontStyle: 'italic',
  },
  sectionSmallTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  faultChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  faultChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  faultChipText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  timelineHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  jobHistoryCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  jobHistoryNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primaryLight,
  },
  jobHistoryDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  jobHistoryTech: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  attemptBox: {
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  attemptText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 5,
    marginRight: 10,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  timelineDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  timelineReason: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  timelineRoute: {
    fontSize: 12,
    color: colors.primaryLight,
    marginTop: 2,
  },
  timelineNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  scannerModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scannerCloseBtn: {
    padding: 8,
    backgroundColor: '#333',
    borderRadius: 6,
  },
  scannerCloseBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  scannerFrame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderGuide: {
    width: 260,
    height: 140,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannerFooter: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  scannerHint: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
  },
});
