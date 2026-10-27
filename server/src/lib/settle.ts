/**
 * Optimal Balance and Debt Settlement (Settle-Up) Engine.
 *
 * Algorithm Strategy:
 * 1. Calculate Net Balances:
 *    net[user] = (sum paid for expenses) - (sum of owed shares) + (payments sent) - (payments received)
 *    Invariant: sum(all net balances) === 0. Verified and asserted.
 *
 * 2. Minimum Cash Flow Optimization:
 *    The problem of minimizing the total number of transactions to settle debts is known
 *    to be NP-hard (reducible to the Subset Sum / Minimum Partition problem).
 *
 *    - For small to medium groups (non-zero members <= 12):
 *      We find the partition of non-zero members into the MAXIMUM number of zero-sum subsets
 *      using Bitmask Dynamic Programming. If there are M non-zero members and they can be
 *      partitioned into K disjoint zero-sum subsets, each subset of size k_i can be settled
 *      using exactly (k_i - 1) transactions via greedy cash-flow matching.
 *      Total transactions = sum(k_i - 1) = M - K, which is mathematically provably minimal.
 *
 *    - For larger groups (non-zero members > 12):
 *      We fall back to the Greedy Min-Cash-Flow heuristic: repeatedly match the maximum creditor
 *      with the maximum debtor, settling min(credit, debt). This runs in O(N log N) and
 *      guarantees at most (N - 1) transactions.
 */

export interface ExpenseRecord {
  paidById: string;
  amountPaise: number;
  splits: Array<{
    userId: string;
    owedPaise: number;
  }>;
}

export interface PaymentRecord {
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
}

export interface SettlementTransaction {
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
}

export interface MemberBalance {
  userId: string;
  netPaise: number; // positive = creditor (gets back), negative = debtor (owes)
}

/**
 * Calculates net balances for all members across expenses and payments.
 * Invariant: sum of all net balances must be exactly 0.
 */
export function calculateNetBalances(
  allMemberIds: string[],
  expenses: ExpenseRecord[],
  payments: PaymentRecord[]
): Map<string, number> {
  const netMap = new Map<string, number>();

  // Initialize all members with 0 net balance
  for (const memberId of allMemberIds) {
    netMap.set(memberId, 0);
  }

  // 1. Process expenses:
  // Payer gets credited (+) for what they paid
  // Each split participant gets debited (-) for what they owe
  for (const exp of expenses) {
    const currentPayerNet = netMap.get(exp.paidById) || 0;
    netMap.set(exp.paidById, currentPayerNet + exp.amountPaise);

    for (const split of exp.splits) {
      const currentSplitUserNet = netMap.get(split.userId) || 0;
      netMap.set(split.userId, currentSplitUserNet - split.owedPaise);
    }
  }

  // 2. Process payments (settlements):
  // Sender gets credited (+) because they discharged part of their debt
  // Receiver gets debited (-) because they collected part of their credit
  for (const p of payments) {
    const currentSenderNet = netMap.get(p.fromUserId) || 0;
    netMap.set(p.fromUserId, currentSenderNet + p.amountPaise);

    const currentReceiverNet = netMap.get(p.toUserId) || 0;
    netMap.set(p.toUserId, currentReceiverNet - p.amountPaise);
  }

  // Verify conservation of money invariant: sum(net) === 0
  let totalNet = 0;
  for (const net of netMap.values()) {
    totalNet += net;
  }

  if (totalNet !== 0) {
    throw new Error(
      `Financial integrity violation: Net balances do not sum to 0! Sum: ${totalNet} paise.`
    );
  }

  return netMap;
}

/**
 * Greedy minimum cash flow settlement.
 * Repeatedly pairs the largest creditor with the largest debtor.
 * Produces at most (N - 1) transactions.
 */
export function greedySettle(balances: Array<{ userId: string; netPaise: number }>): SettlementTransaction[] {
  // Filter out members with zero balance
  const creditors: Array<{ userId: string; netPaise: number }> = [];
  const debtors: Array<{ userId: string; netPaise: number }> = [];

  for (const b of balances) {
    if (b.netPaise > 0) {
      creditors.push({ userId: b.userId, netPaise: b.netPaise });
    } else if (b.netPaise < 0) {
      debtors.push({ userId: b.userId, netPaise: b.netPaise });
    }
  }

  const transactions: SettlementTransaction[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    // Sort creditors descending, debtors ascending (most negative first)
    creditors.sort((a, b) => b.netPaise - a.netPaise);
    debtors.sort((a, b) => a.netPaise - b.netPaise);

    const creditor = creditors[0];
    const debtor = debtors[0];

    const amount = Math.min(creditor.netPaise, -debtor.netPaise);

    transactions.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amountPaise: amount,
    });

    creditor.netPaise -= amount;
    debtor.netPaise += amount;

    if (creditor.netPaise === 0) {
      creditors.shift();
    }
    if (debtor.netPaise === 0) {
      debtors.shift();
    }
  }

  return transactions;
}

/**
 * Optimal settle-up plan generator.
 * Uses Bitmask DP to partition non-zero balances into maximal zero-sum subsets for M <= 12,
 * otherwise falls back to Greedy Min-Cash-Flow.
 */
export function calculateSettlements(netMap: Map<string, number>): SettlementTransaction[] {
  // Extract non-zero members
  const nonZeroMembers: Array<{ userId: string; netPaise: number }> = [];
  for (const [userId, netPaise] of netMap.entries()) {
    if (netPaise !== 0) {
      nonZeroMembers.push({ userId, netPaise });
    }
  }

  const m = nonZeroMembers.length;
  if (m === 0) {
    return [];
  }

  // If m > 12, running 2^m subset DP becomes memory/time heavy; fall back to greedy
  if (m > 12) {
    return greedySettle(nonZeroMembers);
  }

  // --- Bitmask DP for optimal zero-sum subset partition ---
  const numSubsets = 1 << m;
  const subsetSums = new Int32Array(numSubsets);

  for (let mask = 1; mask < numSubsets; mask++) {
    // Find lowest set bit
    const lsbIndex = 31 - Math.clz32(mask & -mask);
    const prevMask = mask ^ (1 << lsbIndex);
    subsetSums[mask] = subsetSums[prevMask] + nonZeroMembers[lsbIndex].netPaise;
  }

  // dp[mask] = max number of zero-sum subsets that partition `mask`
  const dp = new Int16Array(numSubsets);

  for (let mask = 1; mask < numSubsets; mask++) {
    // Check all sub-elements
    let maxSub = 0;
    for (let i = 0; i < m; i++) {
      if ((mask & (1 << i)) !== 0) {
        const prev = dp[mask ^ (1 << i)];
        if (prev > maxSub) {
          maxSub = prev;
        }
      }
    }
    // If the entire mask sums to 0, it contributes an additional zero-sum component
    dp[mask] = maxSub + (subsetSums[mask] === 0 ? 1 : 0);
  }

  // Reconstruct the zero-sum subsets from the full mask
  const fullMask = numSubsets - 1;
  const zeroSumSubsets: Array<Array<{ userId: string; netPaise: number }>> = [];

  function decompose(mask: number): void {
    if (mask === 0) return;

    // If mask itself cannot be partitioned into multiple zero-sum subsets,
    // it forms a single component
    if (dp[mask] <= 1) {
      const group: Array<{ userId: string; netPaise: number }> = [];
      for (let i = 0; i < m; i++) {
        if ((mask & (1 << i)) !== 0) {
          group.push(nonZeroMembers[i]);
        }
      }
      zeroSumSubsets.push(group);
      return;
    }

    // Otherwise, find a strict submask `sub` that sums to 0 and satisfies:
    // dp[sub] + dp[mask ^ sub] === dp[mask]
    let found = false;
    for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
      if (subsetSums[sub] === 0 && dp[sub] + dp[mask ^ sub] === dp[mask]) {
        decompose(sub);
        decompose(mask ^ sub);
        found = true;
        break;
      }
    }

    // Safety fallback if no strict submask was split
    if (!found) {
      const group: Array<{ userId: string; netPaise: number }> = [];
      for (let i = 0; i < m; i++) {
        if ((mask & (1 << i)) !== 0) {
          group.push(nonZeroMembers[i]);
        }
      }
      zeroSumSubsets.push(group);
    }
  }

  decompose(fullMask);

  // Settle each zero-sum component independently with greedy min-cash-flow
  const allTransactions: SettlementTransaction[] = [];
  for (const group of zeroSumSubsets) {
    const groupTransactions = greedySettle(group);
    allTransactions.push(...groupTransactions);
  }

  return allTransactions;
}
