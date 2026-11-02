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
export async function recordDeviceMovement(params: RecordMovementParams, client: any = prisma) {
  try {
    const movement = await client.deviceMovement.create({
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
    try {
      await client.device.update({
        where: { id: params.deviceId },
        data: {
          currentDepartment: params.toDepartment,
          currentHolderId: params.toUserId || null,
        },
      });
    } catch (devUpdateErr) {
      console.warn(`[MovementService] Non-fatal device update warning for ${params.deviceId}:`, devUpdateErr);
    }

    return movement;
  } catch (err) {
    console.warn(`[MovementService] Non-fatal movement recording warning for ${params.deviceId}:`, err);
    return null;
  }
}
