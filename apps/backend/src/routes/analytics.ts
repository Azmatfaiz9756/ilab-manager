import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { DeviceStatus, UserRole } from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant, requireRole } from '../middleware/auth';

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

/**
 * Daily / Weekly / Monthly Profit & Loss (P&L) Analytics
 */
router.get('/pnl', authenticateToken, requireLabTenant, requireRole([UserRole.LAB_OWNER, UserRole.LAB_MANAGER]), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { period = 'month' } = req.query;

  const now = new Date();
  let startDate = new Date();

  if (period === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    startDate.setDate(now.getDate() - 7);
  } else if (period === 'all') {
    startDate = new Date(2020, 0, 1);
  } else {
    startDate.setDate(now.getDate() - 30);
  }

  const jobs = await prisma.repairJob.findMany({
    where: {
      labId,
      updatedAt: { gte: startDate },
      status: { in: [DeviceStatus.DISPATCHED, DeviceStatus.QC_PASSED, DeviceStatus.READY_FOR_DISPATCH, DeviceStatus.REPAIR_COMPLETED] },
    },
    include: {
      parts: true,
      device: { include: { model: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  let grossRevenue = 0;
  let techLaborCost = 0;
  let partsExpense = 0;

  for (const j of jobs) {
    const lCost = j.repairCost || 0;
    const pCost = j.partsCost || 0;
    techLaborCost += lCost;
    partsExpense += pCost;

    const customerPrice = (lCost > 0 ? lCost * 1.8 : 800) + pCost;
    grossRevenue += customerPrice;
  }

  const netProfit = grossRevenue - (techLaborCost + partsExpense);
  const marginPercent = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 0;

  res.json({
    success: true,
    data: {
      period,
      grossRevenue: Math.round(grossRevenue),
      techLaborCost: Math.round(techLaborCost),
      partsExpense: Math.round(partsExpense),
      netProfit: Math.round(netProfit),
      marginPercent,
      completedRepairsCount: jobs.length,
      recentJobs: jobs.slice(0, 15),
    },
  });
});

/**
 * Technician Performance Leaderboard & Rework / Return Claim Ranking
 */
router.get('/technician-rankings', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;

  const memberships = await prisma.labMembership.findMany({
    where: {
      labId,
      role: { in: [UserRole.BOARD_TECHNICIAN, UserRole.QC_TECHNICIAN] },
    },
    include: {
      user: { select: { id: true, name: true, phone: true } },
    },
  });

  const rankings = await Promise.all(
    memberships.map(async (m) => {
      const techId = m.userId;

      const assignedJobs = await prisma.repairJob.findMany({
        where: {
          labId,
          assignments: { some: { technicianId: techId } },
        },
        select: {
          id: true,
          status: true,
          isReturnClaim: true,
          repairCost: true,
        },
      });

      const totalAssigned = assignedJobs.length;
      const completedStatuses: string[] = [
        DeviceStatus.QC_PASSED,
        DeviceStatus.READY_FOR_DISPATCH,
        DeviceStatus.DISPATCHED,
        DeviceStatus.REPAIR_COMPLETED,
      ];
      const completedCount = assignedJobs.filter((j) => completedStatuses.includes(j.status)).length;

      const returnClaimCount = assignedJobs.filter((j) => j.isReturnClaim).length;
      const reworkRate = completedCount > 0 ? Math.round((returnClaimCount / completedCount) * 100) : 0;
      const successRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;
      const totalEarned = assignedJobs.reduce((sum, j) => sum + (j.repairCost || 0), 0);

      return {
        technician: m.user,
        role: m.role,
        totalAssigned,
        completedCount,
        returnClaimCount,
        reworkRate,
        successRate,
        totalEarned,
      };
    })
  );

  rankings.sort((a, b) => b.completedCount - a.completedCount || a.reworkRate - b.reworkRate);

  res.json({ success: true, data: rankings });
});

export default router;
