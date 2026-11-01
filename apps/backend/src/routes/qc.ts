import { Router, Response } from 'express';
import { prisma } from '../prisma';
import {
  qcVerificationSchema,
  QCDecision,
  DeviceStatus,
  Department,
  UserRole,
} from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant } from '../middleware/auth';
import { StatusTransitionService } from '../services/statusService';
import { recordDeviceMovement } from '../services/movementService';

const router = Router();

/**
 * Get all devices in QC_PENDING queue
 */
router.get('/pending', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;

  const pendingJobs = await prisma.repairJob.findMany({
    where: {
      labId,
      status: DeviceStatus.QC_PENDING,
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      device: {
        include: {
          model: true,
          imeis: true,
          photos: true,
          faults: { include: { fault: { include: { category: true } } } },
        },
      },
      assignments: {
        include: { technician: true },
        take: 1,
        orderBy: { assignedAt: 'desc' },
      },
      attempts: {
        take: 1,
        orderBy: { attemptNumber: 'desc' },
      },
      notes: {
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
      returnClaim: true,
    },
  });

  res.json({ success: true, data: pendingJobs });
});

/**
 * Execute QC Verification Decision
 */
router.post('/:jobId/verify', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const qcUserId = req.user!.id;
  const { jobId } = req.params;

  try {
    const input = qcVerificationSchema.parse(req.body);

    const job = await prisma.repairJob.findFirst({
      where: { id: jobId, labId },
      include: {
        device: true,
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        assignments: { orderBy: { assignedAt: 'desc' }, take: 1 },
      },
    });

    if (!job) {
      res.status(404).json({ success: false, message: 'Repair job not found' });
      return;
    }

    if (job.status !== DeviceStatus.QC_PENDING) {
      res.status(400).json({
        success: false,
        message: `Device is not in QC_PENDING state (current: ${job.status})`,
      });
      return;
    }

    // Record QC Inspection
    const inspection = await prisma.qCInspection.create({
      data: {
        repairJobId: job.id,
        qcTechnicianId: qcUserId,
        decision: input.decision,
        failureReason: input.failureReason || null,
        notes: input.notes || null,
        items: input.faultResults
          ? {
              create: input.faultResults.map((fr) => ({
                faultId: fr.faultId,
                faultName: 'Fault Verification',
                passed: fr.passed,
                notes: fr.notes || null,
              })),
            }
          : undefined,
      },
    });

    if (input.decision === QCDecision.QC_PASSED) {
      // Transition to QC_PASSED then READY_FOR_DISPATCH
      await StatusTransitionService.transition({
        labId,
        deviceId: job.deviceId,
        repairJobId: job.id,
        nextStatus: DeviceStatus.QC_PASSED,
        userId: qcUserId,
        reason: 'QC Passed all inspection tests',
        notes: input.notes,
      });

      await StatusTransitionService.transition({
        labId,
        deviceId: job.deviceId,
        repairJobId: job.id,
        nextStatus: DeviceStatus.READY_FOR_DISPATCH,
        userId: qcUserId,
        reason: 'Moved to Final Stock ready for customer/store dispatch',
      });

      // Movement to Final Stock
      await recordDeviceMovement({
        labId,
        deviceId: job.deviceId,
        fromDepartment: Department.QC,
        toDepartment: Department.FINAL_STOCK,
        fromUserId: qcUserId,
        toUserId: null,
        reason: 'Passed QC Inspection -> Final Stock',
      });

      res.json({
        success: true,
        message: 'Device verified and marked as QC_PASSED (Ready for Dispatch)',
        inspectionId: inspection.id,
      });
      return;
    }

    if (input.decision === QCDecision.QC_FAILED || input.decision === QCDecision.RETURN_TO_TECHNICIAN) {
      if (!input.failureReason) {
        res.status(400).json({ success: false, message: 'Failure reason is required when QC fails' });
        return;
      }

      // Transition to QC_FAILED
      await StatusTransitionService.transition({
        labId,
        deviceId: job.deviceId,
        repairJobId: job.id,
        nextStatus: DeviceStatus.QC_FAILED,
        userId: qcUserId,
        reason: `QC Failed: ${input.failureReason}`,
      });

      // Determine technician for new attempt (reassign or return to previous)
      const targetTechId = input.reassignTechnicianId || job.assignments[0]?.technicianId;

      await StatusTransitionService.transition({
        labId,
        deviceId: job.deviceId,
        repairJobId: job.id,
        nextStatus: DeviceStatus.RETURN_TO_TECHNICIAN,
        userId: qcUserId,
        reason: `Returned to hardware technician for re-repair: ${input.failureReason}`,
      });

      // Create new repair attempt
      const nextAttemptNumber = (job.attempts[0]?.attemptNumber || 1) + 1;
      await prisma.repairAttempt.create({
        data: {
          repairJobId: job.id,
          attemptNumber: nextAttemptNumber,
          technicianId: targetTechId,
          diagnosis: `Previous attempt rejected at QC: ${input.failureReason}`,
        },
      });

      // Record movement back to Board Repair
      await recordDeviceMovement({
        labId,
        deviceId: job.deviceId,
        fromDepartment: Department.QC,
        toDepartment: Department.BOARD_REPAIR,
        fromUserId: qcUserId,
        toUserId: targetTechId,
        reason: `QC Inspection Failed: ${input.failureReason}`,
      });

      // Notify technician
      if (targetTechId) {
        await prisma.notification.create({
          data: {
            labId,
            userId: targetTechId,
            title: `QC Failed: Device ${job.jobNumber} Returned`,
            body: `Reason: ${input.failureReason}`,
            data: { repairJobId: job.id, deviceId: job.deviceId },
          },
        });
      }

      res.json({
        success: true,
        message: 'QC inspection recorded as failed; device returned to technician with new attempt',
        inspectionId: inspection.id,
      });
      return;
    }

    res.json({ success: true, message: 'QC review status updated', inspectionId: inspection.id });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'QC verification failed' });
  }
});

export default router;
