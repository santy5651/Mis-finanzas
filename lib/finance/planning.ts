import type { PlannedCashFlow } from '@/lib/types';

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
