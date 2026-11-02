import { describe, expect, it } from 'vitest';
import { cardCharges, creditUsage, daysUntil, installmentPlan, nextMonthlyDate } from './cards';
import type { Expense, FinancialEvent, ObligationEntry } from '@/lib/types';

const purchase = (id: string, periodId: string, amount: number, installments: number): Expense => ({
    id, periodId, date: `${periodId}-10`, reason: id, amount, currency: 'COP', method: 'CREDIT_CARD', installments, obligationId: 'card',
});

describe('nextMonthlyDate', () => {
    it('uses this month while the day has not passed, today included', () => {
        const today = new Date(2026, 10, 2);
        expect(nextMonthlyDate(15, today)).toEqual(new Date(2026, 10, 15));
        expect(nextMonthlyDate(2, today)).toEqual(new Date(2026, 10, 2));
        expect(daysUntil(nextMonthlyDate(15, today), today)).toBe(13);
    });

    it('moves to next month and clamps to short months', () => {
        expect(nextMonthlyDate(1, new Date(2026, 10, 2))).toEqual(new Date(2026, 11, 1));
        expect(nextMonthlyDate(31, new Date(2027, 1, 10))).toEqual(new Date(2027, 1, 28));
    });
});

describe('installmentPlan', () => {
    it('bills the first installment the month after the purchase', () => {
        const items = [purchase('audifonos', '2026-10', 3_086_219, 3), purchase('cena', '2026-10', 120_000, 1), purchase('nuevo', '2026-11', 600_000, 6)];
        const october = installmentPlan(items, '2026-10');
        expect(october.dueThisPeriod).toBe(0);
        const november = installmentPlan(items, '2026-11');
        expect(november.dueThisPeriod).toBeCloseTo(3_086_219 / 3 + 120_000, 2);
        expect(november.active.map(item => [item.expense.id, item.paid, item.remaining])).toEqual([['audifonos', 1, 2], ['nuevo', 0, 6]]);
    });

    it('drops purchases once every installment is billed', () => {
        const plan = installmentPlan([purchase('audifonos', '2026-10', 3_000, 3)], '2027-01');
        expect(plan.dueThisPeriod).toBe(1_000);
        expect(plan.active).toEqual([]);
        expect(installmentPlan([purchase('audifonos', '2026-10', 3_000, 3)], '2027-02').dueThisPeriod).toBe(0);
    });
});

describe('cardCharges and usage', () => {
    it('adds interest and fees by charge kind and ignores purchases and payments', () => {
        const events = [
            { id: 'i', chargeKind: 'INTEREST' }, { id: 'f', chargeKind: 'FEE' }, { id: 'p', chargeKind: 'PURCHASE' }, { id: 'pay' },
        ] as FinancialEvent[];
        const entries = [
            { eventId: 'i', obligationId: 'card', amount: 85_000 }, { eventId: 'f', obligationId: 'card', amount: 32_990 },
            { eventId: 'p', obligationId: 'card', amount: 500_000 }, { eventId: 'pay', obligationId: 'card', amount: -1_000_000 },
            { eventId: 'i', obligationId: 'other', amount: 1 },
        ] as ObligationEntry[];
        expect(cardCharges('card', events, entries)).toEqual({ interest: 85_000, fees: 32_990 });
    });

    it('reports usage only with a limit', () => {
        expect(creditUsage(6_858_707, 10_000_000)).toBeCloseTo(0.6859, 4);
        expect(creditUsage(1, undefined)).toBeNull();
    });
});
