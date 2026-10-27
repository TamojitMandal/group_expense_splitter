import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { validate } from '../middleware/validate';
import { authenticate, requireGroupMember } from '../middleware/auth';
import { BadRequestError } from '../errors';
import { calculateNetBalances, calculateSettlements } from '../lib/settle';
import { formatINR } from '../lib/money';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireGroupMember);

const RecordPaymentSchema = z.object({
  fromUserId: z.string().uuid('Invalid sender user ID'),
  toUserId: z.string().uuid('Invalid receiver user ID'),
  amountPaise: z.number().int().positive('Payment amount must be greater than 0 paise'),
  note: z.string().trim().max(200).optional(),
});

// Helper to get group member map, expenses, and payments
async function getGroupFinancialData(groupId: string) {
  const [members, expenses, payments] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.expense.findMany({
      where: { groupId, deletedAt: null },
      include: { splits: true },
    }),
    prisma.payment.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const allMemberIds = members.map((m) => m.userId);
  const userMap = new Map(members.map((m) => [m.userId, m.user]));

  const netMap = calculateNetBalances(
    allMemberIds,
    expenses.map((e) => ({
      paidById: e.paidById,
      amountPaise: e.amountPaise,
      splits: e.splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
    })),
    payments.map((p) => ({
      fromUserId: p.fromUserId,
      toUserId: p.toUserId,
      amountPaise: p.amountPaise,
    }))
  );

  return { members, userMap, netMap, payments };
}

// GET /api/groups/:id/balances - Net balance per member in paise
router.get('/balances', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const groupId = req.params.id;
    const { members, userMap, netMap } = await getGroupFinancialData(groupId);

    const balances = members.map((m) => {
      const user = userMap.get(m.userId)!;
      return {
        userId: m.userId,
        name: user.name,
        email: user.email,
        role: m.role,
        netPaise: netMap.get(m.userId) || 0,
      };
    });

    res.status(200).json({ balances });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id/settlements - Suggested minimal payment plan
router.get('/settlements', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const groupId = req.params.id;
    const { userMap, netMap } = await getGroupFinancialData(groupId);

    const rawTransactions = calculateSettlements(netMap);

    const settlements = rawTransactions.map((tx) => ({
      fromUser: userMap.get(tx.fromUserId)!,
      toUser: userMap.get(tx.toUserId)!,
      amountPaise: tx.amountPaise,
    }));

    res.status(200).json({ settlements });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/:id/payments - Record a settlement payment
router.post(
  '/payments',
  validate({ body: RecordPaymentSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const groupId = req.params.id;
      const { fromUserId, toUserId, amountPaise, note } = req.body;

      if (fromUserId === toUserId) {
        throw new BadRequestError('Payment sender and receiver cannot be the same user', {
          toUserId: 'Cannot make payment to yourself',
        });
      }

      const { userMap, netMap } = await getGroupFinancialData(groupId);

      if (!userMap.has(fromUserId)) {
        throw new BadRequestError('Payment sender is not a member of this group', {
          fromUserId: 'Sender does not belong to group',
        });
      }

      if (!userMap.has(toUserId)) {
        throw new BadRequestError('Payment receiver is not a member of this group', {
          toUserId: 'Receiver does not belong to group',
        });
      }

      const sender = userMap.get(fromUserId)!;
      const receiver = userMap.get(toUserId)!;

      // Soft warning check if payment exceeds debtor balance
      let warning: string | undefined;
      const senderNet = netMap.get(fromUserId) || 0;
      if (senderNet < 0 && amountPaise > Math.abs(senderNet)) {
        warning = `Payment of ${formatINR(amountPaise)} exceeds sender's total net debt of ${formatINR(Math.abs(senderNet))}.`;
      }

      // Record payment and activity inside transaction
      const payment = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            groupId,
            fromUserId,
            toUserId,
            amountPaise,
            note: note || null,
          },
          include: {
            fromUser: { select: { id: true, name: true, email: true } },
            toUser: { select: { id: true, name: true, email: true } },
          },
        });

        await tx.activity.create({
          data: {
            groupId,
            actorId: req.user!.id,
            type: 'PAYMENT_RECORDED',
            message: `${sender.name} paid ${receiver.name} ${formatINR(amountPaise)}`,
            metadata: JSON.stringify({
              paymentId: createdPayment.id,
              fromUserId,
              toUserId,
              amountPaise,
            }),
          },
        });

        return createdPayment;
      });

      res.status(201).json({
        payment,
        warning,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups/:id/payments - List recorded payments
router.get('/payments', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const groupId = req.params.id;

    const payments = await prisma.payment.findMany({
      where: { groupId },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ payments });
  } catch (err) {
    next(err);
  }
});

export default router;
