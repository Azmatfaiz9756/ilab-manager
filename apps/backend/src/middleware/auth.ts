import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { UserRole } from '@ilab/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  labId?: string;
  role?: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Validates JWT access token and extracts user
 */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Access token required' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      labId?: string;
      role?: UserRole;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        memberships: {
          where: { isActive: true },
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'User not found or inactive' });
      return;
    }

    // Determine lab context
    const requestedLabId = (req.headers['x-lab-id'] as string) || payload.labId;
    let currentMembership = user.memberships.find((m) => m.labId === requestedLabId);

    // If no specific lab requested, default to first active lab membership
    if (!currentMembership && user.memberships.length > 0) {
      currentMembership = user.memberships[0];
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      labId: currentMembership?.labId,
      role: currentMembership?.role as unknown as UserRole,
    };

    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}

/**
 * Strict tenant isolation check: guarantees request is scoped to a valid lab
 */
export function requireLabTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.isSuperAdmin) {
    // Super admin can operate across labs if specified, or default
    if (!req.user.labId && req.headers['x-lab-id']) {
      req.user.labId = req.headers['x-lab-id'] as string;
    }
    if (!req.user.labId) {
      res.status(400).json({ success: false, message: 'x-lab-id header required for Super Admin operations' });
      return;
    }
    next();
    return;
  }

  if (!req.user?.labId) {
    res.status(403).json({ success: false, message: 'No active laboratory membership associated with this session' });
    return;
  }

  next();
}

/**
 * Role-Based Access Control Middleware
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.isSuperAdmin) {
      next();
      return;
    }

    if (!req.user?.role || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: requires one of the following roles: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
