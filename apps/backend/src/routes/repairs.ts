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

  // If technician, filter by jobs assigned to them, held by them, or general queue
  if (userRole === UserRole.BOARD_TECHNICIAN) {
    where.OR = [
      {
        assignments: {
          some: {
            technicianId: userId,
            status: { in: ['ASSIGNED', 'ACCEPTED'] },
          },
        },
      },
      {
        device: {
          currentHolderId: userId,
        },
      },
      {
        status: DeviceStatus.WAITING_FOR_ASSIGNMENT,
      },
    ];
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

  // Update or create assignment
  const existingAssignment = await prisma.jobAssignment.findFirst({
    where: { repairJobId: job.id, technicianId: userId },
  });

  if (existingAssignment) {
    await prisma.jobAssignment.update({
      where: { id: existingAssignment.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
  } else {
    await prisma.jobAssignment.create({
      data: {
        repairJobId: job.id,
        technicianId: userId,
        assignedById: userId,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
  }

  // Ensure repair attempt exists
  const existingAttempt = await prisma.repairAttempt.findFirst({
    where: { repairJobId: job.id, technicianId: userId },
  });
  if (!existingAttempt) {
    await prisma.repairAttempt.create({
      data: {
        repairJobId: job.id,
        attemptNumber: 1,
        technicianId: userId,
      },
    });
  }

  // Update device holder and department
  await prisma.device.update({
    where: { id: job.deviceId },
    data: {
      currentHolderId: userId,
      currentDepartment: Department.BOARD_REPAIR,
    },
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

/**
 * 7. List Devices for Return / Dispatch (with date-wise grouping, search, and status filter)
 */
router.get('/dispatch-list', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { date, status, search, page = '1', limit = '50' } = req.query;

  const pageNum = parseInt(page as string, 10) || 1;
  const take = parseInt(limit as string, 10) || 50;
  const skip = (pageNum - 1) * take;

  const where: any = { labId };

  if (status === 'DISPATCHED') {
    where.status = DeviceStatus.DISPATCHED;
  } else if (status === 'READY') {
    where.status = {
      in: [DeviceStatus.QC_PASSED, DeviceStatus.READY_FOR_DISPATCH, DeviceStatus.REPAIR_NOT_POSSIBLE],
    };
  } else if (status === 'SENT_TO_TECH') {
    where.status = {
      in: [
        DeviceStatus.ASSIGNED_TO_TECHNICIAN,
        DeviceStatus.ACCEPTED_BY_TECHNICIAN,
        DeviceStatus.REPAIR_IN_PROGRESS,
        DeviceStatus.ON_HOLD,
        DeviceStatus.PARTS_REQUIRED,
        DeviceStatus.RETURN_TO_TECHNICIAN,
      ],
    };
  } else if (status && status !== 'ALL') {
    where.status = status as DeviceStatus;
  }

  // Date-wise filtering (ISO YYYY-MM-DD)
  if (date) {
    const targetDate = new Date(date as string);
    if (!isNaN(targetDate.getTime())) {
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      where.updatedAt = {
        gte: targetDate,
        lt: nextDay,
      };
    }
  }

  if (search) {
    const term = (search as string).trim();
    where.OR = [
      { jobNumber: { contains: term, mode: 'insensitive' } },
      { device: { imeis: { some: { imei: { contains: term } } } } },
      { device: { model: { name: { contains: term, mode: 'insensitive' } } } },
      { device: { receivedFrom: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [total, jobs] = await Promise.all([
    prisma.repairJob.count({ where }),
    prisma.repairJob.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: {
        device: {
          include: {
            model: true,
            imeis: true,
            faults: { include: { fault: true } },
          },
        },
        parts: true,
        assignments: {
          include: { technician: true },
          take: 1,
          orderBy: { assignedAt: 'desc' },
        },
        attempts: {
          take: 1,
          orderBy: { attemptNumber: 'desc' },
        },
        qcInspections: {
          take: 1,
          orderBy: { testedAt: 'desc' },
          include: { qcTechnician: true },
        },
      },
    }),
  ]);

  res.json({
    success: true,
    data: jobs,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / take),
      limit: take,
    },
  });
});

/**
 * 8. Return / Dispatch Device to Customer / Dealer
 * Supports adding extra faults found/repaired, parts replaced, work performed, and return date
 */
router.post('/:id/dispatch', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const {
    returnedTo,
    workPerformed,
    dispatchNotes,
    dispatchDate,
    extraFaults = [],
    partsUsed = [],
  } = req.body;

  const job = await prisma.repairJob.findFirst({
    where: { id: req.params.id, labId },
    include: {
      device: true,
      attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
    },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Repair job not found' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Add any extra faults discovered or repaired
    if (extraFaults && extraFaults.length > 0) {
      for (const faultItem of extraFaults) {
        if (!faultItem || !faultItem.trim()) continue;
        const df = await tx.deviceFault.create({
          data: {
            deviceId: job.deviceId,
            customFaultName: faultItem.trim(),
            isResolved: true,
          },
        });
        await tx.repairJobFault.create({
          data: {
            repairJobId: job.id,
            deviceFaultId: df.id,
          },
        });
      }
    }

    // 2. Add replacement parts used if provided
    if (partsUsed && partsUsed.length > 0) {
      for (const part of partsUsed) {
        if (!part.partName || !part.partName.trim()) continue;
        await tx.repairPart.create({
          data: {
            repairJobId: job.id,
            partName: part.partName.trim(),
            partNumber: part.partNumber?.trim() || null,
            quantity: part.quantity || 1,
            cost: typeof part.cost === 'number' ? part.cost : null,
          },
        });
      }
    }

    // 3. Update attempt / notes
    if (workPerformed && workPerformed.trim() && job.attempts.length > 0) {
      const prevWork = job.attempts[0].workPerformed ? `${job.attempts[0].workPerformed}\n` : '';
      await tx.repairAttempt.update({
        where: { id: job.attempts[0].id },
        data: {
          workPerformed: `${prevWork}Handover Notes: ${workPerformed.trim()}`,
        },
      });
    }

    if (dispatchNotes && dispatchNotes.trim()) {
      await tx.repairNote.create({
        data: {
          repairJobId: job.id,
          userId,
          note: `Handover / Return: ${dispatchNotes.trim()}${returnedTo ? ` (Handed to: ${returnedTo.trim()})` : ''}`,
        },
      });
    }

    // 4. Update device & job status to DISPATCHED
    const effectiveDate = dispatchDate ? new Date(dispatchDate) : new Date();
    await tx.device.update({
      where: { id: job.deviceId },
      data: {
        currentStatus: DeviceStatus.DISPATCHED,
        currentDepartment: Department.DISPATCH,
        updatedAt: effectiveDate,
      },
    });

    await tx.repairJob.update({
      where: { id: job.id },
      data: {
        status: DeviceStatus.DISPATCHED,
        updatedAt: effectiveDate,
      },
    });

    // 5. Record movement: -> DISPATCH
    await tx.deviceMovement.create({
      data: {
        labId,
        deviceId: job.deviceId,
        fromDepartment: job.device.currentDepartment,
        toDepartment: Department.DISPATCH,
        fromUserId: userId,
        reason: returnedTo ? `Handed over / Dispatched to ${returnedTo.trim()}` : 'Device returned / Dispatched',
        notes: dispatchNotes || workPerformed || undefined,
        movedAt: effectiveDate,
      },
    });

    // 6. Activity log
    await tx.activityLog.create({
      data: {
        labId,
        userId,
        action: 'DEVICE_DISPATCH',
        entityType: 'DEVICE',
        entityId: job.deviceId,
        metadata: {
          jobNumber: job.jobNumber,
          returnedTo,
          dispatchNotes,
          extraFaultsCount: extraFaults.length,
          partsUsedCount: partsUsed.length,
          dispatchDate: effectiveDate.toISOString(),
        },
      },
    });
  });

  res.json({ success: true, message: `Device ${job.jobNumber} successfully returned and marked DISPATCHED` });
});

/**
 * 9. Bulk Return / Dispatch Multiple Devices at Once
 */
router.post('/bulk-dispatch', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const { jobIds = [], returnedTo, dispatchNotes, dispatchDate } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    res.status(400).json({ success: false, message: 'At least one job ID is required for bulk return' });
    return;
  }

  const effectiveDate = dispatchDate ? new Date(dispatchDate) : new Date();
  let successCount = 0;

  for (const jobId of jobIds) {
    try {
      const job = await prisma.repairJob.findFirst({
        where: { id: jobId, labId },
        include: { device: true },
      });
      if (!job) continue;

      await prisma.$transaction(async (tx) => {
        await tx.device.update({
          where: { id: job.deviceId },
          data: {
            currentStatus: DeviceStatus.DISPATCHED,
            currentDepartment: Department.DISPATCH,
            updatedAt: effectiveDate,
          },
        });

        await tx.repairJob.update({
          where: { id: job.id },
          data: {
            status: DeviceStatus.DISPATCHED,
            updatedAt: effectiveDate,
          },
        });

        await tx.deviceMovement.create({
          data: {
            labId,
            deviceId: job.deviceId,
            fromDepartment: job.device.currentDepartment,
            toDepartment: Department.DISPATCH,
            fromUserId: userId,
            reason: returnedTo ? `Bulk returned to ${returnedTo.trim()}` : 'Bulk return / Dispatch',
            notes: dispatchNotes || undefined,
            movedAt: effectiveDate,
          },
        });
      });

      successCount += 1;
    } catch {
      // Continue next job
    }
  }

  res.json({
    success: true,
    message: `Bulk return complete: ${successCount} devices marked as DISPATCHED`,
    data: { dispatchedCount: successCount },
  });
});

export default router;
