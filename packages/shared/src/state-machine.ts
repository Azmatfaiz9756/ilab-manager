import { DeviceStatus } from './enums';

/**
 * Valid state machine transitions for Device Lifecycle
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<DeviceStatus, DeviceStatus[]> = {
  [DeviceStatus.RECEIVED]: [
    DeviceStatus.QC_INSPECTION,
    DeviceStatus.WAITING_FOR_ASSIGNMENT,
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
    DeviceStatus.READY_FOR_DISPATCH,
    DeviceStatus.DISPATCHED,
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.QC_INSPECTION]: [
    DeviceStatus.WAITING_FOR_ASSIGNMENT,
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.WAITING_FOR_ASSIGNMENT]: [
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
    DeviceStatus.ACCEPTED_BY_TECHNICIAN,
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.ASSIGNED_TO_TECHNICIAN]: [
    DeviceStatus.ACCEPTED_BY_TECHNICIAN,
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.WAITING_FOR_ASSIGNMENT, // Can be unassigned/reassigned
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.ACCEPTED_BY_TECHNICIAN]: [
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.ON_HOLD,
    DeviceStatus.PARTS_REQUIRED,
    DeviceStatus.WAITING_FOR_ASSIGNMENT,
  ],
  [DeviceStatus.REPAIR_IN_PROGRESS]: [
    DeviceStatus.ON_HOLD,
    DeviceStatus.PARTS_REQUIRED,
    DeviceStatus.REPAIR_COMPLETED,
    DeviceStatus.REPAIR_NOT_POSSIBLE,
  ],
  [DeviceStatus.ON_HOLD]: [
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.WAITING_FOR_ASSIGNMENT,
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.PARTS_REQUIRED]: [
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.ON_HOLD,
    DeviceStatus.REPAIR_NOT_POSSIBLE,
  ],
  [DeviceStatus.REPAIR_COMPLETED]: [
    DeviceStatus.QC_PENDING,
    DeviceStatus.READY_FOR_DISPATCH,
    DeviceStatus.DISPATCHED,
  ],
  [DeviceStatus.REPAIR_NOT_POSSIBLE]: [
    DeviceStatus.QC_PENDING,
    DeviceStatus.READY_FOR_DISPATCH,
    DeviceStatus.DISPATCHED,
    DeviceStatus.CANCELLED,
  ],
  [DeviceStatus.QC_PENDING]: [
    DeviceStatus.QC_PASSED,
    DeviceStatus.QC_FAILED,
    DeviceStatus.RETURN_TO_TECHNICIAN,
  ],
  [DeviceStatus.QC_FAILED]: [
    DeviceStatus.RETURN_TO_TECHNICIAN,
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
    DeviceStatus.REPAIR_NOT_POSSIBLE,
  ],
  [DeviceStatus.RETURN_TO_TECHNICIAN]: [
    DeviceStatus.ACCEPTED_BY_TECHNICIAN,
    DeviceStatus.REPAIR_IN_PROGRESS,
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
  ],
  [DeviceStatus.QC_PASSED]: [
    DeviceStatus.READY_FOR_DISPATCH,
    DeviceStatus.DISPATCHED,
  ],
  [DeviceStatus.READY_FOR_DISPATCH]: [
    DeviceStatus.DISPATCHED,
    DeviceStatus.RETURN_CLAIM,
  ],
  [DeviceStatus.DISPATCHED]: [
    DeviceStatus.RETURN_CLAIM,
  ],
  [DeviceStatus.RETURN_CLAIM]: [
    DeviceStatus.QC_INSPECTION,
    DeviceStatus.WAITING_FOR_ASSIGNMENT,
    DeviceStatus.ASSIGNED_TO_TECHNICIAN,
  ],
  [DeviceStatus.CANCELLED]: [
    DeviceStatus.RECEIVED, // Re-open if cancelled in error
  ],
};

export function isValidStatusTransition(current: DeviceStatus, next: DeviceStatus): boolean {
  if (current === next) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : false;
}
