import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { createEmployeeSchema, UserRole } from '@ilab/shared';
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest, authenticateToken, requireLabTenant, requireRole } from '../middleware/auth';

const router = Router();

/**
 * List all team members in the laboratory with live workloads
 */
router.get('/', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;

  const memberships = await prisma.labMembership.findMany({
    where: { labId },
    include: {
      user: true,
    },
    orderBy: { joinedAt: 'asc' },
  });

  const team = await Promise.all(
    memberships.map(async (m) => {
      // Calculate current active workload
      const activeJobsCount = await prisma.jobAssignment.count({
        where: {
          technicianId: m.userId,
          status: { in: ['ASSIGNED', 'ACCEPTED'] },
          repairJob: {
            labId,
            status: { notIn: ['QC_PASSED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'CANCELLED'] as any },
          },
        },
      });

      return {
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        avatarUrl: m.user.avatarUrl,
        employeeId: m.user.employeeId,
        role: m.role,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        activeWorkload: activeJobsCount,
      };
    })
  );

  res.json({ success: true, data: team });
});

/**
 * Add / Invite a new employee to the laboratory (Lab Owner / Lab Manager only)
 */
router.post(
  '/',
  authenticateToken,
  requireLabTenant,
  requireRole([UserRole.LAB_OWNER, UserRole.LAB_MANAGER]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const labId = req.user!.labId!;
    const adminId = req.user!.id;

    try {
      const input = createEmployeeSchema.parse(req.body);

      // Check lab subscription employee limit
      const subscription = await prisma.subscription.findUnique({
        where: { labId },
        include: { plan: true },
      });

      if (subscription && subscription.plan) {
        const currentEmployeesCount = await prisma.labMembership.count({
          where: { labId, isActive: true },
        });

        if (currentEmployeesCount >= subscription.plan.maxEmployees) {
          res.status(403).json({
            success: false,
            message: `Employee limit of ${subscription.plan.maxEmployees} reached for plan ${subscription.plan.name}. Please upgrade your subscription plan.`,
          });
          return;
        }
      }

      // Check if user already exists
      let user = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      const passwordHash = await bcrypt.hash(input.password, 10);

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: input.email.toLowerCase(),
            name: input.name,
            phone: input.phone || null,
            employeeId: input.employeeId || null,
            passwordHash,
          },
        });
      }

      // Check if already in lab
      const existingMembership = await prisma.labMembership.findUnique({
        where: {
          labId_userId: { labId, userId: user.id },
        },
      });

      if (existingMembership) {
        res.status(400).json({ success: false, message: 'This user is already a member of this laboratory' });
        return;
      }

      const membership = await prisma.labMembership.create({
        data: {
          labId,
          userId: user.id,
          role: input.role,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          labId,
          userId: adminId,
          action: 'ADD_EMPLOYEE',
          afterState: { employeeId: user.id, role: input.role, email: user.email },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Employee added successfully',
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to add employee' });
    }
  }
);

/**
 * Update employee role or active status
 */
router.patch(
  '/:userId',
  authenticateToken,
  requireLabTenant,
  requireRole([UserRole.LAB_OWNER, UserRole.LAB_MANAGER]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const labId = req.user!.labId!;
    const adminId = req.user!.id;
    const { role, isActive } = req.body;

    const membership = await prisma.labMembership.findUnique({
      where: { labId_userId: { labId, userId: req.params.userId } },
    });

    if (!membership) {
      res.status(404).json({ success: false, message: 'Employee membership not found' });
      return;
    }

    const updated = await prisma.labMembership.update({
      where: { id: membership.id },
      data: {
        role: role || membership.role,
        isActive: isActive !== undefined ? isActive : membership.isActive,
      },
    });

    await prisma.auditLog.create({
      data: {
        labId,
        userId: adminId,
        action: 'UPDATE_EMPLOYEE',
        beforeState: { role: membership.role, isActive: membership.isActive },
        afterState: { role: updated.role, isActive: updated.isActive },
      },
    });

    res.json({ success: true, message: 'Employee updated', data: updated });
  }
);

export default router;
