import { prisma } from '../prisma';
import { DeviceStatus, isValidStatusTransition } from '@ilab/shared';

interface TransitionParams {
  labId: string;
  deviceId: string;
  repairJobId?: string;
  nextStatus: DeviceStatus;
  userId: string;
  reason: string;
  notes?: string;
}

export class StatusTransitionService {
  /**
   * Executes a verified status transition inside a transaction
   */
  static async transition(params: TransitionParams) {
    const { labId, deviceId, repairJobId, nextStatus, userId, reason, notes } = params;

    const device = await prisma.device.findFirst({
      where: { id: deviceId, labId },
    });

    if (!device) {
      throw new Error(`Device ${deviceId} not found in this laboratory`);
    }

    const currentStatus = device.currentStatus as DeviceStatus;
    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${nextStatus}. This transition is not permitted by lab workflow rules.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Update device status
      const updatedDevice = await tx.device.update({
        where: { id: deviceId },
        data: { currentStatus: nextStatus },
      });

      // 2. Update active repair job status if exists
      if (repairJobId) {
        await tx.repairJob.update({
          where: { id: repairJobId },
          data: { status: nextStatus },
        });
      }

      // 3. Log activity audit
      await tx.activityLog.create({
        data: {
          labId,
          userId,
          action: 'STATUS_TRANSITION',
          entityType: 'DEVICE',
          entityId: deviceId,
          metadata: {
            fromStatus: currentStatus,
            toStatus: nextStatus,
            reason,
            notes,
            repairJobId,
          },
        },
      });

      return updatedDevice;
    });
  }
}
