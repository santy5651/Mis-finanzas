import { describe, expect, it } from 'vitest';
import { estimateMovement, impliedAnnualRate, isPlausibleInterest, planAnnualRate, suggestTransfers } from './assistant';

const interest = { returnBehavior: 'INTEREST' as const };
const market = { returnBehavior: 'MARKET_VALUE' as const };

describe('estimateMovement', () => {
    it('sets the planned interest aside on interest accounts only', () => {
        expect(estimateMovement(-1_950_000, 50_000, interest)).toBe(-2_000_000);
        expect(estimateMovement(2_080_000, 80_000, interest)).toBe(2_000_000);
        expect(estimateMovement(500_000, 80_000, market)).toBe(500_000);
    });
});

describe('suggestTransfers', () => {
    it('pairs a sender and a receiver whose movements match after interest', () => {
        const [suggestion, ...rest] = suggestTransfers([
            { accountId: 'lulo', currency: 'COP', estimate: estimateMovement(-1_950_000, 50_000, interest) },
            { accountId: 'bolsillo', currency: 'COP', estimate: estimateMovement(2_080_000, 80_000, interest) },
            { accountId: 'nu', currency: 'COP', estimate: estimateMovement(37_000, 34_000, interest) },
        ]);
        expect(rest).toHaveLength(0);
        expect(suggestion).toMatchObject({ fromAccountId: 'lulo', toAccountId: 'bolsillo', amount: 2_000_000 });
    });

    it('matches the October case where the amounts differ by about 6%', () => {
        const [suggestion] = suggestTransfers([
            { accountId: 'lulo-santiago', currency: 'COP', estimate: estimateMovement(-2_009_618, 16_406, interest) },
            { accountId: 'bolsillo', currency: 'COP', estimate: estimateMovement(1_896_531, 83_009, interest) },
        ]);
        expect(suggestion.fromAccountId).toBe('lulo-santiago');
        expect(suggestion.amount).toBeGreaterThan(1_800_000);
        expect(suggestion.amount).toBeLessThan(2_030_000);
    });

    it('never pairs different currencies, distant amounts or tiny differences', () => {
        expect(suggestTransfers([
            { accountId: 'a', currency: 'COP', estimate: -1_000_000 },
            { accountId: 'b', currency: 'USD', estimate: 250 },
            { accountId: 'c', currency: 'COP', estimate: 400_000 },
            { accountId: 'd', currency: 'COP', estimate: -5_000 },
            { accountId: 'e', currency: 'COP', estimate: 5_000 },
        ])).toEqual([]);
    });

    it('uses each account at most once, preferring the closest match', () => {
        const suggestions = suggestTransfers([
            { accountId: 'from', currency: 'COP', estimate: -1_000_000 },
            { accountId: 'near', currency: 'COP', estimate: 1_000_000 },
            { accountId: 'far', currency: 'COP', estimate: 900_000 },
        ]);
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].toAccountId).toBe('near');
    });
});

describe('isPlausibleInterest', () => {
    it('accepts differences up to three times the plan', () => {
        expect(isPlausibleInterest(84_825, 92_482, 10_587_989)).toBe(true);
    });

    it('rejects a transfer disguised as interest', () => {
        expect(isPlausibleInterest(1_896_531, 83_009, 11_517_353)).toBe(false);
    });

    it('falls back to 2% of the balance without a plan and rejects losses', () => {
        expect(isPlausibleInterest(150_000, 0, 10_000_000)).toBe(true);
        expect(isPlausibleInterest(250_000, 0, 10_000_000)).toBe(false);
        expect(isPlausibleInterest(-1, 1_000, 10_000_000)).toBe(false);
    });
});

describe('rates', () => {
    it('derives the effective annual rate of a month of interest', () => {
        expect(impliedAnnualRate(1_000, 100_000)).toBeCloseTo(0.1268, 4);
        expect(impliedAnnualRate(1_000, 0)).toBeNull();
    });

    it('reads both plan types as an effective annual rate', () => {
        expect(planAnnualRate({ type: 'FIXED_EA', rateEA: 0.1 })).toBe(0.1);
        expect(planAnnualRate({ type: 'VARIABLE_MONTHLY', rateMonthly: 1 })).toBeCloseTo(0.1268, 4);
        expect(planAnnualRate(undefined)).toBeNull();
    });
});
