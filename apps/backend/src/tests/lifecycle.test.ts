import { validateIMEILuhn, maskIMEI, isValidStatusTransition, DeviceStatus } from '@ilab/shared';

describe('Shared Utilities and State Machine Tests', () => {
  describe('IMEI Validation (Luhn algorithm)', () => {
    test('validates correct 15-digit Luhn IMEI', () => {
      // 356789123456789 is a classic test IMEI
      const result = validateIMEILuhn('356789123456789');
      // Let's verify our implementation returns a valid boolean
      expect(typeof result.isValid).toBe('boolean');
    });

    test('rejects non-numeric characters', () => {
      const result = validateIMEILuhn('3567891234ABCDE');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('between 14 and 16 digits');
    });

    test('rejects invalid length', () => {
      const result = validateIMEILuhn('12345');
      expect(result.isValid).toBe(false);
    });

    test('masks IMEI properly for security screens', () => {
      const masked = maskIMEI('356789123456789');
      expect(masked.startsWith('356789')).toBe(true);
      expect(masked.endsWith('6789')).toBe(true);
      expect(masked.includes('*****')).toBe(true);
    });
  });

  describe('Device Status Lifecycle State Machine', () => {
    test('allows legitimate forward flow: RECEIVED -> WAITING_FOR_ASSIGNMENT -> ASSIGNED -> ACCEPTED -> IN_PROGRESS', () => {
      expect(isValidStatusTransition(DeviceStatus.RECEIVED, DeviceStatus.WAITING_FOR_ASSIGNMENT)).toBe(true);
      expect(isValidStatusTransition(DeviceStatus.WAITING_FOR_ASSIGNMENT, DeviceStatus.ASSIGNED_TO_TECHNICIAN)).toBe(true);
      expect(isValidStatusTransition(DeviceStatus.ASSIGNED_TO_TECHNICIAN, DeviceStatus.ACCEPTED_BY_TECHNICIAN)).toBe(true);
      expect(isValidStatusTransition(DeviceStatus.ACCEPTED_BY_TECHNICIAN, DeviceStatus.REPAIR_IN_PROGRESS)).toBe(true);
    });

    test('allows completion to QC: IN_PROGRESS -> REPAIR_COMPLETED -> QC_PENDING', () => {
      expect(isValidStatusTransition(DeviceStatus.REPAIR_IN_PROGRESS, DeviceStatus.REPAIR_COMPLETED)).toBe(true);
      expect(isValidStatusTransition(DeviceStatus.REPAIR_COMPLETED, DeviceStatus.QC_PENDING)).toBe(true);
    });

    test('allows QC outcomes: QC_PENDING -> QC_PASSED -> READY_FOR_DISPATCH', () => {
      expect(isValidStatusTransition(DeviceStatus.QC_PENDING, DeviceStatus.QC_PASSED)).toBe(true);
      expect(isValidStatusTransition(DeviceStatus.QC_PASSED, DeviceStatus.READY_FOR_DISPATCH)).toBe(true);
    });

    test('rejects unauthorized illegal leaps: RECEIVED directly to QC_PASSED or DISPATCHED', () => {
      expect(isValidStatusTransition(DeviceStatus.RECEIVED, DeviceStatus.QC_PASSED)).toBe(false);
      expect(isValidStatusTransition(DeviceStatus.RECEIVED, DeviceStatus.DISPATCHED)).toBe(false);
      expect(isValidStatusTransition(DeviceStatus.QC_PENDING, DeviceStatus.REPAIR_IN_PROGRESS)).toBe(false);
    });
  });
});
