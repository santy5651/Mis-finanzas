import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/db';
import type { PlannedCashFlow } from '@/lib/types';
import { LedgerError } from './ledger';
import { buildRecurringFlowCopies } from './planning';

/**
 * Copies last month's rates and recurring flows into the period, skipping what already exists.
 * Expenses marked as recurring become planned expenses. It only runs on explicit request, so a
 * flow the user deleted is not brought back on the next visit.
 */
export async function copyRecurringPlan(periodId: string, previousPeriodId: string): Promise<{ plans: number; flows: number }> {
    return db.transaction('rw', [db.periods, db.accountPlans, db.plannedCashFlows, db.expenses], async () => {
        const period = await db.periods.get(periodId);
        if (period?.status === 'CLOSED') throw new LedgerError(`El periodo ${periodId} está cerrado.`);
        const [previousPlans, previousFlows, recurringExpenses, currentPlans, currentFlows] = await Promise.all([
            db.accountPlans.where('periodId').equals(previousPeriodId).toArray(),
            db.plannedCashFlows.where('periodId').equals(previousPeriodId).toArray(),
            db.expenses.where('periodId').equals(previousPeriodId).filter(item => Boolean(item.isRecurring && item.paymentAccountId)).toArray(),
            db.accountPlans.where('periodId').equals(periodId).toArray(),
            db.plannedCashFlows.where('periodId').equals(periodId).toArray(),
        ]);
        const now = new Date().toISOString();
        const plans = previousPlans
            .filter(previous => !currentPlans.some(current => current.accountId === previous.accountId))
            .map(previous => ({ ...previous, id: uuidv4(), periodId, createdAt: now, updatedAt: now }));
        const expenseFlows: PlannedCashFlow[] = recurringExpenses.map(expense => ({
            id: expense.id,
            periodId: previousPeriodId,
            accountId: expense.paymentAccountId!,
            type: 'EXPENSE',
            concept: expense.reason,
            amount: expense.amount,
            currency: expense.currency,
            isRecurring: true,
            createdAt: now,
            updatedAt: now,
        }));
        const flows = buildRecurringFlowCopies([...previousFlows, ...expenseFlows], currentFlows, periodId, now, uuidv4);
        if (plans.length) await db.accountPlans.bulkAdd(plans);
        if (flows.length) await db.plannedCashFlows.bulkAdd(flows);
        return { plans: plans.length, flows: flows.length };
    });
}
