import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { DeviceStatus, UserRole } from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant } from '../middleware/auth';

const router = Router();

/**
 * Role-Specific Dashboard Metrics
 */
router.get('/dashboard', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const userId = req.user!.id;
  const role = req.user!.role;

  // 1. LAB OWNER / MANAGER DASHBOARD
  if (role === UserRole.LAB_OWNER || role === UserRole.LAB_MANAGER || req.user!.isSuperAdmin) {
    const [
      totalDevices,
      inLabCount,
      waitingAssignment,
      assignedToTech,
      inProgress,
      qcPending,
      repairedCount,
      notPossibleCount,
      returnClaimsCount,
      qcFailedCount,
    ] = await Promise.all([
      prisma.device.count({ where: { labId } }),
      prisma.device.count({
        where: {
          labId,
          currentStatus: { notIn: [DeviceStatus.DISPATCHED, DeviceStatus.CANCELLED] },
        },
      }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.WAITING_FOR_ASSIGNMENT } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.ASSIGNED_TO_TECHNICIAN } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.REPAIR_IN_PROGRESS } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.QC_PENDING } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.READY_FOR_DISPATCH } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.REPAIR_NOT_POSSIBLE } }),
      prisma.returnClaim.count({ where: { labId } }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.QC_FAILED } }),
    ]);

    res.json({
      success: true,
      data: {
        role,
        metrics: {
          totalDevices,
          devicesInLab: inLabCount,
          waitingAssignment,
          assignedToTech,
          inProgress,
          qcPending,
          repairedSuccess: repairedCount,
          notPossible: notPossibleCount,
          returnClaims: returnClaimsCount,
          qcFailed: qcFailedCount,
        },
      },
    });
    return;
  }

  // 2. QC TECHNICIAN DASHBOARD
  if (role === UserRole.QC_TECHNICIAN) {
    const [
      newEntriesToday,
      waitingAssignment,
      qcPending,
      qcPassedTotal,
      qcFailedTotal,
      returnClaimsTotal,
    ] = await Promise.all([
      prisma.device.count({
        where: {
          labId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.device.count({ where: { labId, currentStatus: DeviceStatus.WAITING_FOR_ASSIGNMENT } }),
      prisma.repairJob.count({ where: { labId, status: DeviceStatus.QC_PENDING } }),
      prisma.qCInspection.count({ where: { qcTechnicianId: userId, decision: 'QC_PASSED' } }),
      prisma.qCInspection.count({ where: { qcTechnicianId: userId, decision: 'QC_FAILED' } }),
      prisma.returnClaim.count({ where: { labId } }),
    ]);

    res.json({
      success: true,
      data: {
        role,
        metrics: {
          newEntriesToday,
          waitingAssignment,
          qcPending,
          qcPassedTotal,
          qcFailedTotal,
          returnClaimsTotal,
        },
      },
    });
    return;
  }

  // 3. BOARD TECHNICIAN DASHBOARD
  if (role === UserRole.BOARD_TECHNICIAN) {
    const [
      newAssignments,
      inProgress,
      onHold,
      partsRequired,
      repairedCompleted,
      submittedToQC,
      qcReturned,
    ] = await Promise.all([
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.ASSIGNED_TO_TECHNICIAN,
          assignments: { some: { technicianId: userId, status: 'ASSIGNED' } },
        },
      }),
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.REPAIR_IN_PROGRESS,
          assignments: { some: { technicianId: userId } },
        },
      }),
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.ON_HOLD,
          assignments: { some: { technicianId: userId } },
        },
      }),
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.PARTS_REQUIRED,
          assignments: { some: { technicianId: userId } },
        },
      }),
      prisma.repairAttempt.count({
        where: {
          technicianId: userId,
          result: 'REPAIRED',
          repairJob: { labId },
        },
      }),
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.QC_PENDING,
          assignments: { some: { technicianId: userId } },
        },
      }),
      prisma.repairJob.count({
        where: {
          labId,
          status: DeviceStatus.RETURN_TO_TECHNICIAN,
          assignments: { some: { technicianId: userId } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        role,
        metrics: {
          newAssignments,
          inProgress,
          onHold,
          partsRequired,
          repairedCompleted,
          submittedToQC,
          qcReturned,
        },
      },
    });
    return;
  }

  // Fallback for VIEWER
  res.json({ success: true, data: { role, metrics: {} } });
});

/**
 * Comprehensive Reports and Analytics Endpoint (with CSV formatting)
 */
router.get('/reports', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { format } = req.query;

  // Aggregate model-wise fault stats
  const modelStats = await prisma.deviceModel.findMany({
    where: { devices: { some: { labId } } },
    include: {
      devices: {
        where: { labId },
        select: {
          id: true,
          totalRepairCount: true,
          totalReturnCount: true,
          currentStatus: true,
        },
      },
    },
  });

  const modelReport = modelStats.map((m) => {
    const totalDevices = m.devices.length;
    const totalReturns = m.devices.reduce((acc, d) => acc + d.totalReturnCount, 0);
    return {
      modelName: m.name,
      totalReceived: totalDevices,
      totalReturns,
      returnRate: totalDevices > 0 ? `${((totalReturns / totalDevices) * 100).toFixed(1)}%` : '0%',
    };
  });

  // Export as CSV if requested
  if (format === 'csv') {
    let csv = 'Model Name,Total Received,Total Returns,Return Rate\n';
    modelReport.forEach((r) => {
      csv += `"${r.modelName}",${r.totalReceived},${r.totalReturns},"${r.returnRate}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ilab_model_report.csv"');
    res.send(csv);
    return;
  }

  res.json({
    success: true,
    data: {
      modelReport,
    },
  });
});

export default router;
