import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { maskIMEI, DeviceStatus } from '../shared';

export const MyRepairsScreen: React.FC = () => {
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [componentsReplaced, setComponentsReplaced] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [partsDesc, setPartsDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter mode for Hardware Technician Workbench (defaults to INCOMING so handovers are immediately visible)
  const [filterMode, setFilterMode] = useState<'INCOMING' | 'ACTIVE' | 'RETURNS' | 'ALL'>('INCOMING');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my_repairs_list'],
    queryFn: () => apiRequest('/repairs/my-repairs'),
    refetchInterval: 4000,
  });

  const jobs = data?.data || [];

  const incomingJobs = jobs.filter(
    (j: any) =>
      j.status === DeviceStatus.ASSIGNED_TO_TECHNICIAN ||
      j.status === DeviceStatus.WAITING_FOR_ASSIGNMENT
  );
  const returnJobs = jobs.filter((j: any) => j.isReturnClaim);
  const activeJobs = jobs.filter(
    (j: any) =>
      j.status === DeviceStatus.ACCEPTED_BY_TECHNICIAN ||
      j.status === DeviceStatus.REPAIR_IN_PROGRESS ||
      j.status === DeviceStatus.ON_HOLD ||
      j.status === DeviceStatus.PARTS_REQUIRED ||
      j.status === DeviceStatus.RETURN_TO_TECHNICIAN
  );

  // Auto switch to INCOMING if incoming items arrive
  React.useEffect(() => {
    if (incomingJobs.length > 0 && activeJobs.length === 0 && filterMode === 'ACTIVE') {
      setFilterMode('INCOMING');
    }
  }, [incomingJobs.length, activeJobs.length]);

  const displayedJobs =
    filterMode === 'INCOMING'
      ? incomingJobs
      : filterMode === 'ACTIVE'
      ? activeJobs
      : filterMode === 'RETURNS'
      ? returnJobs
      : jobs;

  const handleAcceptSingle = async (jobId: string) => {
    setSubmitting(true);
    try {
      await apiRequest(`/repairs/${jobId}/accept`, { method: 'POST' });
      await apiRequest(`/repairs/${jobId}/start`, { method: 'POST', body: JSON.stringify({}) });
      Alert.alert('Custody Accepted', 'Board accepted into active workbench!');
      refetch();
    } catch (err: any) {
      Alert.alert('Accept Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptAll = async () => {
    if (incomingJobs.length === 0) return;
    setSubmitting(true);
    try {
      for (const j of incomingJobs) {
        await apiRequest(`/repairs/${j.id}/accept`, { method: 'POST' });
        await apiRequest(`/repairs/${j.id}/start`, { method: 'POST', body: JSON.stringify({}) });
      }
      Alert.alert('Batch Handover Complete', `Successfully accepted all ${incomingJobs.length} boards into active workbench.`);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: string) => {
    if (!activeJob) return;
    setSubmitting(true);
    try {
      let endpoint = `/repairs/${activeJob.id}/${action}`;
      let body: any = {};

      if (action === 'submit-qc') {
        if (!diagnosis.trim() || !workPerformed.trim() || !notes.trim()) {
          Alert.alert('Required', 'Diagnosis, work performed, and repair notes are required to submit to QC.');
          setSubmitting(false);
          return;
        }
        body = {
          diagnosis,
          workPerformed,
          repairNotes: notes,
          componentsReplaced: componentsReplaced.trim() || undefined,
        };
      } else if (action === 'not-possible') {
        if (!reason.trim()) {
          Alert.alert('Required', 'Reason is required for marking repair not possible.');
          setSubmitting(false);
          return;
        }
        body = { reason, notes };
      } else if (action === 'parts-required') {
        if (!partsDesc.trim()) {
          Alert.alert('Required', 'Parts description is required.');
          setSubmitting(false);
          return;
        }
        body = { partsDescription: partsDesc, notes };
      }

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      Alert.alert('Success', `Action '${action}' recorded successfully`);
      setModalAction(null);
      setActiveJob(null);
      setDiagnosis('');
      setWorkPerformed('');
      setComponentsReplaced('');
      setNotes('');
      setReason('');
      setPartsDesc('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Hardware Workbench</Text>
          <Text style={styles.headerSubtitle}>Board Level Repair Operations</Text>
        </View>
        <View style={styles.liveSyncBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>SYNCED</Text>
        </View>
      </View>

      {/* Segmented Filter Bar */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, filterMode === 'INCOMING' && styles.segmentBtnActive]}
          onPress={() => setFilterMode('INCOMING')}
        >
          <Text style={[styles.segmentText, filterMode === 'INCOMING' && styles.segmentTextActive]}>
            📥 Incoming ({incomingJobs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, filterMode === 'ACTIVE' && styles.segmentBtnActive]}
          onPress={() => setFilterMode('ACTIVE')}
        >
          <Text style={[styles.segmentText, filterMode === 'ACTIVE' && styles.segmentTextActive]}>
            ⚡ Active ({activeJobs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, filterMode === 'RETURNS' && styles.segmentBtnActive]}
          onPress={() => setFilterMode('RETURNS')}
        >
          <Text style={[styles.segmentText, filterMode === 'RETURNS' && styles.segmentTextActive]}>
            🔴 Returns ({returnJobs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, filterMode === 'ALL' && styles.segmentBtnActive]}
          onPress={() => setFilterMode('ALL')}
        >
          <Text style={[styles.segmentText, filterMode === 'ALL' && styles.segmentTextActive]}>
            All ({jobs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bulk Custody Handover Banner */}
      {incomingJobs.length > 0 && (
        <View style={styles.handoverBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.handoverBannerTitle}>Handover from QC Awaiting Custody</Text>
            <Text style={styles.handoverBannerSub}>{incomingJobs.length} devices ready to be taken on bench</Text>
          </View>
          <TouchableOpacity
            style={styles.handoverAcceptAllBtn}
            onPress={handleAcceptAll}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.handoverAcceptAllText}>🤝 Accept All ({incomingJobs.length})</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Main List */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefetching}
            onRefresh={() => { refetch(); }}
            tintColor={colors.primaryLight}
          />
        }
      >
        {displayedJobs.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛠️</Text>
            <Text style={styles.emptyTitle}>No Devices in This Section</Text>
            <Text style={styles.emptyText}>
              {filterMode === 'INCOMING'
                ? 'No pending handovers from QC technicians.'
                : filterMode === 'RETURNS'
                ? 'No return claim devices assigned.'
                : 'Your workbench is clear. Check incoming handovers!'}
            </Text>
          </View>
        )}

        {displayedJobs.map((job: any) => {
          const device = job.device || {};
          const primaryImei = device.imeis?.find((i: any) => i.isPrimary)?.imei || device.imeis?.[0]?.imei || 'NO-IMEI';
          const isReturn = job.isReturnClaim;
          const isIncoming =
            job.status === DeviceStatus.ASSIGNED_TO_TECHNICIAN ||
            job.status === DeviceStatus.WAITING_FOR_ASSIGNMENT;

          return (
            <View
              key={job.id}
              style={[styles.jobCard, isReturn && styles.returnClaimCardBorder]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveJob(job)}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.modelName}>{device.model?.name || 'iPhone Device'}</Text>
                    <Text style={styles.imeiText}>IMEI: {maskIMEI(primaryImei)}</Text>
                  </View>
                  <StatusBadge status={job.status} />
                </View>

                {/* Return Claim Alert Badge */}
                {isReturn && (
                  <View style={styles.returnBadge}>
                    <Text style={styles.returnBadgeText}>
                      🔴 RETURN CLAIM: {job.returnClaim?.claimType || 'SAME FAULT'}
                    </Text>
                    {job.returnClaim?.previousRepairJob && (
                      <Text style={styles.returnSubText}>
                        Prev Tech: {job.returnClaim.previousRepairJob.assignments?.[0]?.technician?.name || 'Unknown'} | Job #{job.returnClaim.previousRepairJob.jobNumber}
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.jobNumber}>Job #{job.jobNumber}</Text>
                  <Text style={[styles.priorityText, device.priority === 'URGENT' && { color: colors.danger }]}>
                    {device.priority || 'NORMAL'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Quick Inline Action for Incoming Devices */}
              {isIncoming ? (
                <View style={styles.inlineActionRow}>
                  <TouchableOpacity
                    style={styles.quickAcceptBtn}
                    onPress={() => handleAcceptSingle(job.id)}
                    disabled={submitting}
                  >
                    <Text style={styles.quickAcceptText}>🤝 Accept Custody & Start Repair</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.inlineActionRow}>
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={() => setActiveJob(job)}
                  >
                    <Text style={styles.manageBtnText}>⚡ Manage Repair / Submit QC ➔</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* DETAIL / WORKFLOW MODAL */}
      <Modal visible={!!activeJob} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {activeJob && (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.modalTitle}>{activeJob.device?.model?.name}</Text>
                    <StatusBadge status={activeJob.status} />
                  </View>
                  <Text style={styles.modalSubtitle}>Job #{activeJob.jobNumber}</Text>

                  {/* Previous Repair Warning for Return Claims */}
                  {activeJob.isReturnClaim && (
                    <View style={styles.historyBox}>
                      <Text style={styles.historyBoxTitle}>⚠️ RETURN CLAIM AUDIT</Text>
                      <Text style={styles.historyText}>
                        Type: {activeJob.returnClaim?.claimType || 'SAME FAULT'}
                      </Text>
                      {activeJob.returnClaim?.previousRepairJob && (
                        <>
                          <Text style={styles.historyText}>
                            Previous Tech: {activeJob.returnClaim.previousRepairJob.assignments?.[0]?.technician?.name || 'N/A'}
                          </Text>
                          <Text style={styles.historyText}>
                            Previous Diagnosis: {activeJob.returnClaim.previousRepairJob.attempts?.[0]?.diagnosis || 'N/A'}
                          </Text>
                        </>
                      )}
                    </View>
                  )}

                  {/* Dynamic Workflow Actions */}
                  {modalAction === null && (
                    <View style={styles.actionsContainer}>
                      {activeJob.status === DeviceStatus.ASSIGNED_TO_TECHNICIAN && (
                        <TouchableOpacity
                          style={styles.actionBtnPrimary}
                          onPress={() => handleAction('accept')}
                          disabled={submitting}
                        >
                          <Text style={styles.actionBtnText}>🤝 Accept Custody</Text>
                        </TouchableOpacity>
                      )}

                      {(activeJob.status === DeviceStatus.ACCEPTED_BY_TECHNICIAN ||
                        activeJob.status === DeviceStatus.ON_HOLD ||
                        activeJob.status === DeviceStatus.RETURN_TO_TECHNICIAN) && (
                        <TouchableOpacity
                          style={styles.actionBtnPrimary}
                          onPress={() => handleAction('start')}
                          disabled={submitting}
                        >
                          <Text style={styles.actionBtnText}>▶️ Start Repair Work</Text>
                        </TouchableOpacity>
                      )}

                      {activeJob.status === DeviceStatus.REPAIR_IN_PROGRESS && (
                        <>
                          <TouchableOpacity
                            style={styles.actionBtnSuccess}
                            onPress={() => setModalAction('submit-qc')}
                          >
                            <Text style={styles.actionBtnText}>✅ Complete & Submit to QC</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnWarning}
                            onPress={() => setModalAction('parts-required')}
                          >
                            <Text style={styles.actionBtnText}>📦 Request Parts</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnSecondary}
                            onPress={() => handleAction('hold')}
                            disabled={submitting}
                          >
                            <Text style={styles.actionBtnText}>⏸️ Put on Hold</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnDanger}
                            onPress={() => setModalAction('not-possible')}
                          >
                            <Text style={styles.actionBtnText}>❌ Mark Not Possible (BER)</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  {/* Form for Submit to QC */}
                  {modalAction === 'submit-qc' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>Submit Repaired Board to QC</Text>
                      
                      <Text style={styles.label}>Diagnosis (Problem Found) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Short on VDD_MAIN line capacitor"
                        placeholderTextColor={colors.textMuted}
                        value={diagnosis}
                        onChangeText={setDiagnosis}
                      />

                      <Text style={styles.label}>Work Performed (Kiya Kiya) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Removed shorted C3100, reballed PMIC"
                        placeholderTextColor={colors.textMuted}
                        value={workPerformed}
                        onChangeText={setWorkPerformed}
                      />

                      <Text style={styles.label}>Parts Replaced / Added (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. U3300 IC, Resistor 100k, Jumper wire"
                        placeholderTextColor={colors.textMuted}
                        value={componentsReplaced}
                        onChangeText={setComponentsReplaced}
                      />

                      <Text style={styles.label}>Repair Notes for QC Inspector *</Text>
                      <TextInput
                        style={[styles.input, { minHeight: 60 }]}
                        placeholder="Full technical notes for testing..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        value={notes}
                        onChangeText={setNotes}
                      />

                      <TouchableOpacity
                        style={styles.actionBtnSuccess}
                        onPress={() => handleAction('submit-qc')}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.actionBtnText}>🚀 Confirm Submission to QC</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtnSecondary, { marginTop: 8 }]}
                        onPress={() => setModalAction(null)}
                      >
                        <Text style={styles.actionBtnText}>Back</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Form for Not Possible */}
                  {modalAction === 'not-possible' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>Mark Repair Not Possible</Text>
                      <Text style={styles.label}>Clear Technical Reason *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Internal board layer delamination under CPU"
                        placeholderTextColor={colors.textMuted}
                        value={reason}
                        onChangeText={setReason}
                      />
                      <TouchableOpacity
                        style={styles.actionBtnDanger}
                        onPress={() => handleAction('not-possible')}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.actionBtnText}>Confirm Not Possible</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtnSecondary, { marginTop: 8 }]}
                        onPress={() => setModalAction(null)}
                      >
                        <Text style={styles.actionBtnText}>Back</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Form for Parts Required */}
                  {modalAction === 'parts-required' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formTitle}>Parts Required Form</Text>
                      <Text style={styles.label}>Parts Description *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. iPhone 14 Pro Max Charging IC (U3300)"
                        placeholderTextColor={colors.textMuted}
                        value={partsDesc}
                        onChangeText={setPartsDesc}
                      />
                      <TouchableOpacity
                        style={styles.actionBtnWarning}
                        onPress={() => handleAction('parts-required')}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.actionBtnText}>Submit Parts Request</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtnSecondary, { marginTop: 8 }]}
                        onPress={() => setModalAction(null)}
                      >
                        <Text style={styles.actionBtnText}>Back</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setModalAction(null);
                setActiveJob(null);
              }}
            >
              <Text style={styles.closeBtnText}>Close Window</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 5,
  },
  liveText: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '800',
  },
  segmentedContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginVertical: spacing.sm,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  handoverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    gap: 8,
  },
  handoverBannerTitle: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 13,
  },
  handoverBannerSub: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  handoverAcceptAllBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoverAcceptAllText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 110,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  returnClaimCardBorder: {
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  imeiText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  returnBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'stretch',
    marginVertical: 6,
  },
  returnBadgeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  returnSubText: {
    color: colors.textPrimary,
    fontSize: 10,
    marginTop: 2,
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
  inlineActionRow: {
    marginTop: 10,
  },
  quickAcceptBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  quickAcceptText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  manageBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  manageBtnText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  historyBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.md,
  },
  historyBoxTitle: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 4,
  },
  historyText: {
    color: colors.textPrimary,
    fontSize: 11,
    marginBottom: 2,
  },
  actionsContainer: {
    gap: 8,
    marginTop: spacing.sm,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnSuccess: {
    backgroundColor: colors.success,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnWarning: {
    backgroundColor: colors.warning,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  actionBtnDanger: {
    backgroundColor: colors.danger,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  closeBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  formContainer: {
    marginTop: spacing.sm,
  },
  formTitle: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    padding: 10,
    fontSize: 13,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
});
