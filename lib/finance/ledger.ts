import { db } from '@/lib/db/db';
import type {
    AccountEntry,
    Currency,
    Expense,
    FinancialEvent,
    FinancialEventType,
    ObligationEntry,
    ReturnKind,
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

type EventInput = {
    id?: string;
    periodId: string;
    date: string;
    type: FinancialEventType;
    concept: string;
    entityId?: string | null;
    obligationId?: string;
    installments?: number;
    notes?: string;
    incomeKind?: 'SALARY' | 'OTHER_INCOME';
    returnKind?: ReturnKind;
    plannedCashFlowId?: string;
};

type AccountDelta = { accountId: string; amount: number; currency: Currency };
type ObligationDelta = { obligationId: string; amount: number; currency: Currency };

export class LedgerError extends Error {}

/** Strips floating-point noise such as 36.379999999999995 before persisting. */
const toCents = (amount: number) => Math.round(amount * 100) / 100;

/** Must run inside a transaction that includes db.periods. */
async function assertPeriodOpen(periodId: string): Promise<void> {
    const period = await db.periods.get(periodId);
    if (period?.status === 'CLOSED') {
        throw new LedgerError(`El periodo ${periodId} está cerrado. Reábrelo antes de modificarlo.`);
    }
}

function assertDateInPeriod(date: string, periodId: string): void {
    if (!date.startsWith(`${periodId}-`)) {
        throw new LedgerError(`La fecha ${date} no pertenece al periodo ${periodId}.`);
    }
}

/** Must run inside a transaction that includes db.accounts and db.obligations. */
async function assertDeltaCurrencies(accountDeltas: AccountDelta[], obligationDeltas: ObligationDelta[]): Promise<void> {
    for (const delta of accountDeltas) {
        const account = await db.accounts.get(delta.accountId);
        if (!account) throw new LedgerError('La cuenta indicada no existe.');
        if (account.currency !== delta.currency) {
            throw new LedgerError(`${account.name} usa ${account.currency}; el movimiento venía en ${delta.currency}.`);
        }
    }
    for (const delta of obligationDeltas) {
        const obligation = await db.obligations.get(delta.obligationId);
        if (!obligation) throw new LedgerError('La obligación indicada no existe.');
        if (obligation.currency !== delta.currency) {
            throw new LedgerError(`${obligation.name} usa ${obligation.currency}; el movimiento venía en ${delta.currency}.`);
        }
    }
}

export async function saveFinancialEvent(
    input: EventInput,
    accountDeltas: AccountDelta[] = [],
    obligationDeltas: ObligationDelta[] = [],
): Promise<string> {
    assertDateInPeriod(input.date, input.periodId);
    const eventId = input.id ?? uuidv4();
    const now = new Date().toISOString();
    const event: FinancialEvent = {
        id: eventId,
        periodId: input.periodId,
        date: input.date,
        type: input.type,
        concept: input.concept,
        entityId: input.entityId,
        obligationId: input.obligationId,
        installments: input.installments,
        notes: input.notes,
        incomeKind: input.incomeKind,
        returnKind: input.type === 'PASSIVE_RETURN' ? input.returnKind : undefined,
        plannedCashFlowId: input.plannedCashFlowId,
        createdAt: now,
        updatedAt: now,
    };
    if (input.type === 'TRANSFER' && accountDeltas.length === 2) {
        const outgoing = accountDeltas.find(item => item.amount < 0);
        const incoming = accountDeltas.find(item => item.amount > 0);
        if (outgoing && incoming && Math.abs(outgoing.amount) > 0) {
            event.effectiveExchangeRate = Math.abs(incoming.amount / outgoing.amount);
        }
    }

    const accountEntries: AccountEntry[] = accountDeltas.map(delta => ({
        id: uuidv4(),
        eventId,
        periodId: input.periodId,
        accountId: delta.accountId,
        amount: toCents(delta.amount),
        currency: delta.currency,
        createdAt: now,
    }));
    const obligationEntries: ObligationEntry[] = obligationDeltas.map(delta => ({
        id: uuidv4(),
        eventId,
        periodId: input.periodId,
        obligationId: delta.obligationId,
        amount: toCents(delta.amount),
        currency: delta.currency,
        createdAt: now,
    }));

    await db.transaction('rw', [db.periods, db.accounts, db.obligations, db.financialEvents, db.accountEntries, db.obligationEntries], async () => {
        await assertPeriodOpen(input.periodId);
        await assertDeltaCurrencies(accountDeltas, obligationDeltas);
        const existing = await db.financialEvents.get(eventId);
        if (existing && existing.periodId !== input.periodId) await assertPeriodOpen(existing.periodId);
        if (existing) event.createdAt = existing.createdAt;
        await db.accountEntries.where('eventId').equals(eventId).delete();
        await db.obligationEntries.where('eventId').equals(eventId).delete();
        await db.financialEvents.put(event);
        if (accountEntries.length) await db.accountEntries.bulkAdd(accountEntries);
        if (obligationEntries.length) await db.obligationEntries.bulkAdd(obligationEntries);
    });
    return eventId;
}

export async function saveExpenseWithLedger(
    expense: Expense,
    payment: { kind: 'ACCOUNT'; accountId: string } | { kind: 'CREDIT_CARD'; obligationId: string },
): Promise<void> {
    assertDateInPeriod(expense.date, expense.periodId);
    const account = payment.kind === 'ACCOUNT' ? await db.accounts.get(payment.accountId) : undefined;
    const obligation = payment.kind === 'CREDIT_CARD' ? await db.obligations.get(payment.obligationId) : undefined;
    if (payment.kind === 'ACCOUNT' && (!account || account.currency !== expense.currency)) {
        throw new Error('La cuenta de pago no existe o usa otra moneda.');
    }
    if (payment.kind === 'CREDIT_CARD' && (!obligation || obligation.type !== 'CREDIT_CARD' || obligation.currency !== expense.currency)) {
        throw new Error('La tarjeta no existe o usa otra moneda.');
    }

    const migratedEvent = expense.financialEventId
        ? undefined
        : await db.financialEvents.filter(event => event.expenseId === expense.id).first();
    const eventId = expense.financialEventId ?? migratedEvent?.id ?? uuidv4();
    const nextExpense: Expense = {
        ...expense,
        method: payment.kind === 'CREDIT_CARD' ? 'CREDIT_CARD' : expense.method,
        paymentAccountId: payment.kind === 'ACCOUNT' ? payment.accountId : undefined,
        obligationId: payment.kind === 'CREDIT_CARD' ? payment.obligationId : undefined,
        financialEventId: eventId,
    };
    const now = new Date().toISOString();
    const event: FinancialEvent = {
        id: eventId,
        periodId: expense.periodId,
        date: expense.date,
        type: 'EXPENSE',
        concept: expense.reason,
        entityId: expense.entityId,
        expenseId: expense.id,
        obligationId: nextExpense.obligationId,
        installments: expense.installments,
        notes: expense.notes,
        createdAt: now,
        updatedAt: now,
    };
    const accountEntries: AccountEntry[] = payment.kind === 'ACCOUNT' ? [{
        id: uuidv4(), eventId, periodId: expense.periodId, accountId: payment.accountId,
        amount: -expense.amount, currency: expense.currency, createdAt: now,
    }] : [];
    const obligationEntries: ObligationEntry[] = payment.kind === 'CREDIT_CARD' ? [{
        id: uuidv4(), eventId, periodId: expense.periodId, obligationId: payment.obligationId,
        amount: expense.amount, currency: expense.currency, createdAt: now,
    }] : [];

    await db.transaction('rw', [db.periods, db.expenses, db.financialEvents, db.accountEntries, db.obligationEntries], async () => {
        await assertPeriodOpen(expense.periodId);
        const previousExpense = await db.expenses.get(expense.id);
        if (previousExpense && previousExpense.periodId !== expense.periodId) await assertPeriodOpen(previousExpense.periodId);
        const existingEvent = await db.financialEvents.get(eventId);
        if (existingEvent) event.createdAt = existingEvent.createdAt;
        await db.accountEntries.where('eventId').equals(eventId).delete();
        await db.obligationEntries.where('eventId').equals(eventId).delete();
        await db.expenses.put(nextExpense);
        await db.financialEvents.put(event);
        if (accountEntries.length) await db.accountEntries.bulkAdd(accountEntries);
        if (obligationEntries.length) await db.obligationEntries.bulkAdd(obligationEntries);
    });
}

export async function deleteFinancialEvent(eventId: string): Promise<void> {
    await db.transaction('rw', [db.periods, db.financialEvents, db.accountEntries, db.obligationEntries, db.expenses, db.incomes], async () => {
        const event = await db.financialEvents.get(eventId);
        if (event) await assertPeriodOpen(event.periodId);
        await db.accountEntries.where('eventId').equals(eventId).delete();
        await db.obligationEntries.where('eventId').equals(eventId).delete();
        if (event?.expenseId) await db.expenses.delete(event.expenseId);
        if (event?.incomeId) await db.incomes.delete(event.incomeId);
        await db.financialEvents.delete(eventId);
    });
}

export async function deleteExpenseWithLedger(expense: Expense): Promise<void> {
    if (expense.financialEventId) return deleteFinancialEvent(expense.financialEventId);
    const migratedEvent = await db.financialEvents.filter(event => event.expenseId === expense.id).first();
    if (migratedEvent) return deleteFinancialEvent(migratedEvent.id);
    await db.transaction('rw', db.periods, db.expenses, async () => {
        await assertPeriodOpen(expense.periodId);
        await db.expenses.delete(expense.id);
    });
}

/** Event types a reconciliation may have used for what was really money moved between own accounts. */
export const PAIRABLE_TYPES: FinancialEventType[] = ['INCOME', 'EXPENSE', 'ADJUSTMENT', 'PASSIVE_RETURN', 'LEGACY_MOVEMENT'];

/**
 * Rewrites two one-sided events (money that left one account, money that arrived in another) as a
 * single transfer. The smaller amount moves; any excess stays in the larger event with its type.
 */
export async function pairEventsAsTransfer(outgoingEventId: string, incomingEventId: string): Promise<string> {
    return db.transaction('rw', [db.periods, db.financialEvents, db.accountEntries, db.obligationEntries], async () => {
        const [outgoing, incoming] = await Promise.all([outgoingEventId, incomingEventId].map(async id => {
            const event = await db.financialEvents.get(id);
            const entries = await db.accountEntries.where('eventId').equals(id).toArray();
            const obligationCount = await db.obligationEntries.where('eventId').equals(id).count();
            if (!event || !PAIRABLE_TYPES.includes(event.type) || event.expenseId || event.incomeId || entries.length !== 1 || obligationCount) {
                throw new LedgerError('Solo se pueden emparejar movimientos de una sola cuenta sin gasto o ingreso vinculado.');
            }
            return { event, entry: entries[0] };
        }));
        if (outgoing.entry.amount >= 0 || incoming.entry.amount <= 0) {
            throw new LedgerError('El primer movimiento debe restar dinero y el segundo sumarlo.');
        }
        if (outgoing.event.periodId !== incoming.event.periodId) throw new LedgerError('Ambos movimientos deben ser del mismo periodo.');
        if (outgoing.entry.accountId === incoming.entry.accountId) throw new LedgerError('Las cuentas deben ser distintas.');
        if (outgoing.entry.currency !== incoming.entry.currency) throw new LedgerError('Ambas cuentas deben usar la misma moneda.');
        await assertPeriodOpen(outgoing.event.periodId);

        const amount = Math.min(-outgoing.entry.amount, incoming.entry.amount);
        const now = new Date().toISOString();
        const transferId = uuidv4();
        await db.financialEvents.add({
            id: transferId,
            periodId: outgoing.event.periodId,
            date: outgoing.event.date > incoming.event.date ? outgoing.event.date : incoming.event.date,
            type: 'TRANSFER',
            concept: 'Traslado entre cuentas propias',
            notes: `Reclasificado desde: ${outgoing.event.concept} / ${incoming.event.concept}`,
            effectiveExchangeRate: 1,
            createdAt: now,
            updatedAt: now,
        });
        await db.accountEntries.bulkAdd([
            { id: uuidv4(), eventId: transferId, periodId: outgoing.event.periodId, accountId: outgoing.entry.accountId, amount: -amount, currency: outgoing.entry.currency, createdAt: now },
            { id: uuidv4(), eventId: transferId, periodId: incoming.event.periodId, accountId: incoming.entry.accountId, amount, currency: incoming.entry.currency, createdAt: now },
        ]);

        for (const side of [outgoing, incoming]) {
            const remaining = toCents(side.entry.amount + (side === outgoing ? amount : -amount));
            if (remaining === 0) {
                await db.accountEntries.delete(side.entry.id);
                await db.financialEvents.delete(side.event.id);
            } else {
                await db.accountEntries.update(side.entry.id, { amount: remaining });
                await db.financialEvents.update(side.event.id, { updatedAt: now });
            }
        }
        return transferId;
    });
}
