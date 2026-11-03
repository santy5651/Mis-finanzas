import { describe, expect, it } from 'vitest';
import { averagePlannedRate, projectTwelveMonths, scenarioRate, type ProjectionInput } from './projection';

const input: ProjectionInput = {
    fromPeriodId: '2026-10',
    accounts: [
        { id: 'pibank', name: 'Pibank', balance: 10_000_000, behavior: 'INTEREST', restricted: false, annualRate: 0.1 },
        { id: 'fna', name: 'FNA', balance: 8_000_000, behavior: 'INTEREST', restricted: true, annualRate: 0.05 },
        { id: 'tyba', name: 'TYBA', balance: 38_000_000, behavior: 'MARKET_VALUE', restricted: false, annualRate: null },
        { id: 'cash', name: 'Efectivo', balance: 500_000, behavior: 'INTEREST', restricted: false, annualRate: null },
    ],
    monthlyIncome: 4_922_018,
    monthlyExpenses: 346_290,
    netLiabilities: 8_427_707,
    inflation: 0.05,
};
const base = { rateShiftPoints: 0, marketReturn: 0, includePlannedFlows: false };

describe('projectTwelveMonths', () => {
    it('compounds planned interest for a year and keeps restricted interest apart', () => {
        const months = projectTwelveMonths(input, base);
        expect(months).toHaveLength(12);
        expect(months[0].periodId).toBe('2026-11');
        expect(months[11].periodId).toBe('2027-10');
        const available = months.reduce((sum, month) => sum + month.interestAvailable, 0);
        const restricted = months.reduce((sum, month) => sum + month.interestRestricted, 0);
        expect(available).toBeCloseTo(1_000_000, 0);
        expect(restricted).toBeCloseTo(400_000, 0);
        expect(months[11].netWorth).toBeCloseTo(56_500_000 + 1_400_000 - 8_427_707, 0);
    });

    it('applies rate scenarios, market returns and planned savings', () => {
        const lower = projectTwelveMonths(input, { ...base, rateShiftPoints: -2 });
        expect(lower.reduce((sum, month) => sum + month.interestAvailable, 0)).toBeCloseTo(800_000, 0);
        const withMarket = projectTwelveMonths(input, { ...base, marketReturn: 0.08 });
        expect(withMarket.reduce((sum, month) => sum + month.marketGain, 0)).toBeCloseTo(3_040_000, 0);
        const withSavings = projectTwelveMonths(input, { ...base, includePlannedFlows: true });
        expect(withSavings[11].netWorth - projectTwelveMonths(input, base)[11].netWorth).toBeCloseTo(12 * (4_922_018 - 346_290), 0);
    });

    it('never lets a rate go below zero and reports expense coverage and real value', () => {
        const [first] = projectTwelveMonths(input, { ...base, rateShiftPoints: -20 });
        expect(first.interestAvailable).toBe(0);
        const [month] = projectTwelveMonths(input, base);
        expect(month.coverage).toBeCloseTo(month.interestAvailable / 346_290, 10);
        expect(month.realNetWorth).toBeLessThan(month.netWorth);
    });
});

describe('rate simulation', () => {
    it('replaces the rate of every unrestricted interest account, planned or not', () => {
        const scenario = { ...base, interestRateOverride: 0.12 };
        const months = projectTwelveMonths(input, scenario);
        expect(months.reduce((sum, month) => sum + month.interestAvailable, 0)).toBeCloseTo(10_500_000 * 0.12, 0);
        expect(months.reduce((sum, month) => sum + month.interestRestricted, 0)).toBeCloseTo(400_000, 0);
        expect(scenarioRate(input.accounts[1], scenario)).toBe(0.05);
        expect(scenarioRate(input.accounts[2], { ...scenario, marketReturn: 0.09 })).toBe(0.09);
    });

    it('lets a single account use its own rate, restricted and market accounts included', () => {
        const scenario = { ...base, interestRateOverride: 0.12, marketReturn: 0.08, accountRates: { fna: 0.04, tyba: -0.05, cash: 0.02 } };
        expect(scenarioRate(input.accounts[0], scenario)).toBe(0.12);
        expect(scenarioRate(input.accounts[1], scenario)).toBe(0.04);
        expect(scenarioRate(input.accounts[2], scenario)).toBe(-0.05);
        const months = projectTwelveMonths(input, scenario);
        expect(months.reduce((sum, month) => sum + month.interestAvailable, 0)).toBeCloseTo(10_000_000 * 0.12 + 500_000 * 0.02, 0);
        expect(months.reduce((sum, month) => sum + month.marketGain, 0)).toBeCloseTo(-38_000_000 * 0.05, 0);
    });

    it('averages planned rates by balance, leaving out restricted and unplanned accounts', () => {
        expect(averagePlannedRate(input.accounts)).toBeCloseTo(0.1, 10);
        expect(averagePlannedRate(input.accounts.slice(2))).toBeNull();
    });
});
