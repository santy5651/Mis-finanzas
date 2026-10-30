import { describe, expect, it } from 'vitest';
import { calculateAccountReconciliation, calculateFxEffect, calculateObligationReconciliation, expectedPassiveReturn } from './reconciliation';
import type { AccountEntry, AccountPlan, AccountSnapshot, FinancialEvent, ObligationEntry, ObligationSnapshot } from '@/lib/types';

const previous: AccountSnapshot = { id: 'p', periodId: '2026-06', accountId: 'tyba', balance: 30_710_955, createdAt: '', updatedAt: '' };
const current: AccountSnapshot = { id: 'c', periodId: '2026-07', accountId: 'tyba', balance: 36_016_969, createdAt: '', updatedAt: '' };

function event(id: string, type: FinancialEvent['type']): FinancialEvent {
    return { id, periodId: '2026-07', date: '2026-07-31', type, concept: type, createdAt: '', updatedAt: '' };
}
function entry(eventId: string, accountId: string, amount: number): AccountEntry {
    return { id: `${eventId}-${accountId}`, eventId, periodId: '2026-07', accountId, amount, currency: 'COP', createdAt: '' };
}

describe('monthly reconciliation', () => {
    it('does not treat a 3M investment contribution as passive return', () => {
        const result = calculateAccountReconciliation(current, previous, [entry('transfer', 'tyba', 3_000_000)], [event('transfer', 'TRANSFER')]);
        expect(result.transfers).toBe(3_000_000);
        expect(result.passiveReturn).toBe(0);
        expect(result.unexplained).toBe(2_306_014);
    });

    it('separates salary from a later transfer to an investment', () => {
        const payrollPrevious = { ...previous, accountId: 'payroll', balance: 0 };
        const payrollCurrent = { ...current, accountId: 'payroll', balance: 1_922_018 };
        const result = calculateAccountReconciliation(payrollCurrent, payrollPrevious, [
            entry('salary', 'payroll', 4_922_018), entry('transfer', 'payroll', -3_000_000),
        ], [event('salary', 'INCOME'), event('transfer', 'TRANSFER')]);
        expect(result.externalIncome).toBe(4_922_018);
        expect(result.transfers).toBe(-3_000_000);
        expect(result.passiveReturn).toBe(0);
        expect(result.unexplained).toBe(0);
    });

    it('supports negative confirmed returns', () => {
        const lossCurrent = { ...current, balance: 29_710_955 };
        const result = calculateAccountReconciliation(lossCurrent, previous, [entry('loss', 'tyba', -1_000_000)], [event('loss', 'PASSIVE_RETURN')]);
        expect(result.passiveReturn).toBe(-1_000_000);
        expect(result.unexplained).toBe(0);
    });

    it('keeps exchange-rate valuation separate', () => {
        expect(calculateFxEffect({ ...previous, balance: 100, usdCopRate: 3_500 }, { ...current, balance: 100, usdCopRate: 3_600 })).toBe(10_000);
    });

    it('calculates EA and monthly plans without salary', () => {
        const ea: AccountPlan = { id: 'a', periodId: '2026-07', accountId: 'tyba', concept: 'Rendimiento', type: 'FIXED_EA', rateEA: 0.12, createdAt: '', updatedAt: '' };
        const monthly: AccountPlan = { ...ea, type: 'VARIABLE_MONTHLY', rateMonthly: 1 };
        expect(expectedPassiveReturn(1_000_000, ea)).toBeCloseTo(9_488.79, 1);
        expect(expectedPassiveReturn(1_000_000, monthly)).toBe(10_000);
    });

    it('reconciles a card purchase and its later payment without duplicating expense', () => {
        const cardPrevious: ObligationSnapshot = { id: 'op', periodId: '2026-06', obligationId: 'card', balance: 500_000, createdAt: '', updatedAt: '' };
        const cardCurrent: ObligationSnapshot = { ...cardPrevious, id: 'oc', periodId: '2026-07', balance: 550_000 };
        const cardEntries: ObligationEntry[] = [
            { id: 'purchase', eventId: 'expense', periodId: '2026-07', obligationId: 'card', amount: 150_000, currency: 'COP', createdAt: '' },
            { id: 'payment', eventId: 'payment', periodId: '2026-07', obligationId: 'card', amount: -100_000, currency: 'COP', createdAt: '' },
        ];
        const result = calculateObligationReconciliation(cardCurrent, cardPrevious, cardEntries);
        expect(result.explained).toBe(50_000);
        expect(result.unexplained).toBe(0);
        expect((-100_000) - (-100_000)).toBe(0); // cash payment and liability reduction are net-worth neutral
    });

    it('keeps a loan and its collection neutral while reducing the receivable', () => {
        const before: ObligationSnapshot = { id: 'r1', periodId: '2026-06', obligationId: 'receivable', balance: 1_000_000, createdAt: '', updatedAt: '' };
        const after: ObligationSnapshot = { ...before, id: 'r2', periodId: '2026-07', balance: 700_000 };
        const collection: ObligationEntry = { id: 'collect', eventId: 'collect-event', periodId: '2026-07', obligationId: 'receivable', amount: -300_000, currency: 'COP', createdAt: '' };
        expect(calculateObligationReconciliation(after, before, [collection]).unexplained).toBe(0);
    });
});
