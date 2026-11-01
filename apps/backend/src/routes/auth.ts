import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';
import { registerLabSchema, loginSchema, UserRole, SubscriptionTier } from '@ilab/shared';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

function generateTokens(userId: string, labId?: string, role?: UserRole) {
  const accessToken = jwt.sign({ userId, labId, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });

  const refreshToken = jwt.sign({ userId, labId }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as any,
  });

  return { accessToken, refreshToken };
}

/**
 * Register New Laboratory & Lab Owner Account
 */
router.post('/register-lab', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerLabSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      res.status(400).json({ success: false, message: 'Email address is already registered' });
      return;
    }

    const slug =
      data.labSlug ||
      data.labName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') +
        '-' +
        Math.floor(1000 + Math.random() * 9000);

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Get Starter plan
    let starterPlan = await prisma.subscriptionPlan.findUnique({
      where: { tier: SubscriptionTier.STARTER },
    });

    if (!starterPlan) {
      starterPlan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Starter Plan',
          tier: SubscriptionTier.STARTER,
          maxEmployees: 5,
          maxMonthlyDevices: 100,
          priceMonthly: 49.0,
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Lab
      const lab = await tx.lab.create({
        data: {
          name: data.labName,
          slug,
          settings: {
            requireQcChecklist: true,
            allowTechSelfAssignment: false,
            notifyOnReturnClaim: true,
          },
        },
      });

      // 2. Create Owner User
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          name: data.ownerName,
          phone: data.phone || null,
        },
      });

      // 3. Create Lab Membership as LAB_OWNER
      const membership = await tx.labMembership.create({
        data: {
          labId: lab.id,
          userId: user.id,
          role: UserRole.LAB_OWNER,
        },
      });

      // 4. Create Active Starter Subscription (30 days period)
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await tx.subscription.create({
        data: {
          labId: lab.id,
          planId: starterPlan!.id,
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
      });

      // 5. Activity Log
      await tx.activityLog.create({
        data: {
          labId: lab.id,
          userId: user.id,
          action: 'REGISTER_LAB',
          entityType: 'LAB',
          entityId: lab.id,
          metadata: { labName: lab.name, ownerEmail: user.email },
        },
      });

      return { lab, user, membership };
    });

    const tokens = generateTokens(result.user.id, result.lab.id, UserRole.LAB_OWNER);

    // Store refresh token
    await prisma.user.update({
      where: { id: result.user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.status(201).json({
      success: true,
      message: 'Laboratory registered successfully',
      data: {
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: UserRole.LAB_OWNER,
        },
        lab: {
          id: result.lab.id,
          name: result.lab.name,
          slug: result.lab.slug,
        },
        tokens,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Registration failed' });
  }
});

/**
 * Login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: {
        memberships: {
          where: { isActive: true },
          include: { lab: true },
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.isSuperAdmin && user.memberships.length === 0) {
      res.status(403).json({ success: false, message: 'No active laboratory memberships found' });
      return;
    }

    // Default to primary active membership
    const primaryMembership = user.memberships[0];
    const role = user.isSuperAdmin ? UserRole.SUPER_ADMIN : (primaryMembership.role as unknown as UserRole);
    const labId = primaryMembership?.labId;

    const tokens = generateTokens(user.id, labId, role);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          employeeId: user.employeeId,
          role,
          isSuperAdmin: user.isSuperAdmin,
        },
        lab: primaryMembership
          ? {
              id: primaryMembership.lab.id,
              name: primaryMembership.lab.name,
              slug: primaryMembership.lab.slug,
            }
          : null,
        memberships: user.memberships.map((m) => ({
          labId: m.lab.id,
          labName: m.lab.name,
          role: m.role,
        })),
        tokens,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Login failed' });
  }
});

/**
 * Refresh Token Rotation
 */
router.post('/refresh-token', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ success: false, message: 'Refresh token is required' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as { userId: string; labId?: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        memberships: {
          where: { isActive: true },
        },
      },
    });

    if (!user || user.refreshToken !== refreshToken || !user.isActive) {
      res.status(403).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const membership = user.memberships.find((m) => m.labId === payload.labId) || user.memberships[0];
    const role = user.isSuperAdmin ? UserRole.SUPER_ADMIN : (membership?.role as unknown as UserRole);

    const newTokens = generateTokens(user.id, membership?.labId, role);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newTokens.refreshToken },
    });

    res.json({
      success: true,
      data: newTokens,
    });
  } catch (err) {
    res.status(403).json({ success: false, message: 'Invalid refresh token' });
  }
});

/**
 * Get Current User Profile and Active Lab Session
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      memberships: {
        where: { isActive: true },
        include: { lab: true },
      },
    },
  });

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const currentMembership = user.memberships.find((m) => m.labId === req.user!.labId) || user.memberships[0];

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        employeeId: user.employeeId,
        role: req.user!.role,
        isSuperAdmin: user.isSuperAdmin,
      },
      currentLab: currentMembership
        ? {
            id: currentMembership.lab.id,
            name: currentMembership.lab.name,
            slug: currentMembership.lab.slug,
            role: currentMembership.role,
          }
        : null,
      memberships: user.memberships.map((m) => ({
        labId: m.lab.id,
        labName: m.lab.name,
        role: m.role,
      })),
    },
  });
});

/**
 * Logout
 */
router.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { refreshToken: null },
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
