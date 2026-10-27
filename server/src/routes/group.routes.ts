import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../middleware/validate';
import { authenticate, requireGroupMember } from '../middleware/auth';
import { NotFoundError, ConflictError } from '../errors';
import { calculateNetBalances } from '../lib/settle';

const router = Router();

// All group routes require authentication
router.use(authenticate);

const CreateGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(80, 'Group name cannot exceed 80 characters'),
  currency: z.string().trim().toUpperCase().length(3, 'Currency must be a 3-letter code').default('INR'),
});

const AddMemberSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
});

const GroupIdParamSchema = z.object({
  id: z.string().uuid('Invalid group ID format'),
});

// POST /api/groups - Create a new group
router.post(
  '/',
  validate({ body: CreateGroupSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, currency } = req.body;
      const userId = req.user!.id;

      const group = await prisma.$transaction(async (tx) => {
        const newGroup = await tx.group.create({
          data: {
            name,
            currency: currency || 'INR',
            createdById: userId,
          },
        });

        // Add creator as OWNER
        await tx.groupMember.create({
          data: {
            groupId: newGroup.id,
            userId,
            role: 'OWNER',
          },
        });

        // Log activity
        await tx.activity.create({
          data: {
            groupId: newGroup.id,
            actorId: userId,
            type: 'GROUP_CREATED',
            message: `${req.user!.name} created group "${name}"`,
          },
        });

        return newGroup;
      });

      res.status(201).json({ group });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups - List all groups the user is member of, with user's net balance
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              select: { userId: true },
            },
            expenses: {
              where: { deletedAt: null },
              include: {
                splits: true,
              },
            },
            payments: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groupsWithBalances = memberships.map((m) => {
      const group = m.group;
      const allMemberIds = group.members.map((member) => member.userId);

      const netMap = calculateNetBalances(
        allMemberIds,
        group.expenses.map((e) => ({
          paidById: e.paidById,
          amountPaise: e.amountPaise,
          splits: e.splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
        })),
        group.payments.map((p) => ({
          fromUserId: p.fromUserId,
          toUserId: p.toUserId,
          amountPaise: p.amountPaise,
        }))
      );

      const myNetPaise = netMap.get(userId) || 0;

      return {
        id: group.id,
        name: group.name,
        currency: group.currency,
        createdAt: group.createdAt,
        role: m.role,
        memberCount: group.members.length,
        myNetPaise,
      };
    });

    res.status(200).json({ groups: groupsWithBalances });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id - Get group details and members
router.get(
  '/:id',
  validate({ params: GroupIdParamSchema }),
  requireGroupMember,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id;

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      if (!group) {
        throw new NotFoundError('Group not found');
      }

      res.status(200).json({
        group: {
          id: group.id,
          name: group.name,
          currency: group.currency,
          createdById: group.createdById,
          createdAt: group.createdAt,
          myRole: req.groupMember!.role,
          members: group.members.map((m) => ({
            id: m.id,
            userId: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            joinedAt: m.joinedAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/groups/:id/members - Add member by email
router.post(
  '/:id/members',
  validate({ params: GroupIdParamSchema, body: AddMemberSchema }),
  requireGroupMember,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id;
      const { email } = req.body;

      // 1. Verify user exists with clear 404 message
      const targetUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true },
      });

      if (!targetUser) {
        throw new NotFoundError(`No registered user found with email "${email}"`);
      }

      // 2. Verify not already a member
      const existingMember = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: targetUser.id,
          },
        },
      });

      if (existingMember) {
        throw new ConflictError(`User "${targetUser.name}" (${email}) is already a member of this group`);
      }

      // 3. Add member and record activity in transaction
      const newMember = await prisma.$transaction(async (tx) => {
        const member = await tx.groupMember.create({
          data: {
            groupId,
            userId: targetUser.id,
            role: 'MEMBER',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        await tx.activity.create({
          data: {
            groupId,
            actorId: req.user!.id,
            type: 'MEMBER_ADDED',
            message: `${req.user!.name} added ${targetUser.name} to the group`,
            metadata: JSON.stringify({ addedUserId: targetUser.id, addedUserEmail: email }),
          },
        });

        return member;
      });

      res.status(201).json({
        member: {
          id: newMember.id,
          userId: newMember.user.id,
          name: newMember.user.name,
          email: newMember.user.email,
          role: newMember.role,
          joinedAt: newMember.joinedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
