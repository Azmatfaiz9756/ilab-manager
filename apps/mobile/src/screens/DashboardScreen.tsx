import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { UserRole } from '../shared';

interface MetricCardProps {
  label: string;
  value: number | string;
  color?: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, color = colors.primaryLight, subtitle }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color }]}>{value}</Text>
    {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
  </View>
);

export const DashboardScreen: React.FC<{ navigation?: any }> = () => {
  const user = useAuthStore((s) => s.user);
  const lab = useAuthStore((s) => s.lab);
  const logout = useAuthStore((s) => s.logout);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard_metrics', lab?.id],
    queryFn: () => apiRequest('/analytics/dashboard'),
    refetchInterval: 5000,
  });

  const metrics = data?.data?.metrics || {};
  const role = user?.role || UserRole.VIEWER;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.primaryLight} />}
    >
      {/* Top Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.labName}>{lab?.name || 'iLab Workspace'}</Text>
          <Text style={styles.userRole}>
            {user?.name} • <Text style={styles.roleHighlight}>{role.replace(/_/g, ' ')}</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* DASHBOARD: LAB OWNER / MANAGER */}
      {(role === UserRole.LAB_OWNER || role === UserRole.LAB_MANAGER || user?.isSuperAdmin) && (
        <View>
          <Text style={styles.sectionTitle}>Lab Overview</Text>
          <View style={styles.grid}>
            <MetricCard label="Active in Lab" value={metrics.devicesInLab ?? '-'} color={colors.primaryLight} />
            <MetricCard label="Waiting Assignment" value={metrics.waitingAssignment ?? '-'} color={colors.warning} />
            <MetricCard label="Repairs In Progress" value={metrics.inProgress ?? '-'} color={colors.info} />
            <MetricCard label="QC Pending" value={metrics.qcPending ?? '-'} color={colors.info} />
            <MetricCard label="QC Passed / Ready" value={metrics.repairedSuccess ?? '-'} color={colors.success} />
            <MetricCard label="Return Claims" value={metrics.returnClaims ?? '-'} color={colors.danger} />
          </View>
        </View>
      )}

      {/* DASHBOARD: QC TECHNICIAN */}
      {role === UserRole.QC_TECHNICIAN && (
        <View>
          <Text style={styles.sectionTitle}>Quality Control Metrics</Text>
          <View style={styles.grid}>
            <MetricCard label="New Intake Today" value={metrics.newEntriesToday ?? '-'} color={colors.primaryLight} />
            <MetricCard label="Waiting Assignment" value={metrics.waitingAssignment ?? '-'} color={colors.warning} />
            <MetricCard label="QC Pending Queue" value={metrics.qcPending ?? '-'} color={colors.info} />
            <MetricCard label="Total Passed" value={metrics.qcPassedTotal ?? '-'} color={colors.success} />
            <MetricCard label="Total Rejected" value={metrics.qcFailedTotal ?? '-'} color={colors.danger} />
            <MetricCard label="Active Claims" value={metrics.returnClaimsTotal ?? '-'} color={colors.danger} />
          </View>
        </View>
      )}

      {/* DASHBOARD: BOARD TECHNICIAN */}
      {role === UserRole.BOARD_TECHNICIAN && (
        <View>
          <Text style={styles.sectionTitle}>My Repair Station</Text>
          <View style={styles.grid}>
            <MetricCard label="New Assignments" value={metrics.newAssignments ?? '-'} color={colors.primaryLight} />
            <MetricCard label="In Progress" value={metrics.inProgress ?? '-'} color={colors.info} />
            <MetricCard label="On Hold" value={metrics.onHold ?? '-'} color={colors.warning} />
            <MetricCard label="Parts Required" value={metrics.partsRequired ?? '-'} color={colors.warning} />
            <MetricCard label="Submitted to QC" value={metrics.submittedToQC ?? '-'} color={colors.success} />
            <MetricCard label="Returned from QC" value={metrics.qcReturned ?? '-'} color={colors.danger} />
          </View>
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  labName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  userRole: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleHighlight: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  logoutBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  metricLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  metricSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
