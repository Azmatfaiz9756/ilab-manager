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
import { useSettingsStore } from '../store/settingsStore';
import { printSingleDeviceLabel } from '../services/labelPrinter';

export const MyRepairsScreen: React.FC = () => {
  const { formatMoney, printerWidth, labName, labPhone, currency } = useSettingsStore();
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [componentsReplaced, setComponentsReplaced] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [partsDesc, setPartsDesc] = useState('');
  const [repairCostInput, setRepairCostInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quick Inline Note & Cost Modals
  const [newNoteModalJob, setNewNoteModalJob] = useState<any | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [costModalJob, setCostModalJob] = useState<any | null>(null);
  const [directCostInput, setDirectCostInput] = useState('');

  // Filter mode for Hardware Technician Workbench (defaults to INCOMING so handovers are immediately visible)
  const [filterMode, setFilterMode] = useState<'INCOMING' | 'ACTIVE' | 'RETURNS' | 'EARNINGS' | 'ALL'>('INCOMING');

  const handlePrintLabel = async (job: any) => {
    const dev = job.device || {};
    const primaryImei = dev.imeis?.find((i: any) => i.isPrimary)?.imei || dev.imeis?.[0]?.imei || 'NO-IMEI';
    const faultNames = (dev.faults || []).map((f: any) => f.fault?.name || f.customFaultName || 'Fault');

    await printSingleDeviceLabel(
      {
        jobNumber: job.jobNumber,
        imei: primaryImei,
        modelName: dev.model?.name || 'iPhone',
        faults: faultNames,
        customerName: dev.receivedFrom || job.customerName || undefined,
        priority: dev.priority || 'NORMAL',
      },
      { labName, labPhone, paperWidth: printerWidth }
    );
  };

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my_repairs_list'],
    queryFn: () => apiRequest('/repairs/my-repairs'),
    refetchInterval: 4000,
  });

  const { data: payoutData, refetch: refetchPayouts } = useQuery({
    queryKey: ['tech_payout_summary'],
    queryFn: () => apiRequest('/repairs/payouts/summary'),
    refetchInterval: 5000,
  });
  const payoutSummary = payoutData?.data;

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
      const res = await apiRequest('/repairs/batch-accept', {
        method: 'POST',
        body: JSON.stringify({
          jobIds: incomingJobs.map((j: any) => j.id),
        }),
      });
      const acceptedCount = res.data?.acceptedCount || incomingJobs.length;
      Alert.alert(
        'Batch Handover Complete',
        `Successfully accepted all ${acceptedCount} boards into your active workbench.`
      );
      refetch();
    } catch (err: any) {
      Alert.alert('Batch Handover Error', err.message || 'Failed to accept batch');
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
          repairCost: repairCostInput ? parseFloat(repairCostInput) : undefined,
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
      setRepairCostInput('');
      refetch();
      refetchPayouts();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRepairNote = async () => {
    if (!newNoteModalJob || !newNoteText.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest(`/repairs/${newNoteModalJob.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNoteText.trim() }),
      });
      Alert.alert('Note Saved', 'Repair work note successfully added to device record.');
      setNewNoteModalJob(null);
      setNewNoteText('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRepairCost = async () => {
    if (!costModalJob) return;
    const cost = parseFloat(directCostInput);
    if (isNaN(cost) || cost < 0) {
      Alert.alert('Invalid Cost', 'Please enter a valid numeric repair earning amount.');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/repairs/${costModalJob.id}/cost`, {
        method: 'PATCH',
        body: JSON.stringify({ repairCost: cost }),
      });
      Alert.alert('Cost Updated', `Repair cost set to ${formatMoney(cost)}. Manager and ledger updated.`);
      setCostModalJob(null);
      setDirectCostInput('');
      refetch();
      refetchPayouts();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptPayout = async (payoutId: string) => {
    setSubmitting(true);
    try {
      await apiRequest(`/repairs/payouts/${payoutId}/accept`, { method: 'POST' });
      Alert.alert('Payout Confirmed', 'You have accepted the payment. Your balance ledger is now updated!');
      refetchPayouts();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPayout = async (payoutId: string) => {
    Alert.prompt
      ? Alert.prompt('Dispute Payout', 'Enter reason for disputing this payment:', async (disputeReason) => {
          if (!disputeReason) return;
          try {
            await apiRequest(`/repairs/payouts/${payoutId}/reject`, {
              method: 'POST',
              body: JSON.stringify({ reason: disputeReason }),
            });
            Alert.alert('Dispute Logged', 'Manager notified of payment discrepancy.');
            refetchPayouts();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        })
      : Alert.alert('Dispute', 'Please inform the lab manager regarding payment discrepancy.');
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
          style={[styles.segmentBtn, filterMode === 'EARNINGS' && styles.segmentBtnActive]}
          onPress={() => setFilterMode('EARNINGS')}
        >
          <Text style={[styles.segmentText, filterMode === 'EARNINGS' && styles.segmentTextActive]}>
            💰 Ledger {payoutSummary ? `(${formatMoney(payoutSummary.balanceDue)})` : ''}
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
            onRefresh={() => {
              refetch();
              refetchPayouts();
            }}
            tintColor={colors.primaryLight}
          />
        }
      >
        {/* ---------------------------------------------------------------- */}
        {/* EARNINGS & PAYOUTS LEDGER VIEW                                   */}
        {/* ---------------------------------------------------------------- */}
        {filterMode === 'EARNINGS' && (
          <View style={styles.ledgerContainer}>
            {/* 3 Metric Cards */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, { borderLeftColor: '#38bdf8' }]}>
                <Text style={styles.metricLabel}>Total Work Done</Text>
                <Text style={[styles.metricVal, { color: '#38bdf8' }]}>
                  {formatMoney(payoutSummary?.totalWorkDone || 0)}
                </Text>
                <Text style={styles.metricSub}>{payoutSummary?.completedJobsCount || 0} repairs completed</Text>
              </View>

              <View style={[styles.metricCard, { borderLeftColor: '#22c55e' }]}>
                <Text style={styles.metricLabel}>Total Paid Out</Text>
                <Text style={[styles.metricVal, { color: '#22c55e' }]}>
                  {formatMoney(payoutSummary?.totalPaid || 0)}
                </Text>
                <Text style={styles.metricSub}>Confirmed accepted</Text>
              </View>

              <View style={[styles.metricCard, { borderLeftColor: '#f59e0b' }]}>
                <Text style={styles.metricLabel}>Balance Due</Text>
                <Text style={[styles.metricVal, { color: '#f59e0b' }]}>
                  {formatMoney(payoutSummary?.balanceDue || 0)}
                </Text>
                <Text style={styles.metricSub}>Pending from Lab</Text>
              </View>
            </View>

            {/* Pending Payouts from Manager Awaiting Acceptance */}
            <View style={styles.sectionHeaderBox}>
              <Text style={styles.sectionTitle}>
                💳 Pending Payouts ({payoutSummary?.payouts?.filter((p: any) => p.status === 'PENDING').length || 0})
              </Text>
              <Text style={styles.sectionSub}>Manager sent payments waiting for your receipt confirmation</Text>
            </View>

            {payoutSummary?.payouts?.filter((p: any) => p.status === 'PENDING').length === 0 ? (
              <View style={styles.emptyPayoutBox}>
                <Text style={styles.emptyPayoutText}>No pending payouts from manager right now.</Text>
              </View>
            ) : (
              payoutSummary?.payouts
                ?.filter((p: any) => p.status === 'PENDING')
                .map((payout: any) => (
                  <View key={payout.id} style={styles.pendingPayoutCard}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.pendingPayoutAmount}>{formatMoney(payout.amount)}</Text>
                      <Text style={styles.pendingPayoutMeta}>
                        Mode: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{payout.paymentMode}</Text> • By: {payout.paidBy?.name}
                      </Text>
                      {payout.notes && (
                        <Text style={styles.pendingPayoutNotes}>Note: {payout.notes}</Text>
                      )}
                      <Text style={styles.pendingPayoutDate}>
                        Initiated on {new Date(payout.paidAt).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.payoutBtnCol}>
                      <TouchableOpacity
                        style={styles.acceptPayoutBtn}
                        onPress={() => handleAcceptPayout(payout.id)}
                        disabled={submitting}
                      >
                        <Text style={styles.acceptPayoutBtnText}>🤝 Accept / Receive</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectPayoutBtn}
                        onPress={() => handleRejectPayout(payout.id)}
                        disabled={submitting}
                      >
                        <Text style={styles.rejectPayoutBtnText}>❌ Dispute</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}

            {/* Recent Completed Repairs & Labor Earnings */}
            <View style={[styles.sectionHeaderBox, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>
                🛠️ Completed Repairs & Labor Earning
              </Text>
              <Text style={styles.sectionSub}>Breakdown of repairs submitted & approved</Text>
            </View>

            {(!payoutSummary?.recentJobs || payoutSummary.recentJobs.length === 0) ? (
              <View style={styles.emptyPayoutBox}>
                <Text style={styles.emptyPayoutText}>No completed repair jobs recorded yet.</Text>
              </View>
            ) : (
              payoutSummary.recentJobs.map((rj: any) => (
                <View key={rj.id} style={styles.recentJobEarnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentJobModel}>{rj.device?.model?.name}</Text>
                    <Text style={styles.recentJobImei}>
                      IMEI: {maskIMEI(rj.device?.imeis?.[0]?.imei || 'NO-IMEI')} • #{rj.jobNumber}
                    </Text>
                    <Text style={styles.recentJobStatus}>Status: {rj.status}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.recentJobEarning}>
                      + {formatMoney(rj.repairCost || 0)}
                    </Text>
                    <Text style={styles.recentJobDate}>
                      {new Date(rj.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))
            )}

            {/* Payout History Ledger */}
            <View style={[styles.sectionHeaderBox, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>📜 Accepted Payout History</Text>
            </View>
            {payoutSummary?.payouts?.filter((p: any) => p.status === 'ACCEPTED').length === 0 ? (
              <View style={styles.emptyPayoutBox}>
                <Text style={styles.emptyPayoutText}>No past payouts recorded yet.</Text>
              </View>
            ) : (
              payoutSummary?.payouts
                ?.filter((p: any) => p.status === 'ACCEPTED')
                .map((payout: any) => (
                  <View key={payout.id} style={styles.historyPayoutRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyPayoutAmount}>{formatMoney(payout.amount)} ({payout.paymentMode})</Text>
                      <Text style={styles.historyPayoutMeta}>
                        Paid by {payout.paidBy?.name} • Received on {new Date(payout.acceptedAt || payout.paidAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.settledBadge}>✓ SETTLED</Text>
                  </View>
                ))
            )}
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* WORKBENCH CARDS LIST VIEW                                        */}
        {/* ---------------------------------------------------------------- */}
        {filterMode !== 'EARNINGS' && displayedJobs.length === 0 && !isLoading && (
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

        {filterMode !== 'EARNINGS' && displayedJobs.map((job: any) => {
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

                {/* Faults List */}
                {device.faults && device.faults.length > 0 && (
                  <View style={styles.cardFaultsWrap}>
                    {device.faults.map((f: any, idx: number) => (
                      <View key={idx} style={styles.cardFaultChip}>
                        <Text style={styles.cardFaultChipText}>
                          ⚡ {f.fault?.name || f.customFaultName}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Labor Earning Row */}
                <View style={styles.cardCostRow}>
                  <Text style={styles.cardCostLabel}>
                    Labor Earning:{' '}
                    <Text style={styles.cardCostValue}>
                      {job.repairCost ? formatMoney(job.repairCost) : 'Pending'}
                    </Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.cardPrintBtn}
                      onPress={() => handlePrintLabel(job)}
                    >
                      <Text style={styles.cardPrintBtnText}>🖨️ Label</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.setCostBtn}
                      onPress={() => {
                        setCostModalJob(job);
                        setDirectCostInput(job.repairCost ? String(job.repairCost) : '');
                      }}
                    >
                      <Text style={styles.setCostBtnText}>✏️ Set Cost</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Repair Work Performed Notes Section */}
                <View style={styles.cardNotesSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardNotesTitle}>
                      📝 Work Notes ({job.notes?.length || 0})
                    </Text>
                    <TouchableOpacity
                      style={styles.addNoteQuickBtn}
                      onPress={() => {
                        setNewNoteModalJob(job);
                        setNewNoteText('');
                      }}
                    >
                      <Text style={styles.addNoteQuickBtnText}>+ Add Work Note</Text>
                    </TouchableOpacity>
                  </View>
                  {job.notes && job.notes.length > 0 ? (
                    <View style={styles.latestNoteBox}>
                      <Text style={styles.latestNoteUser}>
                        {job.notes[0].user?.name || 'Technician'} (
                        {new Date(job.notes[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):
                      </Text>
                      <Text style={styles.latestNoteText} numberOfLines={2}>
                        {job.notes[0].note}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noNotesYet}>No notes logged yet. Tap + to record what work was done.</Text>
                  )}
                </View>

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

                  {/* All Repair Work Notes on This Device */}
                  <View style={styles.detailNotesCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={styles.detailNotesTitle}>
                        📝 Work Log & Notes ({activeJob.notes?.length || 0})
                      </Text>
                      <TouchableOpacity
                        style={styles.detailAddNoteBtn}
                        onPress={() => {
                          setNewNoteModalJob(activeJob);
                          setNewNoteText('');
                        }}
                      >
                        <Text style={styles.detailAddNoteBtnText}>+ Add Note</Text>
                      </TouchableOpacity>
                    </View>
                    {activeJob.notes && activeJob.notes.length > 0 ? (
                      activeJob.notes.map((n: any, idx: number) => (
                        <View key={n.id || idx} style={styles.detailNoteRow}>
                          <Text style={styles.detailNoteAuthor}>
                            👤 {n.user?.name || 'Technician'} • {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(n.createdAt).toLocaleDateString()}):
                          </Text>
                          <Text style={styles.detailNoteContent}>{n.note}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noNotesYet}>No notes logged yet. Tap + to record what work was done.</Text>
                    )}
                  </View>

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

                      <Text style={styles.label}>Repair Cost / Labor Earning ({currency})</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 750 (Leave blank if not applicable)"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={repairCostInput}
                        onChangeText={setRepairCostInput}
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

      {/* ADD REPAIR NOTE MODAL */}
      <Modal visible={!!newNoteModalJob} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.compactModalContent}>
            <Text style={styles.compactModalTitle}>
              📝 Add Work Note ({newNoteModalJob?.jobNumber})
            </Text>
            <Text style={styles.compactModalSub}>
              {newNoteModalJob?.device?.model?.name}
            </Text>
            <Text style={styles.label}>Work Details (Kya Kya Kaam Hua) *</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="e.g. Cleaned flux, checked VDD lines, reballed PMIC, tested 4.2V current draw normal..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={newNoteText}
              onChangeText={setNewNoteText}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 1 }]}
                onPress={handleAddRepairNote}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Save Note</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnSecondary, { flex: 1 }]}
                onPress={() => {
                  setNewNoteModalJob(null);
                  setNewNoteText('');
                }}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SET REPAIR COST MODAL */}
      <Modal visible={!!costModalJob} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.compactModalContent}>
            <Text style={styles.compactModalTitle}>
              💰 Set Repair Earning ({costModalJob?.jobNumber})
            </Text>
            <Text style={styles.compactModalSub}>
              {costModalJob?.device?.model?.name}
            </Text>
            <Text style={styles.label}>Technician Labor Earning ({currency}) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 750"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={directCostInput}
              onChangeText={setDirectCostInput}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 1 }]}
                onPress={handleUpdateRepairCost}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Save Cost</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnSecondary, { flex: 1 }]}
                onPress={() => {
                  setCostModalJob(null);
                  setDirectCostInput('');
                }}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
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

  // LEDGER & PAYOUTS STYLES
  ledgerContainer: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 2,
  },
  metricSub: {
    color: colors.textSecondary,
    fontSize: 9,
  },
  sectionHeaderBox: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionSub: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyPayoutBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  emptyPayoutText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  pendingPayoutCard: {
    backgroundColor: '#1e293b',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginVertical: 4,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingPayoutAmount: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '900',
  },
  pendingPayoutMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  pendingPayoutNotes: {
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  pendingPayoutDate: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  payoutBtnCol: {
    gap: 6,
  },
  acceptPayoutBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  acceptPayoutBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  rejectPayoutBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rejectPayoutBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 10,
  },
  recentJobEarnRow: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  recentJobModel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  recentJobImei: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  recentJobStatus: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
  },
  recentJobEarning: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '900',
  },
  recentJobDate: {
    color: colors.textMuted,
    fontSize: 10,
  },
  historyPayoutRow: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  historyPayoutAmount: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  historyPayoutMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  settledBadge: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // CARD EXTRA STYLES
  cardFaultsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 4,
  },
  cardFaultChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardFaultChipText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  cardCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    marginVertical: 4,
  },
  cardCostLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  cardCostValue: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 13,
  },
  cardPrintBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  cardPrintBtnText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  setCostBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  setCostBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  cardNotesSection: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginVertical: 4,
  },
  cardNotesTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  addNoteQuickBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addNoteQuickBtnText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  latestNoteBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  latestNoteUser: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '700',
  },
  latestNoteText: {
    color: colors.textPrimary,
    fontSize: 11,
    marginTop: 1,
  },
  noNotesYet: {
    color: colors.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // DETAIL NOTES & COMPACT MODAL STYLES
  detailNotesCard: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginVertical: spacing.sm,
  },
  detailNotesTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  detailAddNoteBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  detailAddNoteBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  detailNoteRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    paddingVertical: 6,
  },
  detailNoteAuthor: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  detailNoteContent: {
    color: colors.textPrimary,
    fontSize: 12,
    marginTop: 2,
  },
  compactModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  compactModalTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  compactModalSub: {
    color: colors.primaryLight,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
});
