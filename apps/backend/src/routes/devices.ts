import { Router, Response } from 'express';
import { prisma } from '../prisma';
import {
  newDeviceIntakeSchema,
  DeviceStatus,
  Department,
  UserRole,
  validateIMEILuhn,
} from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant } from '../middleware/auth';
import { ReturnClaimEngine } from '../services/returnClaimEngine';
import { recordDeviceMovement } from '../services/movementService';

const router = Router();

/**
 * Pre-intake IMEI check: verifies Luhn checksum & evaluates Return Claim / duplicate status
 */
router.post('/check-imei', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { imei, faultIds = [], customFaults = [] } = req.body;

  if (!imei) {
    res.status(400).json({ success: false, message: 'IMEI is required' });
    return;
  }

  const luhnResult = validateIMEILuhn(imei);
  if (!luhnResult.isValid) {
    res.status(400).json({ success: false, message: luhnResult.error });
    return;
  }

  const evaluation = await ReturnClaimEngine.evaluate(labId, [imei], faultIds, customFaults);

  // Check if device is currently in the lab and not yet dispatched
  let currentActiveJob = null;
  if (evaluation.existingDeviceId) {
    currentActiveJob = await prisma.repairJob.findFirst({
      where: {
        labId,
        deviceId: evaluation.existingDeviceId,
        status: { notIn: [DeviceStatus.DISPATCHED, DeviceStatus.CANCELLED] },
      },
      include: {
        device: { include: { model: true } },
        assignments: { include: { technician: true }, take: 1, orderBy: { assignedAt: 'desc' } },
      },
    });
  }

  res.json({
    success: true,
    data: {
      luhnValid: true,
      isInLabNow: !!currentActiveJob,
      currentActiveJob: currentActiveJob
        ? {
            id: currentActiveJob.id,
            jobNumber: currentActiveJob.jobNumber,
            status: currentActiveJob.status,
            modelName: currentActiveJob.device.model.name,
            assignedTechnician: currentActiveJob.assignments[0]?.technician?.name,
          }
        : null,
      evaluation,
    },
  });
});

/**
 * Register New Device Intake (Transaction-safe, duplicate prevention, return claim creation)
 */
router.post('/intake', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const currentUserId = req.user!.id;

  try {
    const input = newDeviceIntakeSchema.parse(req.body);

    const cleanImei1 = input.imei1.trim();
    const cleanImei2 = input.imei2 ? input.imei2.trim() : null;
    const imeisToCheck = [cleanImei1];
    if (cleanImei2) imeisToCheck.push(cleanImei2);

    // 1. Evaluate Return Claim Engine
    const claimEval = await ReturnClaimEngine.evaluate(
      labId,
      imeisToCheck,
      input.faultIds,
      input.customFaults || []
    );

    // 2. Prevent creating duplicate active repair if device is already active in the lab
    if (claimEval.existingDeviceId) {
      const activeJob = await prisma.repairJob.findFirst({
        where: {
          labId,
          deviceId: claimEval.existingDeviceId,
          status: { notIn: [DeviceStatus.DISPATCHED, DeviceStatus.CANCELLED] },
        },
      });

      if (activeJob) {
        res.status(409).json({
          success: false,
          message: `This device is currently active in the laboratory (Job: ${activeJob.jobNumber}, Status: ${activeJob.status}). Please update the existing job or dispatch the device before registering a new intake.`,
          existingJobId: activeJob.id,
        });
        return;
      }
    }

    // Generate unique job number for this lab: JOB-{YEAR}-{SEQUENCE}
    const currentYear = new Date().getFullYear();
    const jobCount = await prisma.repairJob.count({
      where: {
        labId,
        createdAt: { gte: new Date(`${currentYear}-01-01T00:00:00.000Z`) },
      },
    });
    const jobNumber = `JOB-${currentYear}-${String(jobCount + 1).padStart(4, '0')}`;

    const initialStatus = input.assignedTechnicianId
      ? DeviceStatus.ASSIGNED_TO_TECHNICIAN
      : DeviceStatus.WAITING_FOR_ASSIGNMENT;

    const initialDept = input.assignedTechnicianId ? Department.BOARD_REPAIR : Department.INTAKE;

    // Transactional creation
    const result = await prisma.$transaction(async (tx) => {
      let deviceId = claimEval.existingDeviceId;

      if (!deviceId) {
        // Create new device
        const newDevice = await tx.device.create({
          data: {
            labId,
            modelId: input.modelId,
            serialNumber: input.serialNumber || null,
            color: input.color || null,
            storage: input.storage || null,
            physicalCondition: input.physicalCondition || null,
            waterDamageStatus: input.waterDamageStatus,
            receivedFrom: input.receivedFrom || null,
            supplierReference: input.supplierReference || null,
            priority: input.priority,
            currentStatus: initialStatus,
            currentDepartment: initialDept,
            currentHolderId: input.assignedTechnicianId || currentUserId,
            totalRepairCount: 1,
            totalReturnCount: 0,
            initialNotes: input.initialNotes || null,
          },
        });
        deviceId = newDevice.id;

        // Register Primary IMEI 1
        await tx.deviceImei.create({
          data: {
            labId,
            deviceId: newDevice.id,
            imei: cleanImei1,
            isPrimary: true,
          },
        });

        // Register IMEI 2 if provided
        if (cleanImei2) {
          await tx.deviceImei.create({
            data: {
              labId,
              deviceId: newDevice.id,
              imei: cleanImei2,
              isPrimary: false,
            },
          });
        }
      } else {
        // Increment repair/return counter on existing device
        await tx.device.update({
          where: { id: deviceId },
          data: {
            currentStatus: initialStatus,
            currentDepartment: initialDept,
            currentHolderId: input.assignedTechnicianId || currentUserId,
            priority: input.priority,
            totalRepairCount: { increment: 1 },
            totalReturnCount: claimEval.isReturnClaim ? { increment: 1 } : undefined,
            initialNotes: input.initialNotes || null,
          },
        });
      }

      // Store device faults
      const createdDeviceFaultIds: string[] = [];
      for (const faultId of input.faultIds) {
        const df = await tx.deviceFault.create({
          data: {
            deviceId,
            faultId,
          },
        });
        createdDeviceFaultIds.push(df.id);
      }

      if (input.customFaults) {
        for (const customName of input.customFaults) {
          if (customName.trim()) {
            const df = await tx.deviceFault.create({
              data: {
                deviceId,
                customFaultName: customName.trim(),
              },
            });
            createdDeviceFaultIds.push(df.id);
          }
        }
      }

      // Create Return Claim Record if detected
      let returnClaimRecord = null;
      if (claimEval.isReturnClaim && claimEval.previousRepairJob) {
        returnClaimRecord = await tx.returnClaim.create({
          data: {
            labId,
            deviceId,
            previousRepairJobId: claimEval.previousRepairJob.id,
            claimType: claimEval.claimType!,
          },
        });
      }

      // Create Repair Job
      const repairJob = await tx.repairJob.create({
        data: {
          labId,
          deviceId,
          jobNumber,
          status: initialStatus,
          isReturnClaim: claimEval.isReturnClaim,
          returnClaimId: returnClaimRecord ? returnClaimRecord.id : null,
        },
      });

      // Link faults to this job
      for (const dfId of createdDeviceFaultIds) {
        await tx.repairJobFault.create({
          data: {
            repairJobId: repairJob.id,
            deviceFaultId: dfId,
          },
        });
      }

      // Initial Repair Attempt record
      if (input.assignedTechnicianId) {
        await tx.repairAttempt.create({
          data: {
            repairJobId: repairJob.id,
            attemptNumber: 1,
            technicianId: input.assignedTechnicianId,
          },
        });

        // Assignment record
        await tx.jobAssignment.create({
          data: {
            repairJobId: repairJob.id,
            technicianId: input.assignedTechnicianId,
            assignedById: currentUserId,
            status: 'ASSIGNED',
          },
        });

        // Push notification to assigned technician
        await tx.notification.create({
          data: {
            labId,
            userId: input.assignedTechnicianId,
            title: `New Repair Assigned: ${jobNumber}`,
            body: `You have been assigned an iPhone intake with priority: ${input.priority}`,
            data: { repairJobId: repairJob.id, deviceId },
          },
        });
      }

      // Store Photos if provided
      if (input.photos && input.photos.length > 0) {
        for (const photoUrl of input.photos) {
          await tx.devicePhoto.create({
            data: {
              deviceId,
              url: photoUrl,
              stage: 'INTAKE',
            },
          });
        }
      }

      // Activity log
      await tx.activityLog.create({
        data: {
          labId,
          userId: currentUserId,
          action: 'DEVICE_INTAKE',
          entityType: 'DEVICE',
          entityId: deviceId,
          metadata: {
            jobNumber,
            isReturnClaim: claimEval.isReturnClaim,
            claimType: claimEval.claimType,
          },
        },
      });

      return { deviceId, repairJob, returnClaim: returnClaimRecord };
    });

    // Record initial movement: Intake -> Board Repair (or QC)
    await recordDeviceMovement({
      labId,
      deviceId: result.deviceId,
      fromDepartment: Department.INTAKE,
      toDepartment: input.assignedTechnicianId ? Department.BOARD_REPAIR : Department.QC,
      fromUserId: currentUserId,
      toUserId: input.assignedTechnicianId || null,
      reason: input.assignedTechnicianId ? 'Assigned to Board Technician' : 'Received at QC Intake',
      notes: input.initialNotes,
    });

    res.status(201).json({
      success: true,
      message: claimEval.isReturnClaim
        ? `Device intake recorded as ${claimEval.claimType} return claim`
        : 'Device intake created successfully',
      data: {
        deviceId: result.deviceId,
        repairJobId: result.repairJob.id,
        jobNumber,
        claimEvaluation: claimEval,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Intake failed' });
  }
});

/**
 * List Devices with Advanced Filtering, Search & Pagination
 */
router.get('/', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const {
    search,
    modelId,
    status,
    priority,
    department,
    technicianId,
    isReturnClaim,
    page = '1',
    limit = '20',
  } = req.query;

  const pageNum = parseInt(page as string, 10) || 1;
  const take = parseInt(limit as string, 10) || 20;
  const skip = (pageNum - 1) * take;

  const where: any = { labId };

  if (modelId) where.modelId = modelId as string;
  if (status) where.currentStatus = status as DeviceStatus;
  if (priority) where.priority = priority as any;
  if (department) where.currentDepartment = department as any;
  if (technicianId) where.currentHolderId = technicianId as string;

  if (search) {
    const term = (search as string).trim();
    where.OR = [
      { serialNumber: { contains: term, mode: 'insensitive' } },
      { imeis: { some: { imei: { contains: term } } } },
      { model: { name: { contains: term, mode: 'insensitive' } } },
      { repairJobs: { some: { jobNumber: { contains: term, mode: 'insensitive' } } } },
    ];
  }

  const [total, devices] = await Promise.all([
    prisma.device.count({ where }),
    prisma.device.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        model: true,
        imeis: true,
        faults: {
          include: { fault: { include: { category: true } } },
        },
        repairJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            assignments: {
              include: { technician: true },
              orderBy: { assignedAt: 'desc' },
              take: 1,
            },
            returnClaim: true,
          },
        },
      },
    }),
  ]);

  res.json({
    success: true,
    data: devices,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / take),
      limit: take,
    },
  });
});

/**
 * Get Single Device Details & History
 */
router.get('/:id', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const device = await prisma.device.findFirst({
    where: { id: req.params.id, labId },
    include: {
      model: true,
      imeis: true,
      photos: true,
      faults: {
        include: {
          fault: { include: { category: true } },
        },
      },
      repairJobs: {
        orderBy: { createdAt: 'desc' },
        include: {
          jobFaults: {
            include: {
              deviceFault: {
                include: { fault: true },
              },
            },
          },
          assignments: {
            include: { technician: true, assignedBy: true },
          },
          attempts: {
            orderBy: { attemptNumber: 'desc' },
          },
          notes: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          },
          parts: true,
          qcInspections: {
            include: { qcTechnician: true, items: true },
            orderBy: { testedAt: 'desc' },
          },
          returnClaim: true,
        },
      },
      movements: {
        include: { fromUser: true, toUser: true },
        orderBy: { movedAt: 'desc' },
      },
      returnClaims: {
        include: { previousRepairJob: true },
      },
    },
  });

  if (!device) {
    res.status(404).json({ success: false, message: 'Device not found in this laboratory' });
    return;
  }

  res.json({ success: true, data: device });
});

export default router;
