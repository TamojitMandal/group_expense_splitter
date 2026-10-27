import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../middleware/validate';
import { authenticate, requireGroupMember } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import {
  calculateEqualSplits,
  calculateExactSplits,
  calculatePercentSplits,
  ComputedSplit,
} from '../lib/splits';
import { convertForeignToPaise, formatINR } from '../lib/money';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireGroupMember);

const ExpenseSplitInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  amountPaise: z.number().int().nonnegative().optional(),
  percent: z.union([z.string(), z.number()]).optional(),
});

const CreateExpenseSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(120, 'Description cannot exceed 120 characters'),
  amountPaise: z.number().int().positive('Amount must be greater than 0 paise'),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  originalAmountPaise: z.number().int().positive().optional(),
  exchangeRate: z.string().trim().optional(),
  paidById: z.string().uuid('Invalid payer user ID'),
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENT']),
  date: z.string().datetime().optional().or(z.date().optional()),
  // For EQUAL: participantUserIds or splits with userIds
  participantUserIds: z.array(z.string().uuid()).optional(),
  splits: z.array(ExpenseSplitInputSchema).optional(),
});

const ExpenseIdParamSchema = z.object({
  id: z.string().uuid(),
  expenseId: z.string().uuid('Invalid expense ID format'),
});

// Helper to compute and validate splits for an expense
async function resolveExpenseSplits(
  groupId: string,
  totalPaise: number,
  splitType: 'EQUAL' | 'EXACT' | 'PERCENT',
  participantUserIds?: string[],
  splits?: Array<{ userId: string; amountPaise?: number; percent?: string | number }>
): Promise<ComputedSplit[]> {
  // 1. Fetch all valid members in this group to enforce membership
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  const validMemberIds = new Set(groupMembers.map((m) => m.userId));

  // 2. Validate participants
  let candidateUserIds: string[] = [];
  if (splitType === 'EQUAL') {
    if (participantUserIds && participantUserIds.length > 0) {
      candidateUserIds = participantUserIds;
    } else if (splits && splits.length > 0) {
      candidateUserIds = splits.map((s) => s.userId);
    } else {
      throw new BadRequestError('At least one participant is required for an equal split', {
        participants: 'At least one participant is required',
      });
    }
  } else {
    if (!splits || splits.length === 0) {
      throw new BadRequestError('At least one split participant is required', {
        splits: 'At least one split participant is required',
      });
    }
    candidateUserIds = splits.map((s) => s.userId);
  }

  // Ensure every participant is a member of the group
  for (const uid of candidateUserIds) {
    if (!validMemberIds.has(uid)) {
      throw new BadRequestError(`User ${uid} is not a member of this group`, {
        participants: `Participant ${uid} does not belong to this group`,
      });
    }
  }

  // 3. Compute shares based on split type
  switch (splitType) {
    case 'EQUAL':
      return calculateEqualSplits(totalPaise, candidateUserIds);

    case 'EXACT':
      return calculateExactSplits(
        totalPaise,
        splits!.map((s) => ({
          userId: s.userId,
          amountPaise: s.amountPaise ?? 0,
        }))
      );

    case 'PERCENT':
      return calculatePercentSplits(
        totalPaise,
        splits!.map((s) => ({
          userId: s.userId,
          percent: s.percent ?? 0,
        }))
      );
  }
}

// POST /api/groups/:id/expenses - Create expense
router.post(
  '/',
  validate({ body: CreateExpenseSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id as string;
      const {
        description,
        paidById,
        splitType,
        participantUserIds,
        splits: inputSplits,
        date,
        currency,
        originalAmountPaise,
        exchangeRate,
      } = req.body;

      let effectiveAmountPaise = req.body.amountPaise;

      // Multi-currency calculation if provided
      if (currency && currency !== req.group!.currency && exchangeRate && originalAmountPaise) {
        effectiveAmountPaise = convertForeignToPaise(originalAmountPaise, exchangeRate);
      }

      // Verify payer is a group member
      const payerMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: paidById } },
        include: { user: { select: { name: true } } },
      });

      if (!payerMember) {
        throw new BadRequestError('The payer must be an active member of this group', {
          paidById: 'Selected payer is not a member of this group',
        });
      }

      // Compute and validate splits
      const computedSplits = await resolveExpenseSplits(
        groupId,
        effectiveAmountPaise,
        splitType,
        participantUserIds,
        inputSplits
      );

      // Create expense and write activity inside transaction
      const expense = await prisma.$transaction(async (tx) => {
        const createdExpense = await tx.expense.create({
          data: {
            groupId,
            description,
            amountPaise: effectiveAmountPaise,
            currency: currency || req.group!.currency,
            originalAmountPaise: originalAmountPaise || null,
            exchangeRate: exchangeRate || null,
            paidById,
            splitType,
            date: date ? new Date(date) : new Date(),
            createdById: req.user!.id,
            splits: {
              create: computedSplits.map((s) => ({
                userId: s.userId,
                owedPaise: s.owedPaise,
                basisPoints: s.basisPoints || null,
              })),
            },
          },
          include: {
            paidBy: { select: { id: true, name: true, email: true } },
            splits: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        });

        // Audit log
        await tx.activity.create({
          data: {
            groupId,
            actorId: req.user!.id,
            type: 'EXPENSE_ADDED',
            message: `${req.user!.name} added "${description}" (${formatINR(effectiveAmountPaise)})`,
            metadata: JSON.stringify({
              expenseId: createdExpense.id,
              amountPaise: effectiveAmountPaise,
              paidById,
            }),
          },
        });

        return createdExpense;
      });

      res.status(201).json({ expense });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups/:id/expenses - List non-deleted expenses with splits
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const groupId = req.params.id as string;

    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null,
      },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    res.status(200).json({ expenses });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:id/expenses/:expenseId - Edit expense
router.put(
  '/:expenseId',
  validate({ params: ExpenseIdParamSchema, body: CreateExpenseSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id as string;
      const expenseId = req.params.expenseId as string;
      const {
        description,
        paidById,
        splitType,
        participantUserIds,
        splits: inputSplits,
        date,
        currency,
        originalAmountPaise,
        exchangeRate,
      } = req.body;

      const existingExpense = await prisma.expense.findFirst({
        where: { id: expenseId, groupId, deletedAt: null },
      });

      if (!existingExpense) {
        throw new NotFoundError('Expense not found or already deleted');
      }

      // Permission check: only expense creator OR group owner can edit
      const isCreator = existingExpense.createdById === req.user!.id;
      const isOwner = req.groupMember!.role === 'OWNER';
      if (!isCreator && !isOwner) {
        throw new ForbiddenError(
          'Permission denied: Only the expense creator or group owner can edit this expense'
        );
      }

      let effectiveAmountPaise = req.body.amountPaise;
      if (currency && currency !== req.group!.currency && exchangeRate && originalAmountPaise) {
        effectiveAmountPaise = convertForeignToPaise(originalAmountPaise, exchangeRate);
      }

      // Validate payer
      const payerMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: paidById } },
      });

      if (!payerMember) {
        throw new BadRequestError('The payer must be an active member of this group', {
          paidById: 'Selected payer is not a member of this group',
        });
      }

      const computedSplits = await resolveExpenseSplits(
        groupId,
        effectiveAmountPaise,
        splitType,
        participantUserIds,
        inputSplits
      );

      // Perform update and split recomputation inside transaction
      const updatedExpense = await prisma.$transaction(async (tx) => {
        // Delete previous splits
        await tx.expenseSplit.deleteMany({
          where: { expenseId },
        });

        const updated = await tx.expense.update({
          where: { id: expenseId },
          data: {
            description,
            amountPaise: effectiveAmountPaise,
            currency: currency || req.group!.currency,
            originalAmountPaise: originalAmountPaise || null,
            exchangeRate: exchangeRate || null,
            paidById,
            splitType,
            date: date ? new Date(date) : existingExpense.date,
            splits: {
              create: computedSplits.map((s) => ({
                userId: s.userId,
                owedPaise: s.owedPaise,
                basisPoints: s.basisPoints || null,
              })),
            },
          },
          include: {
            paidBy: { select: { id: true, name: true, email: true } },
            splits: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        });

        await tx.activity.create({
          data: {
            groupId,
            actorId: req.user!.id,
            type: 'EXPENSE_EDITED',
            message: `${req.user!.name} updated "${description}" (${formatINR(effectiveAmountPaise)})`,
            metadata: JSON.stringify({
              expenseId,
              amountPaise: effectiveAmountPaise,
            }),
          },
        });

        return updated;
      });

      res.status(200).json({ expense: updatedExpense });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/groups/:id/expenses/:expenseId - Soft delete expense
router.delete(
  '/:expenseId',
  validate({ params: ExpenseIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id as string;
      const expenseId = req.params.expenseId as string;

      const existingExpense = await prisma.expense.findFirst({
        where: { id: expenseId, groupId, deletedAt: null },
      });

      if (!existingExpense) {
        throw new NotFoundError('Expense not found or already deleted');
      }

      // Permission check: only expense creator OR group owner can delete
      const isCreator = existingExpense.createdById === req.user!.id;
      const isOwner = req.groupMember!.role === 'OWNER';
      if (!isCreator && !isOwner) {
        throw new ForbiddenError(
          'Permission denied: Only the expense creator or group owner can delete this expense'
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.expense.update({
          where: { id: expenseId },
          data: { deletedAt: new Date() },
        });

        await tx.activity.create({
          data: {
            groupId,
            actorId: req.user!.id,
            type: 'EXPENSE_DELETED',
            message: `${req.user!.name} deleted expense "${existingExpense.description}" (${formatINR(existingExpense.amountPaise)})`,
            metadata: JSON.stringify({
              expenseId,
              description: existingExpense.description,
              amountPaise: existingExpense.amountPaise,
            }),
          },
        });
      });

      res.status(200).json({
        message: 'Expense deleted successfully',
        deletedExpenseId: expenseId,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
