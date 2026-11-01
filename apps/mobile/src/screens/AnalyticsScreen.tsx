import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, borderRadius } from '../theme/colors';
import { apiRequest } from '../services/api';
import { useSettingsStore } from '../store/settingsStore';

export const AnalyticsScreen: React.FC = () => {
  const { formatMoney, currency } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'pnl' | 'leaderboard'>('pnl');
  const [pnlPeriod, setPnlPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');

  // Query P&L
  const {
    data: pnlData,
    isLoading: pnlLoading,
    refetch: refetchPnl,
  } = useQuery({
    queryKey: ['analytics_pnl', pnlPeriod],
    queryFn: () => apiRequest(`/analytics/pnl?period=${pnlPeriod}`),
  });

  // Query Technician Rankings
  const {
    data: rankData,
    isLoading: rankLoading,
    refetch: refetchRankings,
  } = useQuery({
    queryKey: ['analytics_tech_rankings'],
    queryFn: () => apiRequest('/analytics/technician-rankings'),
  });

  const pnl = pnlData?.data || {
    grossRevenue: 0,
    technicianLaborCost: 0,
    partsCost: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMarginPercent: 0,
    completedJobsCount: 0,
  };

  const rankings = rankData?.data || [];

  const isNetPositive = pnl.netProfit >= 0;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial & Performance</Text>
        <Text style={styles.headerSubtitle}>Real-time Lab Profitability & Technician Analytics</Text>

        {/* Tab Toggle */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'pnl' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('pnl')}
          >
            <Text style={[styles.segmentBtnText, activeTab === 'pnl' && styles.segmentBtnTextActive]}>
              📈 P&L Statement
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'leaderboard' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('leaderboard')}
          >
            <Text style={[styles.segmentBtnText, activeTab === 'leaderboard' && styles.segmentBtnTextActive]}>
              🏆 Tech Leaderboard
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={pnlLoading || rankLoading}
            onRefresh={() => {
              refetchPnl();
              refetchRankings();
            }}
            tintColor={colors.primaryLight}
          />
        }
      >
        {activeTab === 'pnl' ? (
          <>
            {/* Period Filters */}
            <View style={styles.filterRow}>
              {(['today', 'week', 'month', 'all'] as const).map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.filterChip, pnlPeriod === period && styles.filterChipActive]}
                  onPress={() => setPnlPeriod(period)}
                >
                  <Text style={[styles.filterChipText, pnlPeriod === period && styles.filterChipTextActive]}>
                    {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'All Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Net Profit Big Hero Card */}
            <View style={[styles.heroCard, isNetPositive ? styles.heroCardPositive : styles.heroCardNegative]}>
              <Text style={styles.heroLabel}>Net Lab Profit ({pnlPeriod.toUpperCase()})</Text>
              <Text style={[styles.heroValue, { color: isNetPositive ? colors.success : colors.danger }]}>
                {formatMoney(pnl.netProfit)}
              </Text>
              <View style={styles.heroFooter}>
                <Text style={styles.heroBadgeText}>
                  Margin: {pnl.profitMarginPercent}% • {pnl.completedJobsCount} Repaired Devices
                </Text>
              </View>
            </View>

            {/* Breakdown Cards */}
            <View style={styles.metricGrid}>
              {/* Gross Revenue */}
              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>💰</Text>
                <Text style={styles.metricLabel}>Gross Revenue</Text>
                <Text style={[styles.metricValue, { color: colors.primaryLight }]}>
                  {formatMoney(pnl.grossRevenue)}
                </Text>
                <Text style={styles.metricSub}>Billed to clients/dealers</Text>
              </View>

              {/* Total Expenses */}
              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>📉</Text>
                <Text style={styles.metricLabel}>Total Costs</Text>
                <Text style={[styles.metricValue, { color: colors.warning }]}>
                  {formatMoney(pnl.totalExpenses)}
                </Text>
                <Text style={styles.metricSub}>Labor + Spare Parts</Text>
              </View>

              {/* Tech Labor */}
              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>🧑‍🔧</Text>
                <Text style={styles.metricLabel}>Tech Labor Cost</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {formatMoney(pnl.technicianLaborCost)}
                </Text>
                <Text style={styles.metricSub}>Hardware technician earnings</Text>
              </View>

              {/* Spare Parts Cost */}
              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>🔌</Text>
                <Text style={styles.metricLabel}>Parts Expense</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {formatMoney(pnl.partsCost)}
                </Text>
                <Text style={styles.metricSub}>Faced/Replaced components</Text>
              </View>
            </View>

            {/* Financial Health Advice */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerTitle}>💡 Lab Profit Formula</Text>
              <Text style={styles.infoBannerBody}>
                Gross Revenue - (Technician Earnings + Parts Cost) = Net Profit. Rate cards set in Team Manager auto-apply per fault.
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Tech Leaderboard */}
            <View style={styles.leaderboardHeaderRow}>
              <Text style={styles.leaderboardTitle}>Technician Rankings & Quality Metrics</Text>
              <Text style={styles.leaderboardSub}>Sorted by successfully repaired devices</Text>
            </View>

            {rankings.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🧑‍🔧</Text>
                <Text style={styles.emptyText}>No technician repair records found yet.</Text>
              </View>
            ) : (
              rankings.map((tech: any, index: number) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                const reworkLow = tech.reworkRatePercent <= 5;

                return (
                  <View key={tech.technicianId} style={styles.techRankCard}>
                    <View style={styles.rankTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.medalText}>{medal}</Text>
                        <View>
                          <Text style={styles.techName}>{tech.name}</Text>
                          <Text style={styles.techEmail}>{tech.email}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.techEarnedText}>{formatMoney(tech.totalEarned)}</Text>
                        <Text style={styles.techEarnedSub}>Total Earned</Text>
                      </View>
                    </View>

                    {/* Stats pills */}
                    <View style={styles.statsRow}>
                      <View style={styles.statPill}>
                        <Text style={styles.statPillLabel}>Repairs</Text>
                        <Text style={styles.statPillValue}>{tech.totalRepairs}</Text>
                      </View>

                      <View style={styles.statPill}>
                        <Text style={styles.statPillLabel}>Success</Text>
                        <Text style={[styles.statPillValue, { color: colors.success }]}>
                          {tech.successRatePercent}%
                        </Text>
                      </View>

                      <View style={styles.statPill}>
                        <Text style={styles.statPillLabel}>Return / Rework</Text>
                        <Text
                          style={[
                            styles.statPillValue,
                            { color: reworkLow ? colors.success : colors.danger },
                          ]}
                        >
                          {tech.reworkCount} ({tech.reworkRatePercent}%)
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  heroCardPositive: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  heroCardNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  heroLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '900',
    marginVertical: spacing.xs,
  },
  heroFooter: {
    marginTop: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  metricIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  infoBanner: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  infoBannerBody: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  leaderboardHeaderRow: {
    marginBottom: spacing.md,
  },
  leaderboardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  leaderboardSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  techRankCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rankTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  medalText: {
    fontSize: 22,
    fontWeight: '800',
  },
  techName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  techEmail: {
    fontSize: 11,
    color: colors.textMuted,
  },
  techEarnedText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.success,
  },
  techEarnedSub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.xs + 2,
  },
  statPill: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statPillLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '600',
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
