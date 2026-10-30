import { describe, expect, it } from 'vitest';
import { dateInsidePeriod, parseAmountInput } from './period';

describe('dateInsidePeriod', () => {
    const today = new Date(2026, 9, 29, 21, 30); // 21:30 in Colombia is already the 30th in UTC

    it('uses the local date for the current period', () => {
        expect(dateInsidePeriod('2026-10', today)).toBe('2026-10-29');
    });

    it('uses the last day for past periods', () => {
        expect(dateInsidePeriod('2026-08', today)).toBe('2026-08-31');
        expect(dateInsidePeriod('2024-02', today)).toBe('2024-02-29');
    });

    it('uses the first day for future periods', () => {
        expect(dateInsidePeriod('2026-12', today)).toBe('2026-12-01');
    });
});

describe('parseAmountInput', () => {
    it('treats blank input as missing, not zero', () => {
        expect(parseAmountInput('')).toBeNull();
        expect(parseAmountInput('   ')).toBeNull();
        expect(parseAmountInput(undefined)).toBeNull();
    });

    it('keeps explicit zeros and negatives', () => {
        expect(parseAmountInput('0')).toBe(0);
        expect(parseAmountInput('-120.5')).toBe(-120.5);
        expect(parseAmountInput('abc')).toBeNull();
    });
});
