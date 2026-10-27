import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../middleware/validate';
import { authenticate, requireGroupMember } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireGroupMember);

const ActivityQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
});

// GET /api/groups/:id/activity - Paginated activity log
router.get(
  '/',
  validate({ query: ActivityQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const [total, activities] = await Promise.all([
        prisma.activity.count({ where: { groupId } }),
        prisma.activity.findMany({
          where: { groupId },
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      res.status(200).json({
        activities,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
