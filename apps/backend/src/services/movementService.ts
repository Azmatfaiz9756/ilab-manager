import { prisma } from '../prisma';
import { DeviceStatus, Department } from '@ilab/shared';

interface RecordMovementParams {
  labId: string;
  deviceId: string;
  fromDepartment: Department;
  toDepartment: Department;
  fromUserId?: string | null;
  toUserId?: string | null;
  reason: string;
  notes?: string;
}

/**
 * Creates an immutable movement record whenever a device changes location or holder
 */
export async function recordDeviceMovement(params: RecordMovementParams) {
  const movement = await prisma.deviceMovement.create({
    data: {
      labId: params.labId,
      deviceId: params.deviceId,
      fromDepartment: params.fromDepartment,
      toDepartment: params.toDepartment,
      fromUserId: params.fromUserId || null,
      toUserId: params.toUserId || null,
      reason: params.reason,
      notes: params.notes || null,
    },
  });

  // Update current department and holder on device
  await prisma.device.update({
    where: { id: params.deviceId },
    data: {
      currentDepartment: params.toDepartment,
      currentHolderId: params.toUserId || null,
    },
  });

  return movement;
}
