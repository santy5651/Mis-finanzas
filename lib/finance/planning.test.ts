import { describe, expect, it } from 'vitest';
import { buildRecurringFlowCopies } from './planning';
import type { PlannedCashFlow } from '@/lib/types';

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
