import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { ReturnClaimType, ClaimReviewStatus, UserRole } from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken, requireLabTenant, requireRole } from '../middleware/auth';

const router = Router();

/**
 * List all Return Claims within the lab with filters
 */
router.get('/', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { type, reviewStatus } = req.query;

  const where: any = { labId };
  if (type) where.claimType = type as ReturnClaimType;
  if (reviewStatus) where.reviewStatus = reviewStatus as ClaimReviewStatus;

  const claims = await prisma.returnClaim.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      device: {
        include: {
          model: true,
          imeis: true,
          faults: { include: { fault: true } },
        },
      },
      previousRepairJob: {
        include: {
          assignments: { include: { technician: true }, take: 1, orderBy: { assignedAt: 'desc' } },
          attempts: { take: 1, orderBy: { attemptNumber: 'desc' } },
          qcInspections: { include: { qcTechnician: true }, take: 1, orderBy: { testedAt: 'desc' } },
        },
      },
      newRepairJob: {
        include: {
          assignments: { include: { technician: true }, take: 1, orderBy: { assignedAt: 'desc' } },
        },
      },
    },
  });

  res.json({ success: true, data: claims });
});

/**
 * Return Claim Analytics by Technician (Calculates real return rates tied to original technician)
 */
router.get('/analytics', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;

  // Fetch all board technicians in this lab
  const memberships = await prisma.labMembership.findMany({
    where: { labId, role: UserRole.BOARD_TECHNICIAN, isActive: true },
    include: { user: true },
  });

  const analytics = await Promise.all(
    memberships.map(async (m) => {
      const techId = m.userId;

      // 1. Total jobs assigned to this technician
      const totalAssigned = await prisma.jobAssignment.count({
        where: {
          technicianId: techId,
          repairJob: { labId },
        },
      });

      // 2. Total completed jobs
      const totalCompleted = await prisma.repairAttempt.count({
        where: {
          technicianId: techId,
          result: 'REPAIRED',
          repairJob: { labId },
        },
      });

      // 3. Claims where this technician was the previous repairer
      const returnClaims = await prisma.returnClaim.findMany({
        where: {
          labId,
          previousRepairJob: {
            assignments: { some: { technicianId: techId } },
          },
        },
      });

      const sameFaultCount = returnClaims.filter((c) => c.claimType === ReturnClaimType.SAME_FAULT).length;
      const diffFaultCount = returnClaims.filter((c) => c.claimType === ReturnClaimType.DIFFERENT_FAULT).length;
      const repeatReturnCount = returnClaims.filter((c) => c.claimType === ReturnClaimType.REPEAT_RETURN).length;

      const sameFaultRate = totalCompleted > 0 ? ((sameFaultCount / totalCompleted) * 100).toFixed(1) : '0.0';
      const overallReturnRate = totalCompleted > 0 ? ((returnClaims.length / totalCompleted) * 100).toFixed(1) : '0.0';

      return {
        technicianId: techId,
        name: m.user.name,
        email: m.user.email,
        totalAssigned,
        totalCompleted,
        totalReturns: returnClaims.length,
        sameFaultCount,
        diffFaultCount,
        repeatReturnCount,
        sameFaultRate: `${sameFaultRate}%`,
        overallReturnRate: `${overallReturnRate}%`,
      };
    })
  );

  res.json({ success: true, data: analytics });
});

/**
 * Review / Audit Return Claim (Manager/Owner only)
 */
router.post(
  '/:id/review',
  authenticateToken,
  requireLabTenant,
  requireRole([UserRole.LAB_OWNER, UserRole.LAB_MANAGER]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const labId = req.user!.labId!;
    const userId = req.user!.id;
    const { status, notes, overrideClaimType } = req.body;

    const claim = await prisma.returnClaim.findFirst({
      where: { id: req.params.id, labId },
    });

    if (!claim) {
      res.status(404).json({ success: false, message: 'Return claim not found' });
      return;
    }

    const updated = await prisma.returnClaim.update({
      where: { id: claim.id },
      data: {
        reviewStatus: status as ClaimReviewStatus,
        reviewNotes: notes,
        claimType: overrideClaimType || claim.claimType,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        labId,
        userId,
        action: 'REVIEW_RETURN_CLAIM',
        beforeState: { status: claim.reviewStatus, type: claim.claimType },
        afterState: { status: updated.reviewStatus, type: updated.claimType, notes },
      },
    });

    res.json({ success: true, message: 'Return claim review recorded', data: updated });
  }
);

export default router;
