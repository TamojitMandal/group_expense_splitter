/**
 * Pure split calculation algorithms using the Largest-Remainder Method (Hare-Niemeyer / Hamilton method).
 * Guarantees that sum(shares) === totalPaise with ZERO float drift or rounding anomalies.
 */

export class SplitCalculationError extends Error {
  public fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'SplitCalculationError';
    this.fieldErrors = fieldErrors;
  }
}

export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENT';

export interface ComputedSplit {
  userId: string;
  owedPaise: number;
  basisPoints?: number; // percent * 100 (e.g., 33.33% -> 3333 bp)
}

export interface ExactSplitInput {
  userId: string;
  amountPaise: number;
}

export interface PercentSplitInput {
  userId: string;
  percent: string | number; // e.g. "33.33" or 33.33
}

/**
 * Parses a percentage into basis points (1% = 100 basis points, 100% = 10000 basis points).
 * Strictly rejects >2 decimal places, negatives, or non-numeric values.
 */
export function parsePercentToBasisPoints(input: string | number): number {
  const str = String(input).trim();
  const pattern = /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(str)) {
    throw new SplitCalculationError(
      `Invalid percentage format: "${input}". Must be a non-negative number with at most 2 decimal places.`,
      { percent: 'Must be a valid percentage with at most 2 decimal places' }
    );
  }

  const parts = str.split('.');
  const whole = BigInt(parts[0]);
  const decimal = BigInt((parts[1] || '').padEnd(2, '0'));
  const basisPoints = Number(whole * 100n + decimal);

  return basisPoints;
}

/**
 * Calculates EQUAL splits using the largest-remainder method.
 * Guarantees: sum(splits.owedPaise) === totalPaise
 */
export function calculateEqualSplits(
  totalPaise: number,
  userIds: string[]
): ComputedSplit[] {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
    throw new SplitCalculationError('Total expense amount must be a positive integer in paise', {
      amountPaise: 'Amount must be greater than 0',
    });
  }

  if (!userIds || userIds.length === 0) {
    throw new SplitCalculationError('At least one participant is required for an equal split', {
      participants: 'At least one participant is required',
    });
  }

  // Deduplicate and deterministically sort user IDs
  const uniqueUserIds = Array.from(new Set(userIds)).sort();
  const n = uniqueUserIds.length;

  const baseShare = Math.floor(totalPaise / n);
  const remainderPaise = totalPaise % n;

  // Distribute 1 extra paise to the first `remainderPaise` users
  return uniqueUserIds.map((userId, index) => {
    const extra = index < remainderPaise ? 1 : 0;
    return {
      userId,
      owedPaise: baseShare + extra,
    };
  });
}

/**
 * Validates EXACT splits and ensures the sum of all individual shares matches totalPaise.
 */
export function calculateExactSplits(
  totalPaise: number,
  splits: ExactSplitInput[]
): ComputedSplit[] {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
    throw new SplitCalculationError('Total expense amount must be a positive integer in paise', {
      amountPaise: 'Amount must be greater than 0',
    });
  }

  if (!splits || splits.length === 0) {
    throw new SplitCalculationError('At least one split participant is required', {
      splits: 'At least one participant is required',
    });
  }

  const seenUsers = new Set<string>();
  let sumPaise = 0;

  for (const split of splits) {
    if (!split.userId) {
      throw new SplitCalculationError('Participant user ID is required for each split', {
        splits: 'User ID is missing on a split entry',
      });
    }

    if (seenUsers.has(split.userId)) {
      throw new SplitCalculationError(`Duplicate user in splits: ${split.userId}`, {
        splits: `User ${split.userId} appears more than once`,
      });
    }
    seenUsers.add(split.userId);

    if (!Number.isInteger(split.amountPaise) || split.amountPaise < 0) {
      throw new SplitCalculationError(
        `Split amount for user ${split.userId} must be a non-negative integer paise`,
        { splits: `Invalid amount for user ${split.userId}` }
      );
    }

    sumPaise += split.amountPaise;
  }

  if (sumPaise !== totalPaise) {
    const diff = sumPaise - totalPaise;
    const diffDirection = diff > 0 ? 'exceeds' : 'falls short of';
    const absDiff = Math.abs(diff);
    throw new SplitCalculationError(
      `Exact split total (${sumPaise} paise) ${diffDirection} expense total (${totalPaise} paise) by ${absDiff} paise`,
      {
        splits: `Split amounts sum to ${sumPaise} paise, but total expense is ${totalPaise} paise (difference: ${diff > 0 ? '+' : ''}${diff} paise)`,
      }
    );
  }

  return splits.map((s) => ({
    userId: s.userId,
    owedPaise: s.amountPaise,
  }));
}

/**
 * Calculates PERCENT splits using the Largest-Remainder Method (Hamilton method).
 * - Percentages are converted to integer basis points (total must be exactly 10,000 = 100.00%).
 * - Each share is initially floored: floor((totalPaise * basisPoints) / 10000).
 * - Leftover paise are assigned one-by-one to participants with the highest remainder.
 * - Ties are broken deterministically by userId.
 * Guarantees: sum(owedPaise) === totalPaise ALWAYS.
 */
export function calculatePercentSplits(
  totalPaise: number,
  splits: PercentSplitInput[]
): ComputedSplit[] {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
    throw new SplitCalculationError('Total expense amount must be a positive integer in paise', {
      amountPaise: 'Amount must be greater than 0',
    });
  }

  if (!splits || splits.length === 0) {
    throw new SplitCalculationError('At least one split participant is required', {
      splits: 'At least one participant is required',
    });
  }

  const seenUsers = new Set<string>();
  let totalBasisPoints = 0;

  const parsedSplits: Array<{
    userId: string;
    basisPoints: number;
    floorShare: number;
    remainder: number;
  }> = [];

  for (const split of splits) {
    if (!split.userId) {
      throw new SplitCalculationError('Participant user ID is required for each split', {
        splits: 'User ID is missing on a split entry',
      });
    }

    if (seenUsers.has(split.userId)) {
      throw new SplitCalculationError(`Duplicate user in percent splits: ${split.userId}`, {
        splits: `User ${split.userId} appears more than once`,
      });
    }
    seenUsers.add(split.userId);

    const bp = parsePercentToBasisPoints(split.percent);
    totalBasisPoints += bp;

    const numerator = BigInt(totalPaise) * BigInt(bp);
    const floorShare = Number(numerator / 10000n);
    const remainder = Number(numerator % 10000n);

    parsedSplits.push({
      userId: split.userId,
      basisPoints: bp,
      floorShare,
      remainder,
    });
  }

  if (totalBasisPoints !== 10000) {
    const totalPercentFormatted = (totalBasisPoints / 100).toFixed(2);
    throw new SplitCalculationError(
      `Percentage splits must sum to exactly 100%, but summed to ${totalPercentFormatted}% (${totalBasisPoints} basis points)`,
      {
        splits: `Percentages must sum to exactly 100%, currently ${totalPercentFormatted}%`,
      }
    );
  }

  // Calculate leftover paise to distribute via largest remainder
  const sumFloorShares = parsedSplits.reduce((acc, item) => acc + item.floorShare, 0);
  const leftoverPaise = totalPaise - sumFloorShares;

  // Sort by remainder descending, break ties deterministically by userId ascending
  const sortedIndices = parsedSplits
    .map((item, index) => ({ index, remainder: item.remainder, userId: item.userId }))
    .sort((a, b) => {
      if (b.remainder !== a.remainder) {
        return b.remainder - a.remainder;
      }
      return a.userId.localeCompare(b.userId);
    });

  // Distribute one paise to each of the top leftoverPaise entries
  const extraAllocations = new Set<number>();
  for (let i = 0; i < leftoverPaise; i++) {
    extraAllocations.add(sortedIndices[i].index);
  }

  return parsedSplits.map((item, index) => ({
    userId: item.userId,
    owedPaise: item.floorShare + (extraAllocations.has(index) ? 1 : 0),
    basisPoints: item.basisPoints,
  }));
}
