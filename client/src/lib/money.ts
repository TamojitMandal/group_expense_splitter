/**
 * Client-side integer paise money utilities.
 * Ensures zero floating-point arithmetic on inputs and representations.
 */

export function parseRupeesToPaise(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Amount cannot be empty');
  }

  const validRupeePattern = /^\d+(\.\d{1,2})?$/;
  if (!validRupeePattern.test(trimmed)) {
    if (trimmed.startsWith('-')) {
      throw new Error('Negative amounts are not allowed');
    }
    if (trimmed.includes('.') && trimmed.split('.')[1]?.length > 2) {
      throw new Error('Amount cannot have more than 2 decimal places');
    }
    throw new Error(`Invalid money format: "${input}"`);
  }

  const parts = trimmed.split('.');
  const wholePart = parts[0];
  const decimalPart = (parts[1] || '').padEnd(2, '0');

  const wholePaise = BigInt(wholePart) * 100n;
  const decimalPaise = BigInt(decimalPart);
  return Number(wholePaise + decimalPaise);
}

export function formatINR(paise: number): string {
  if (typeof paise !== 'number' || isNaN(paise)) return '₹0.00';

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = (absPaise % 100).toString().padStart(2, '0');

  const formattedRupees = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(rupees);

  return `${isNegative ? '-' : ''}₹${formattedRupees}.${remPaise}`;
}

export function paiseToRupees(paise: number): string {
  if (typeof paise !== 'number' || isNaN(paise)) return '0.00';
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = (absPaise % 100).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${rupees}.${remPaise}`;
}
