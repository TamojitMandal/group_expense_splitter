/**
 * Pure money manipulation utilities using integer paise.
 * Floats are strictly prohibited for financial logic to prevent IEEE 754 precision drift.
 */

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

/**
 * Parses a rupee string into integer paise without float multiplication.
 * Rejects negative numbers, >2 decimal places, non-numeric characters, and malformed inputs.
 *
 * Examples:
 *   "1200.50" -> 120050
 *   "10"      -> 1000
 *   "0.05"    -> 5
 *   "10.5"    -> 1050
 *   "-5"      -> throws InvalidMoneyError
 *   "12.345"  -> throws InvalidMoneyError
 */
export function parseRupeesToPaise(input: string): number {
  if (typeof input !== 'string') {
    throw new InvalidMoneyError('Amount must be provided as a string');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new InvalidMoneyError('Amount cannot be empty');
  }

  // Reject negative signs, spaces in between, or non-digit chars (except a single dot)
  // Strict regex: one or more digits, optionally followed by a dot and 1 or 2 digits
  const validRupeePattern = /^\d+(\.\d{1,2})?$/;
  if (!validRupeePattern.test(trimmed)) {
    if (trimmed.startsWith('-')) {
      throw new InvalidMoneyError('Negative amounts are not allowed');
    }
    if (trimmed.includes('.') && trimmed.split('.')[1]?.length > 2) {
      throw new InvalidMoneyError('Amount cannot have more than 2 decimal places');
    }
    throw new InvalidMoneyError(`Invalid money amount format: "${input}"`);
  }

  const parts = trimmed.split('.');
  const wholePartStr = parts[0];
  const decimalPartStr = parts[1] || '';

  // Pad decimal part to exactly 2 digits (e.g., "5" -> "50", "" -> "00")
  const paddedDecimalStr = decimalPartStr.padEnd(2, '0');

  // BigInt arithmetic to avoid any potential 32-bit overflow before returning safe integer
  const wholePaise = BigInt(wholePartStr) * 100n;
  const decimalPaise = BigInt(paddedDecimalStr);
  const totalPaiseBig = wholePaise + decimalPaise;

  if (totalPaiseBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidMoneyError('Amount exceeds maximum safe integer');
  }

  return Number(totalPaiseBig);
}

/**
 * Formats an integer paise amount into Indian Rupee standard format (e.g., ₹1,200.50).
 * Handles negative balances appropriately (e.g., -₹500.00).
 */
export function formatINR(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new InvalidMoneyError(`Paise amount must be an integer, got: ${paise}`);
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = (absPaise % 100).toString().padStart(2, '0');

  // Format rupees part using Indian numbering grouping (e.g. 12,34,567)
  const formattedRupees = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(rupees);

  return `${isNegative ? '-' : ''}₹${formattedRupees}.${remPaise}`;
}

/**
 * Multi-currency conversion utility:
 * Converts an amount in a foreign currency (with minor units, e.g. USD cents)
 * to group currency paise using a fixed exchange rate provided as a decimal string.
 *
 * Uses scaled integer arithmetic with round-half-up:
 * e.g., 1000 cents ($10.00) at rate "83.25" INR/USD
 * 83.25 has 2 decimals => scale = 100, rateScaled = 8325
 * Converted paise = round(1000 * 8325 / 100) = 83250 paise (₹832.50)
 */
export function convertForeignToPaise(
  originalAmountMinor: number,
  exchangeRateStr: string
): number {
  if (!Number.isInteger(originalAmountMinor) || originalAmountMinor < 0) {
    throw new InvalidMoneyError('Original amount must be a non-negative integer minor unit');
  }

  const rateTrimmed = exchangeRateStr.trim();
  const ratePattern = /^\d+(\.\d{1,6})?$/;
  if (!ratePattern.test(rateTrimmed)) {
    throw new InvalidMoneyError(`Invalid exchange rate format: "${exchangeRateStr}"`);
  }

  const parts = rateTrimmed.split('.');
  const wholePart = parts[0];
  const decPart = parts[1] || '';
  const decimals = decPart.length;

  const rateScaled = BigInt(wholePart + decPart);
  const scale = 10n ** BigInt(decimals);

  // Round half up: (original * rateScaled + scale / 2) / scale
  const numerator = BigInt(originalAmountMinor) * rateScaled;
  const halfScale = scale / 2n;
  const converted = (numerator + halfScale) / scale;

  return Number(converted);
}
