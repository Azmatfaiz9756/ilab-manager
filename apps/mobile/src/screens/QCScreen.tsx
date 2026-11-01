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
import { QCDecision } from '../shared';

export const QCScreen: React.FC = () => {
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['qc_pending_jobs'],
    queryFn: () => apiRequest('/qc/pending'),
    refetchInterval: 3000,
  });

  const jobs = data?.data || [];

  const handleDecision = async (decision: QCDecision) => {
    if (!activeJob) return;

    if (decision === QCDecision.QC_FAILED && !failureReason.trim()) {
      Alert.alert('Required', 'Please enter a clear failure reason when rejecting QC.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/qc/${activeJob.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          failureReason: decision === QCDecision.QC_FAILED ? failureReason.trim() : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      Alert.alert(
        'Inspection Complete',
        decision === QCDecision.QC_PASSED
          ? 'Device marked QC Passed and moved to Final Stock.'
          : 'Device rejected and returned to technician with a new repair attempt.'
      );
      setActiveJob(null);
      setFailureReason('');
      setNotes('');
      refetch();
    } catch (err: any) {
      Alert.alert('QC Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.primaryLight} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Text style={styles.screenTitle}>QC Verification Queue</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34, 197, 94, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 5 }} />
          <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>LIVE SYNC</Text>
        </View>
      </View>

      {jobs.length === 0 && !isLoading && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No devices currently pending QC inspection.</Text>
        </View>
      )}

      {jobs.map((job: any) => (
        <TouchableOpacity
          key={job.id}
          style={styles.card}
          onPress={() => setActiveJob(job)}
        >
          <View style={styles.cardRow}>
            <Text style={styles.modelName}>{job.device?.model?.name}</Text>
            <Text style={styles.jobNumber}>{job.jobNumber}</Text>
          </View>
          <Text style={styles.techText}>
            Repaired by: {job.assignments?.[0]?.technician?.name || 'Technician'}
          </Text>
          <Text style={styles.diagnosisPreview}>
            Diagnosis: {job.attempts?.[0]?.diagnosis || 'N/A'}
          </Text>
        </TouchableOpacity>
      ))}

      {/* QC Verification Modal */}
      <Modal visible={!!activeJob} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {activeJob && (
              <>
                <Text style={styles.modalTitle}>Inspect {activeJob.device?.model?.name}</Text>
                <Text style={styles.modalSubtitle}>Job: {activeJob.jobNumber}</Text>

                <View style={styles.infoBox}>
                  <Text style={styles.infoTitle}>Work Performed by Tech:</Text>
                  <Text style={styles.infoText}>{activeJob.attempts?.[0]?.workPerformed || 'N/A'}</Text>
                  {activeJob.attempts?.[0]?.componentsReplaced && (
                    <Text style={styles.infoText}>
                      Replaced: {activeJob.attempts[0].componentsReplaced}
                    </Text>
                  )}
                </View>

                <Text style={styles.label}>QC Notes / Inspection Observation</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Notes about screen alignment, functional checks..."
                  placeholderTextColor={colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                />

                <Text style={styles.label}>Failure Reason (If Rejecting)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Face ID intermittently failing on setup"
                  placeholderTextColor={colors.textMuted}
                  value={failureReason}
                  onChangeText={setFailureReason}
                />

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.passBtn}
                    onPress={() => handleDecision(QCDecision.QC_PASSED)}
                    disabled={submitting}
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Pass QC</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.failBtn}
                    onPress={() => handleDecision(QCDecision.QC_FAILED)}
                    disabled={submitting}
                  >
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Fail & Return</Text>}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveJob(null)}>
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
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
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  jobNumber: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  techText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  diagnosisPreview: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  infoBox: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
    marginBottom: 2,
  },
  infoText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: borderRadius.sm,
    padding: 10,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  passBtn: {
    flex: 1,
    backgroundColor: colors.success,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  failBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    padding: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
  },
});
