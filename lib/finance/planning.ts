import type { Expense, FinancialEvent, PlannedCashFlow } from '@/lib/types';
import { normalizeText } from './categories';

export function recurringFlowKey(flow: Pick<PlannedCashFlow, 'type' | 'accountId' | 'concept'>): string {
    return `${flow.type}|${flow.accountId}|${flow.concept.trim().toLocaleLowerCase('es-CO')}`;
}

/** Builds idempotent copies for the next period, including salaries and expenses. */
export function buildRecurringFlowCopies(
    previousFlows: PlannedCashFlow[],
    currentFlows: PlannedCashFlow[],
    periodId: string,
    now: string,
    createId: () => string,
): PlannedCashFlow[] {
    const existingKeys = new Set(currentFlows.map(recurringFlowKey));
    return previousFlows.filter(flow => flow.isRecurring).flatMap(flow => {
        const key = recurringFlowKey(flow);
        if (existingKeys.has(key)) return [];
        existingKeys.add(key);
        return [{
            ...flow,
            id: createId(),
            periodId,
            sourcePlanId: flow.sourcePlanId ?? flow.id,
            createdAt: now,
            updatedAt: now,
        }];
    });
}

/**
 * Whether a planned expense was already paid this period: an expense registered from it, or one the user
 * typed by hand with the same description from the same account.
 */
export function isPlannedExpensePaid(flow: PlannedCashFlow, events: FinancialEvent[], expenses: Expense[]): boolean {
    if (events.some(event => event.type === 'EXPENSE' && event.plannedCashFlowId === flow.id)) return true;
    const concept = normalizeText(flow.concept);
    return expenses.some(expense => expense.periodId === flow.periodId && expense.paymentAccountId === flow.accountId && normalizeText(expense.reason) === concept);
}
