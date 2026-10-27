import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  calculateExactSplits,
  calculatePercentSplits,
  parsePercentToBasisPoints,
  SplitCalculationError,
} from '../../src/lib/splits';

describe('lib/splits.ts', () => {
  describe('EQUAL splits', () => {
    it('splits 100 paise among 3 users to sum to EXACTLY 100 paise', () => {
      const splits = calculateEqualSplits(100, ['user-a', 'user-b', 'user-c']);
      expect(splits).toHaveLength(3);

      const sum = splits.reduce((acc, s) => acc + s.owedPaise, 0);
      expect(sum).toBe(100);

      // 100 / 3 = 33 base share with remainder 1.
      // Top 1 user gets 34, other 2 get 33
      expect(splits[0].owedPaise).toBe(34);
      expect(splits[1].owedPaise).toBe(33);
      expect(splits[2].owedPaise).toBe(33);
    });

    it('splits 1 paise among 3 users to sum to EXACTLY 1 paise', () => {
      const splits = calculateEqualSplits(1, ['user-a', 'user-b', 'user-c']);
      expect(splits).toHaveLength(3);

      const sum = splits.reduce((acc, s) => acc + s.owedPaise, 0);
      expect(sum).toBe(1);

      // Remainder 1: first gets 1, others get 0
      expect(splits[0].owedPaise).toBe(1);
      expect(splits[1].owedPaise).toBe(0);
      expect(splits[2].owedPaise).toBe(0);
    });

    it('splits large amounts evenly without float precision loss', () => {
      // 1,000,000,00 paise (₹10 Lakhs) among 7 people
      const total = 100000000;
      const participants = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
      const splits = calculateEqualSplits(total, participants);

      const sum = splits.reduce((acc, s) => acc + s.owedPaise, 0);
      expect(sum).toBe(total);
      // 100000000 % 7 = 2, so 2 get base+1, 5 get base
      const base = Math.floor(total / 7);
      expect(splits.filter((s) => s.owedPaise === base + 1).length).toBe(2);
      expect(splits.filter((s) => s.owedPaise === base).length).toBe(5);
    });

    it('rejects invalid amounts or empty participants', () => {
      expect(() => calculateEqualSplits(0, ['u1'])).toThrow(SplitCalculationError);
      expect(() => calculateEqualSplits(-50, ['u1'])).toThrow(SplitCalculationError);
      expect(() => calculateEqualSplits(100, [])).toThrow(SplitCalculationError);
    });
  });

  describe('PERCENT splits', () => {
    it('correctly parses percent to basis points', () => {
      expect(parsePercentToBasisPoints('33.33')).toBe(3333);
      expect(parsePercentToBasisPoints('100')).toBe(10000);
      expect(parsePercentToBasisPoints(25)).toBe(2500);
      expect(parsePercentToBasisPoints('0.5')).toBe(50);
      expect(() => parsePercentToBasisPoints('33.333')).toThrow(SplitCalculationError);
      expect(() => parsePercentToBasisPoints('-5')).toThrow(SplitCalculationError);
    });

    it('splits 100 paise with 33.33%, 33.33%, 33.34% to sum to EXACTLY 100 paise', () => {
      const total = 100;
      const splits = calculatePercentSplits(total, [
        { userId: 'u1', percent: '33.33' },
        { userId: 'u2', percent: '33.33' },
        { userId: 'u3', percent: '33.34' },
      ]);

      const sum = splits.reduce((acc, s) => acc + s.owedPaise, 0);
      expect(sum).toBe(total);
      expect(splits[0].owedPaise + splits[1].owedPaise + splits[2].owedPaise).toBe(100);
    });

    it('splits ₹1200.50 (120050 paise) into 50%, 25%, 25% with exact total', () => {
      const total = 120050;
      const splits = calculatePercentSplits(total, [
        { userId: 'u1', percent: 50 },
        { userId: 'u2', percent: 25 },
        { userId: 'u3', percent: 25 },
      ]);

      const sum = splits.reduce((acc, s) => acc + s.owedPaise, 0);
      expect(sum).toBe(total);
      expect(splits[0].owedPaise).toBe(60025);
      // Remainder tie-breaker assigns leftover 1 paise to 'u2' (u2 < u3)
      expect(splits[1].owedPaise).toBe(30013);
      expect(splits[2].owedPaise).toBe(30012);
    });

    it('rejects percent splits that do not sum to 100%', () => {
      expect(() =>
        calculatePercentSplits(1000, [
          { userId: 'u1', percent: 50 },
          { userId: 'u2', percent: 40 },
        ])
      ).toThrow(SplitCalculationError);

      expect(() =>
        calculatePercentSplits(1000, [
          { userId: 'u1', percent: '33.33' },
          { userId: 'u2', percent: '33.33' },
          { userId: 'u3', percent: '33.33' },
        ])
      ).toThrow(SplitCalculationError);
    });
  });

  describe('EXACT splits', () => {
    it('accepts exact splits that match the total paise exactly', () => {
      const splits = calculateExactSplits(1000, [
        { userId: 'u1', amountPaise: 600 },
        { userId: 'u2', amountPaise: 400 },
      ]);

      expect(splits).toHaveLength(2);
      expect(splits.reduce((acc, s) => acc + s.owedPaise, 0)).toBe(1000);
    });

    it('rejects exact split mismatch with informative difference error', () => {
      expect(() =>
        calculateExactSplits(1000, [
          { userId: 'u1', amountPaise: 500 },
          { userId: 'u2', amountPaise: 400 },
        ])
      ).toThrow(SplitCalculationError);
    });

    it('rejects duplicate users in splits', () => {
      expect(() =>
        calculateExactSplits(1000, [
          { userId: 'u1', amountPaise: 500 },
          { userId: 'u1', amountPaise: 500 },
        ])
      ).toThrow(SplitCalculationError);
    });
  });
});
