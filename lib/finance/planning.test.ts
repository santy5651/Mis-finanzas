import { describe, expect, it } from 'vitest';
import { buildRecurringFlowCopies, isPlannedExpensePaid } from './planning';
import type { Expense, FinancialEvent, PlannedCashFlow } from '@/lib/types';

function flow(id: string, type: PlannedCashFlow['type'], concept: string, recurring = true): PlannedCashFlow {
    return {
        id, periodId: '2026-08', accountId: type === 'SALARY' ? 'nomina' : 'cuenta',
        type, concept, amount: type === 'EXPENSE' ? 350_000 : 4_900_000,
        currency: 'COP', isRecurring: recurring, createdAt: '', updatedAt: '',
    };
}

describe('recurring monthly planning', () => {
    it('carries both salary and monthly expenses to the next period', () => {
        let sequence = 0;
        const result = buildRecurringFlowCopies(
            [flow('salary', 'SALARY', 'Salario'), flow('rent', 'EXPENSE', 'Arriendo')],
            [], '2026-09', 'now', () => `copy-${++sequence}`,
        );
        expect(result.map(item => item.type)).toEqual(['SALARY', 'EXPENSE']);
        expect(result.every(item => item.periodId === '2026-09')).toBe(true);
    });

    it('does not duplicate an expense already present and skips non-recurring flows', () => {
        const rent = flow('rent', 'EXPENSE', 'Arriendo');
        const result = buildRecurringFlowCopies(
            [rent, flow('trip', 'EXPENSE', 'Viaje', false)],
            [{ ...rent, id: 'existing', periodId: '2026-09' }],
            '2026-09', 'now', () => 'copy',
        );
        expect(result).toEqual([]);
    });
});

describe('isPlannedExpensePaid', () => {
    const rent: PlannedCashFlow = { id: 'rent', periodId: '2026-11', accountId: 'cop', type: 'EXPENSE', concept: 'Arriendo', amount: 900_000, currency: 'COP', isRecurring: true, createdAt: '', updatedAt: '' };
    const paidExpense = (overrides: Partial<Expense>): Expense => ({ id: 'x', date: '2026-11-05', periodId: '2026-11', reason: 'arriendo', amount: 900_000, currency: 'COP', method: 'DEBIT', installments: 1, paymentAccountId: 'cop', ...overrides });

    it('is paid when an expense was registered from it', () => {
        const event: FinancialEvent = { id: 'e', periodId: '2026-11', date: '2026-11-05', type: 'EXPENSE', concept: 'Arriendo', plannedCashFlowId: 'rent', createdAt: '', updatedAt: '' };
        expect(isPlannedExpensePaid(rent, [event], [])).toBe(true);
        expect(isPlannedExpensePaid(rent, [], [])).toBe(false);
    });

    it('recognises the same expense typed by hand, ignoring case and accents, but not from another account', () => {
        expect(isPlannedExpensePaid(rent, [], [paidExpense({ reason: 'ARRIENDO' })])).toBe(true);
        expect(isPlannedExpensePaid(rent, [], [paidExpense({ paymentAccountId: 'other' })])).toBe(false);
    });
});
