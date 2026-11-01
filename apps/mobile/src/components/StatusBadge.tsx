import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DeviceStatus } from '../shared';
import { colors } from '../theme/colors';

interface StatusBadgeProps {
  status: DeviceStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStatusConfig = () => {
    switch (status) {
      case DeviceStatus.QC_PASSED:
      case DeviceStatus.READY_FOR_DISPATCH:
        return { label: 'QC Passed', color: colors.success, bg: colors.successBackground };
      case DeviceStatus.REPAIR_COMPLETED:
        return { label: 'Repaired', color: colors.success, bg: colors.successBackground };
      case DeviceStatus.REPAIR_IN_PROGRESS:
        return { label: 'In Progress', color: colors.primaryLight, bg: 'rgba(59, 130, 246, 0.15)' };
      case DeviceStatus.QC_PENDING:
        return { label: 'QC Pending', color: colors.info, bg: colors.infoBackground };
      case DeviceStatus.QC_FAILED:
      case DeviceStatus.RETURN_TO_TECHNICIAN:
        return { label: 'QC Failed', color: colors.danger, bg: colors.dangerBackground };
      case DeviceStatus.RETURN_CLAIM:
        return { label: 'Return Claim', color: colors.danger, bg: colors.dangerBackground };
      case DeviceStatus.ON_HOLD:
      case DeviceStatus.PARTS_REQUIRED:
        return { label: status.replace('_', ' '), color: colors.warning, bg: colors.warningBackground };
      case DeviceStatus.WAITING_FOR_ASSIGNMENT:
        return { label: 'Unassigned', color: colors.warning, bg: colors.warningBackground };
      default:
        return { label: status.replace(/_/g, ' '), color: colors.textSecondary, bg: colors.surfaceElevated };
    }
  };

  const config = getStatusConfig();
  const isSm = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, paddingVertical: isSm ? 2 : 4, paddingHorizontal: isSm ? 6 : 10 }]}>
      <Text style={[styles.text, { color: config.color, fontSize: isSm ? 11 : 12 }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
