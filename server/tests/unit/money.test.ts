import { describe, it, expect } from 'vitest';
import { parseRupeesToPaise, formatINR, convertForeignToPaise, InvalidMoneyError } from '../../src/lib/money';

describe('lib/money.ts', () => {
  describe('parseRupeesToPaise', () => {
    it('correctly parses integer rupee strings', () => {
      expect(parseRupeesToPaise('0')).toBe(0);
      expect(parseRupeesToPaise('10')).toBe(1000);
      expect(parseRupeesToPaise('1200')).toBe(120000);
    });

    it('correctly parses rupee strings with 1 or 2 decimal places', () => {
      expect(parseRupeesToPaise('0.05')).toBe(5);
      expect(parseRupeesToPaise('10.5')).toBe(1050);
      expect(parseRupeesToPaise('1200.50')).toBe(120050);
      expect(parseRupeesToPaise('99.99')).toBe(9999);
    });

    it('rejects more than 2 decimal places', () => {
      expect(() => parseRupeesToPaise('12.345')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('0.001')).toThrow(InvalidMoneyError);
    });

    it('rejects negative numbers', () => {
      expect(() => parseRupeesToPaise('-10')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('-0.50')).toThrow(InvalidMoneyError);
    });

    it('rejects garbage, non-numeric strings, and malformed inputs', () => {
      expect(() => parseRupeesToPaise('')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('   ')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('abc')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('12..34')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('₹500')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('100.2.3')).toThrow(InvalidMoneyError);
      expect(() => parseRupeesToPaise('100,00')).toThrow(InvalidMoneyError);
      // @ts-expect-error test non-string input
      expect(() => parseRupeesToPaise(1200.5)).toThrow(InvalidMoneyError);
    });
  });

  describe('formatINR', () => {
    it('formats positive paise values to standard INR format', () => {
      expect(formatINR(0)).toBe('₹0.00');
      expect(formatINR(5)).toBe('₹0.05');
      expect(formatINR(50)).toBe('₹0.50');
      expect(formatINR(1000)).toBe('₹10.00');
      expect(formatINR(120050)).toBe('₹1,200.50');
      expect(formatINR(10000000)).toBe('₹1,00,000.00'); // Indian numbering standard
    });

    it('formats negative paise values correctly', () => {
      expect(formatINR(-500)).toBe('-₹5.00');
      expect(formatINR(-120050)).toBe('-₹1,200.50');
    });

    it('rejects non-integer paise inputs', () => {
      expect(() => formatINR(100.5)).toThrow(InvalidMoneyError);
      expect(() => formatINR(NaN)).toThrow(InvalidMoneyError);
    });
  });

  describe('convertForeignToPaise (Multi-Currency Stretch)', () => {
    it('converts USD cents to INR paise using fixed rate string with round half-up', () => {
      // 1000 cents ($10.00) @ 83.25 INR/USD -> 83250 paise (₹832.50)
      expect(convertForeignToPaise(1000, '83.25')).toBe(83250);
      // 1 cent ($0.01) @ 83.25 INR/USD -> 1 cent * 8325 paise/100 cents = 83.25 paise -> rounds to 83 paise
      expect(convertForeignToPaise(1, '83.25')).toBe(83);
      // 1 cent @ 80.00 INR/USD -> 80 paise
      expect(convertForeignToPaise(1, '80.00')).toBe(80);
    });

    it('rejects invalid exchange rate formats or negative amounts', () => {
      expect(() => convertForeignToPaise(-100, '83.25')).toThrow(InvalidMoneyError);
      expect(() => convertForeignToPaise(1000, '-83.25')).toThrow(InvalidMoneyError);
      expect(() => convertForeignToPaise(1000, 'invalid')).toThrow(InvalidMoneyError);
    });
  });
});
