import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { AuthenticatedRequest, authenticateToken, requireLabTenant } from '../middleware/auth';

const router = Router();

/**
 * Get all available iPhone models ordered by modern families
 */
router.get('/models', authenticateToken, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const models = await prisma.deviceModel.findMany({
    where: { isActive: true },
    orderBy: [{ orderIndex: 'desc' }, { name: 'asc' }],
  });

  res.json({ success: true, data: models });
});

/**
 * Get all categorized faults (system defaults + lab-specific additions)
 */
router.get('/faults', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;

  const categories = await prisma.faultCategory.findMany({
    where: {
      OR: [{ labId: null }, { labId }],
    },
    include: {
      faults: {
        where: {
          OR: [{ labId: null }, { labId }],
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: { orderIndex: 'asc' },
  });

  res.json({ success: true, data: categories });
});

/**
 * Add a lab-custom fault
 */
router.post('/faults', authenticateToken, requireLabTenant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const labId = req.user!.labId!;
  const { categoryId, name } = req.body;

  if (!categoryId || !name) {
    res.status(400).json({ success: false, message: 'categoryId and fault name are required' });
    return;
  }

  const fault = await prisma.fault.create({
    data: {
      categoryId,
      labId,
      name: name.trim(),
    },
  });

  res.status(201).json({ success: true, data: fault });
});

export default router;
