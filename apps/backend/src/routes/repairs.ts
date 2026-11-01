import { Router, Response } from 'express';
import { prisma } from '../prisma';
import {
  startRepairSchema,
  updateRepairProgressSchema,
  partsRequiredSchema,
  repairNotPossibleSchema,
  submitToQCSchema,
  DeviceStatus,
  Department,
  UserRole,
} from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant, requireRole } from '../middleware/auth';
import { StatusTransitionService } from '../services/statusService';
import { recordDeviceMovement } from '../services/movementService';

const router = Router();

/**
 * List Repairs assigned to logged-in Board Technician (or all if Manager/Owner)
 */
router.get('/my-repairs', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const { status, priority } = req.query;

  const where: any = { labId };

  // If technician, filter by jobs where they are currently assigned
  if (userRole === UserRole.BOARD_TECHNICIAN) {
    where.assignments = {
      some: {
        technicianId: userId,
        status: { in: ['ASSIGNED', 'ACCEPTED'] },
      },
    };
  }

  if (status) {
    where.status = status as DeviceStatus;
  }
  if (priority) {
    where.device = { priority: priority as any };
  }

  const jobs = await prisma.repairJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      device: {
        include: {
          model: true,
          imeis: true,
          faults: { include: { fault: { include: { category: true } } } },
          photos: true,
        },
      },
      assignments: {
        include: { technician: true, assignedBy: true },
        orderBy: { assignedAt: 'desc' },
        take: 1,
      },
      attempts: {
        orderBy: { attemptNumber: 'desc' },
        take: 1,
      },
      returnClaim: {
        include: {
          previousRepairJob: {
            include: {
              assignments: { include: { technician: true }, take: 1, orderBy: { assignedAt: 'desc' } },
              attempts: { take: 1, orderBy: { attemptNumber: 'desc' } },
            },
          },
        },
      },
    },
  });

  res.json({ success: true, data: jobs });
});

/**
 * 1. Accept Repair Job
 */
router.post('/:id/accept', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  // Update assignment status
  await prisma.jobAssignment.updateMany({
    where: { repairJobId: job.id, technicianId: userId },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.ACCEPTED_BY_TECHNICIAN,
    userId,
    reason: 'Technician accepted repair assignment',
  });

  res.json({ success: true, message: 'Repair job accepted' });
});

/**
 * 2. Start Repair
 */
router.post('/:id/start', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const input = startRepairSchema.parse(req.body);

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  // Update latest attempt start time
  if (job.attempts.length > 0) {
    await prisma.repairAttempt.update({
      where: { id: job.attempts[0].id },
      data: { startedAt: new Date() },
    });
  }

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.REPAIR_IN_PROGRESS,
    userId,
    reason: 'Technician started active repair work',
    notes: input.notes,
  });

  res.json({ success: true, message: 'Repair work started' });
});

/**
 * 3. Put On Hold
 */
router.post('/:id/hold', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const { notes } = req.body;

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.ON_HOLD,
    userId,
    reason: 'Repair placed on hold by technician',
    notes,
  });

  res.json({ success: true, message: 'Repair job placed on hold' });
});

/**
 * 4. Request Parts Required
 */
router.post('/:id/parts-required', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const input = partsRequiredSchema.parse(req.body);

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  if (job.attempts.length > 0) {
    await prisma.repairAttempt.update({
      where: { id: job.attempts[0].id },
      data: { partsRequiredDesc: input.partsDescription },
    });
  }

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.PARTS_REQUIRED,
    userId,
    reason: 'Parts required: ' + input.partsDescription,
    notes: input.notes,
  });

  res.json({ success: true, message: 'Status updated to PARTS_REQUIRED' });
});

/**
 * 5. Mark Repair Not Possible
 */
router.post('/:id/not-possible', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const input = repairNotPossibleSchema.parse(req.body);

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  if (job.attempts.length > 0) {
    await prisma.repairAttempt.update({
      where: { id: job.attempts[0].id },
      data: {
        completedAt: new Date(),
        result: 'NOT_POSSIBLE',
        notPossibleReason: input.reason,
        isLocked: true,
      },
    });
  }

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.REPAIR_NOT_POSSIBLE,
    userId,
    reason: 'Repair not possible: ' + input.reason,
    notes: input.notes,
  });

  res.json({ success: true, message: 'Device marked as REPAIR_NOT_POSSIBLE' });
});

/**
 * 6. Submit to QC (Requires diagnosis, work performed, repair notes, and locks attempt record)
 */
router.post('/:id/submit-qc', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const input = submitToQCSchema.parse(req.body);

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  // Save details and lock attempt from ordinary editing
  if (job.attempts.length > 0) {
    await prisma.repairAttempt.update({
      where: { id: job.attempts[0].id },
      data: {
        diagnosis: input.diagnosis,
        workPerformed: input.workPerformed,
        componentsReplaced: input.componentsReplaced || null,
        completedAt: new Date(),
        result: 'REPAIRED',
        isLocked: true, // Audit locked
      },
    });
  }

  // Create repair note
  await prisma.repairNote.create({
    data: {
      repairJobId: job.id,
      userId,
      note: input.repairNotes,
    },
  });

  // State transitions: REPAIR_COMPLETED -> QC_PENDING
  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.REPAIR_COMPLETED,
    userId,
    reason: 'Technician completed repairs and submitted for QC inspection',
  });

  await StatusTransitionService.transition({
    labId,
    deviceId: job.deviceId,
    repairJobId: job.id,
    nextStatus: DeviceStatus.QC_PENDING,
    userId,
    reason: 'Moved to QC verification queue',
  });

  // Device movement: Board Repair -> QC
  await recordDeviceMovement({
    labId,
    deviceId: job.deviceId,
    fromDepartment: Department.BOARD_REPAIR,
    toDepartment: Department.QC,
    fromUserId: userId,
    toUserId: null,
    reason: 'Submitted for Quality Control verification',
  });

  res.json({ success: true, message: 'Repair submitted to QC verification queue' });
});

export default router;
