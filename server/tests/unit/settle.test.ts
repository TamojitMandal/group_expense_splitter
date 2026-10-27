import { describe, it, expect } from 'vitest';
import {
  calculateNetBalances,
  calculateSettlements,
  greedySettle,
  ExpenseRecord,
  PaymentRecord,
} from '../../src/lib/settle';
import { calculateEqualSplits } from '../../src/lib/splits';

describe('lib/settle.ts', () => {
  describe('calculateNetBalances', () => {
    it('correctly calculates net balance in a simple 2-person expense', () => {
      const members = ['userA', 'userB'];
      const expenses: ExpenseRecord[] = [
        {
          paidById: 'userA',
          amountPaise: 1000,
          splits: [
            { userId: 'userA', owedPaise: 500 },
            { userId: 'userB', owedPaise: 500 },
          ],
        },
      ];

      const netMap = calculateNetBalances(members, expenses, []);
      // userA paid 1000, owes 500 -> +500
      // userB paid 0, owes 500 -> -500
      expect(netMap.get('userA')).toBe(500);
      expect(netMap.get('userB')).toBe(-500);
      expect(netMap.get('userA')! + netMap.get('userB')!).toBe(0);
    });

    it('property-based test: balances sum to zero across 250 random expense sets', () => {
      const users = ['user1', 'user2', 'user3', 'user4', 'user5', 'user6'];

      for (let iteration = 0; iteration < 250; iteration++) {
        const numExpenses = Math.floor(Math.random() * 10) + 1;
        const expenses: ExpenseRecord[] = [];

        for (let e = 0; e < numExpenses; e++) {
          const payer = users[Math.floor(Math.random() * users.length)];
          const amount = Math.floor(Math.random() * 50000) + 1; // 1 to 50000 paise

          // Random subset of participants (at least 1)
          const numParts = Math.floor(Math.random() * users.length) + 1;
          const shuffled = [...users].sort(() => 0.5 - Math.random());
          const participants = shuffled.slice(0, numParts);

          const splits = calculateEqualSplits(amount, participants);

          expenses.push({
            paidById: payer,
            amountPaise: amount,
            splits: splits.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
          });
        }

        // Random payments
        const payments: PaymentRecord[] = [];
        const numPayments = Math.floor(Math.random() * 5);
        for (let p = 0; p < numPayments; p++) {
          const from = users[Math.floor(Math.random() * users.length)];
          const to = users[Math.floor(Math.random() * users.length)];
          if (from !== to) {
            payments.push({
              fromUserId: from,
              toUserId: to,
              amountPaise: Math.floor(Math.random() * 5000) + 1,
            });
          }
        }

        const netMap = calculateNetBalances(users, expenses, payments);
        let sumNet = 0;
        for (const net of netMap.values()) {
          sumNet += net;
        }

        expect(sumNet).toBe(0);
      }
    });
  });

  describe('calculateSettlements', () => {
    it('returns empty list when all members have 0 balance', () => {
      const netMap = new Map<string, number>([
        ['userA', 0],
        ['userB', 0],
      ]);
      const plan = calculateSettlements(netMap);
      expect(plan).toEqual([]);
    });

    it('settles 2-person debt with 1 transaction', () => {
      const netMap = new Map<string, number>([
        ['userA', 500],
        ['userB', -500],
      ]);
      const plan = calculateSettlements(netMap);
      expect(plan).toHaveLength(1);
      expect(plan[0]).toEqual({
        fromUserId: 'userB',
        toUserId: 'userA',
        amountPaise: 500,
      });
    });

    it('collapses 3-person transitive debt chain (A owes B owes C) to 1 payment', () => {
      // Suppose A owes B 100, and B owes C 100.
      // Net balances: A has -100, B has 0, C has +100
      const netMap = new Map<string, number>([
        ['userA', -100],
        ['userB', 0],
        ['userC', 100],
      ]);

      const plan = calculateSettlements(netMap);
      expect(plan).toHaveLength(1);
      expect(plan[0]).toEqual({
        fromUserId: 'userA',
        toUserId: 'userC',
        amountPaise: 100,
      });
    });

    it('zero-sum subset optimization beats plain greedy', () => {
      // Classical counterexample for greedy:
      // P1: +5, P2: +4, P3: +3, P4: -5, P5: -7
      // Sum = 0.
      // Optimal zero-sum subsets: {P1, P4} (size 2 -> 1 tx) and {P2, P3, P5} (size 3 -> 2 txs) => Total = 3 txs.
      // Plain greedy matching largest creditor with largest debtor takes 4 txs!
      const balances = [
        { userId: 'P1', netPaise: 500 },
        { userId: 'P2', netPaise: 400 },
        { userId: 'P3', netPaise: 300 },
        { userId: 'P4', netPaise: -500 },
        { userId: 'P5', netPaise: -700 },
      ];

      const greedyPlan = greedySettle([...balances]);
      expect(greedyPlan.length).toBe(4); // greedy takes 4 transactions

      const netMap = new Map<string, number>(balances.map((b) => [b.userId, b.netPaise]));
      const optimalPlan = calculateSettlements(netMap);
      expect(optimalPlan.length).toBe(3); // Bitmask DP finds 3 transactions!
    });

    it('after applying the settlement plan, every member balance becomes exactly 0', () => {
      const netMap = new Map<string, number>([
        ['Alice', 1450],
        ['Bob', -600],
        ['Charlie', -850],
        ['Dave', 300],
        ['Eve', -300],
      ]);

      const plan = calculateSettlements(netMap);

      // Simulate applying each payment in the plan
      const simulatedNet = new Map(netMap);
      for (const tx of plan) {
        simulatedNet.set(tx.fromUserId, simulatedNet.get(tx.fromUserId)! + tx.amountPaise);
        simulatedNet.set(tx.toUserId, simulatedNet.get(tx.toUserId)! - tx.amountPaise);
      }

      for (const [user, balance] of simulatedNet.entries()) {
        expect(balance).toBe(0);
      }
    });

    it('applying a recorded payment reduces the suggested plan correctly', () => {
      const members = ['userA', 'userB'];
      const expenses: ExpenseRecord[] = [
        {
          paidById: 'userA',
          amountPaise: 1000,
          splits: [
            { userId: 'userA', owedPaise: 500 },
            { userId: 'userB', owedPaise: 500 },
          ],
        },
      ];

      // Before payment: userB owes userA 500
      const netBefore = calculateNetBalances(members, expenses, []);
      const planBefore = calculateSettlements(netBefore);
      expect(planBefore).toHaveLength(1);
      expect(planBefore[0].amountPaise).toBe(500);

      // Record partial payment of 200 from userB to userA
      const payments: PaymentRecord[] = [
        { fromUserId: 'userB', toUserId: 'userA', amountPaise: 200 },
      ];
      const netAfter = calculateNetBalances(members, expenses, payments);
      const planAfter = calculateSettlements(netAfter);
      expect(planAfter).toHaveLength(1);
      expect(planAfter[0].amountPaise).toBe(300); // reduced from 500 to 300!
    });
  });
});
