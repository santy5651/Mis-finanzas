import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import type { Account, Expense, Obligation } from '@/lib/types';
import { deleteExpenseWithLedger, deleteFinancialEvent, LedgerError, pairEventsAsTransfer, saveExpenseWithLedger, saveFinancialEvent } from './ledger';

const now = '2026-10-01T00:00:00.000Z';
const cop: Account = { id: 'cop', name: 'Ahorros COP', entityId: 'bank', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true };
const usd: Account = { ...cop, id: 'usd', name: 'Cuenta USD', currency: 'USD' };
const pocket: Account = { ...cop, id: 'pocket', name: 'Bolsillo' };
const card: Obligation = { id: 'card', entityId: 'bank', name: 'Tarjeta', direction: 'PAYABLE', type: 'CREDIT_CARD', currency: 'COP', isActive: true, createdAt: now, updatedAt: now };

async function closePeriod(periodId: string) {
    await db.periods.put({ id: periodId, year: Number(periodId.slice(0, 4)), month: Number(periodId.slice(5)), usdCopRate: 4_000, status: 'CLOSED' });
}

function expense(overrides: Partial<Expense> = {}): Expense {
    return { id: 'exp-1', date: '2026-10-15', periodId: '2026-10', reason: 'Mercado', amount: 50_000, currency: 'COP', method: 'DEBIT', installments: 1, ...overrides };
}

beforeEach(async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await db.accounts.bulkAdd([cop, usd, pocket]);
    await db.obligations.add(card);
});

describe('saveFinancialEvent', () => {
    it('writes one event with signed entries and the effective rate of a cross-currency transfer', async () => {
        const id = await saveFinancialEvent(
            { periodId: '2026-10', date: '2026-10-10', type: 'TRANSFER', concept: 'Cambio' },
            [{ accountId: 'usd', amount: -100, currency: 'USD' }, { accountId: 'cop', amount: 400_000, currency: 'COP' }],
        );
        const entries = await db.accountEntries.where('eventId').equals(id).toArray();
        expect(entries.map(entry => entry.amount).sort((a, b) => a - b)).toEqual([-100, 400_000]);
        expect((await db.financialEvents.get(id))?.effectiveExchangeRate).toBe(4_000);
    });

    it('replaces entries instead of duplicating them when the event is saved again', async () => {
        const input = { id: 'evt', periodId: '2026-10', date: '2026-10-10', type: 'INCOME' as const, concept: 'Salario' };
        await saveFinancialEvent(input, [{ accountId: 'cop', amount: 1_000, currency: 'COP' }]);
        await saveFinancialEvent(input, [{ accountId: 'cop', amount: 1_500, currency: 'COP' }]);
        const entries = await db.accountEntries.where('eventId').equals('evt').toArray();
        expect(entries).toHaveLength(1);
        expect(entries[0].amount).toBe(1_500);
    });

    it('rejects writes into a closed period without touching the data', async () => {
        await closePeriod('2026-10');
        await expect(saveFinancialEvent(
            { periodId: '2026-10', date: '2026-10-10', type: 'INCOME', concept: 'Salario' },
            [{ accountId: 'cop', amount: 1_000, currency: 'COP' }],
        )).rejects.toBeInstanceOf(LedgerError);
        expect(await db.financialEvents.count()).toBe(0);
        expect(await db.accountEntries.count()).toBe(0);
    });

    it('rejects an entry whose currency differs from its account', async () => {
        await expect(saveFinancialEvent(
            { periodId: '2026-10', date: '2026-10-10', type: 'INCOME', concept: 'Pago' },
            [{ accountId: 'usd', amount: 100, currency: 'COP' }],
        )).rejects.toThrow(/USD/);
        expect(await db.financialEvents.count()).toBe(0);
    });

    it('rejects a date outside the period', async () => {
        await expect(saveFinancialEvent(
            { periodId: '2026-10', date: '2026-11-01', type: 'INCOME', concept: 'Pago' },
            [{ accountId: 'cop', amount: 100, currency: 'COP' }],
        )).rejects.toBeInstanceOf(LedgerError);
    });
});

describe('deleteFinancialEvent', () => {
    it('removes the event, its entries and its linked expense', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' });
        const eventId = (await db.expenses.get('exp-1'))!.financialEventId!;
        await deleteFinancialEvent(eventId);
        expect(await db.financialEvents.count()).toBe(0);
        expect(await db.accountEntries.count()).toBe(0);
        expect(await db.expenses.count()).toBe(0);
    });

    it('refuses to delete from a closed period', async () => {
        const id = await saveFinancialEvent(
            { periodId: '2026-10', date: '2026-10-10', type: 'INCOME', concept: 'Salario' },
            [{ accountId: 'cop', amount: 1_000, currency: 'COP' }],
        );
        await closePeriod('2026-10');
        await expect(deleteFinancialEvent(id)).rejects.toBeInstanceOf(LedgerError);
        expect(await db.accountEntries.where('eventId').equals(id).count()).toBe(1);
    });
});

describe('saveExpenseWithLedger', () => {
    it('debits the paying account', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' });
        const [entry] = await db.accountEntries.toArray();
        expect(entry.amount).toBe(-50_000);
        expect(await db.obligationEntries.count()).toBe(0);
    });

    it('increases the card balance instead of touching an account', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'CREDIT_CARD', obligationId: 'card' });
        const [entry] = await db.obligationEntries.toArray();
        expect(entry.amount).toBe(50_000);
        expect(await db.accountEntries.count()).toBe(0);
    });

    it('moves the impact when the payment method changes on edit', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' });
        const saved = (await db.expenses.get('exp-1'))!;
        await saveExpenseWithLedger(saved, { kind: 'CREDIT_CARD', obligationId: 'card' });
        expect(await db.accountEntries.count()).toBe(0);
        expect(await db.obligationEntries.count()).toBe(1);
        expect(await db.financialEvents.count()).toBe(1);
    });

    it('refuses edits and deletes in a closed period', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' });
        const saved = (await db.expenses.get('exp-1'))!;
        await closePeriod('2026-10');
        await expect(saveExpenseWithLedger({ ...saved, amount: 1 }, { kind: 'ACCOUNT', accountId: 'cop' })).rejects.toBeInstanceOf(LedgerError);
        await expect(deleteExpenseWithLedger(saved)).rejects.toBeInstanceOf(LedgerError);
        expect((await db.expenses.get('exp-1'))?.amount).toBe(50_000);
    });

    it('refuses to move an expense out of a closed period', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' });
        const saved = (await db.expenses.get('exp-1'))!;
        await closePeriod('2026-10');
        await expect(saveExpenseWithLedger({ ...saved, date: '2026-11-02', periodId: '2026-11' }, { kind: 'ACCOUNT', accountId: 'cop' }))
            .rejects.toBeInstanceOf(LedgerError);
    });
});

describe('pairEventsAsTransfer', () => {
    const oneSided = (id: string, type: 'INCOME' | 'ADJUSTMENT', accountId: string, amount: number) => saveFinancialEvent(
        { id, periodId: '2026-10', date: '2026-10-09', type, concept: id },
        [{ accountId, amount, currency: 'COP' }],
    );

    it('turns a reconciled income and adjustment into a transfer and keeps the excess', async () => {
        await oneSided('adj', 'ADJUSTMENT', 'cop', -2_009_618);
        await oneSided('inc', 'INCOME', 'pocket', 1_896_531);
        const transferId = await pairEventsAsTransfer('adj', 'inc');

        const transferEntries = await db.accountEntries.where('eventId').equals(transferId).toArray();
        expect(transferEntries.map(entry => entry.amount).sort((a, b) => a - b)).toEqual([-1_896_531, 1_896_531]);
        expect(await db.financialEvents.get('inc')).toBeUndefined();
        const [rest] = await db.accountEntries.where('eventId').equals('adj').toArray();
        expect(rest.amount).toBe(-113_087);

        const perAccount = async (accountId: string) => (await db.accountEntries.where('accountId').equals(accountId).toArray())
            .reduce((sum, entry) => sum + entry.amount, 0);
        expect(await perAccount('cop')).toBe(-2_009_618);
        expect(await perAccount('pocket')).toBe(1_896_531);
    });

    it('removes both events when the amounts match exactly', async () => {
        await oneSided('adj', 'ADJUSTMENT', 'cop', -500_000);
        await oneSided('inc', 'INCOME', 'pocket', 500_000);
        await pairEventsAsTransfer('adj', 'inc');
        expect((await db.financialEvents.toArray()).map(event => event.type)).toEqual(['TRANSFER']);
    });

    it('rejects pairs in the wrong direction, across currencies or in a closed period', async () => {
        await oneSided('adj', 'ADJUSTMENT', 'cop', -500_000);
        await oneSided('inc', 'INCOME', 'pocket', 500_000);
        await expect(pairEventsAsTransfer('inc', 'adj')).rejects.toBeInstanceOf(LedgerError);

        await saveFinancialEvent({ id: 'usd-in', periodId: '2026-10', date: '2026-10-09', type: 'INCOME', concept: 'usd' }, [{ accountId: 'usd', amount: 100, currency: 'USD' }]);
        await expect(pairEventsAsTransfer('adj', 'usd-in')).rejects.toBeInstanceOf(LedgerError);

        await closePeriod('2026-10');
        await expect(pairEventsAsTransfer('adj', 'inc')).rejects.toBeInstanceOf(LedgerError);
        expect(await db.financialEvents.count()).toBe(3);
    });

    it('stores amounts without floating-point noise', async () => {
        const id = await saveFinancialEvent(
            { periodId: '2026-10', date: '2026-10-09', type: 'PASSIVE_RETURN', concept: 'IQ' },
            [{ accountId: 'usd', amount: 463.38 - 427, currency: 'USD' }],
        );
        expect((await db.accountEntries.where('eventId').equals(id).first())?.amount).toBe(36.38);
    });
});

describe('copyRecurringPlan', () => {
    it('copies rates, recurring flows and recurring expenses once, and never into a closed period', async () => {
        const { copyRecurringPlan } = await import('./recurring');
        await db.accountPlans.add({ id: 'p9', periodId: '2026-09', accountId: 'cop', concept: 'Intereses', type: 'FIXED_EA', rateEA: 0.1, createdAt: now, updatedAt: now });
        await db.plannedCashFlows.bulkAdd([
            { id: 'f9', periodId: '2026-09', accountId: 'cop', type: 'SALARY', concept: 'Salario', amount: 5_000_000, currency: 'COP', isRecurring: true, createdAt: now, updatedAt: now },
            { id: 'once', periodId: '2026-09', accountId: 'cop', type: 'OTHER_INCOME', concept: 'Bono', amount: 1, currency: 'COP', isRecurring: false, createdAt: now, updatedAt: now },
        ]);
        await db.expenses.add(expense({ id: 'netflix', periodId: '2026-09', date: '2026-09-05', reason: 'Netflix', amount: 40_000, isRecurring: true, paymentAccountId: 'cop' }));

        expect(await copyRecurringPlan('2026-10', '2026-09')).toEqual({ plans: 1, flows: 2 });
        expect(await copyRecurringPlan('2026-10', '2026-09')).toEqual({ plans: 0, flows: 0 });
        const concepts = (await db.plannedCashFlows.where('periodId').equals('2026-10').toArray()).map(flow => flow.concept).sort();
        expect(concepts).toEqual(['Netflix', 'Salario']);

        await closePeriod('2026-11');
        await expect(copyRecurringPlan('2026-11', '2026-10')).rejects.toBeInstanceOf(LedgerError);
    });
});

describe('kept-balance expenses', () => {
    const accountTotal = async () => (await db.accountEntries.where('accountId').equals('cop').toArray()).reduce((sum, entry) => sum + entry.amount, 0);
    const correction = (amount: number) => saveFinancialEvent(
        { periodId: '2026-10', date: '2026-10-31', type: 'ADJUSTMENT', concept: 'Ajuste de conciliación' },
        [{ accountId: 'cop', amount: -amount, currency: 'COP' }],
    );
    const past = (overrides: Partial<Expense> = {}) => expense({ keepsBalance: true, paymentAccountId: 'cop', ...overrides });

    it('takes the place of the correction the close used, without moving the account', async () => {
        await correction(80_000);
        const { absorbed } = await saveExpenseWithLedger(past(), { kind: 'ACCOUNT', accountId: 'cop' });
        expect(absorbed).toBe(50_000);
        expect(await accountTotal()).toBe(-80_000);
        const adjustments = await db.financialEvents.where('type').equals('ADJUSTMENT').toArray();
        expect(adjustments).toHaveLength(1);
        expect((await db.accountEntries.where('eventId').equals(adjustments[0].id).first())?.amount).toBe(-30_000);
    });

    it('removes a correction it covers exactly, and has no entries when there is nothing to take', async () => {
        await correction(50_000);
        await saveExpenseWithLedger(past(), { kind: 'ACCOUNT', accountId: 'cop' });
        expect(await db.financialEvents.where('type').equals('ADJUSTMENT').count()).toBe(0);
        await saveExpenseWithLedger(past({ id: 'exp-2', reason: 'Otro' }), { kind: 'ACCOUNT', accountId: 'cop' });
        const second = await db.expenses.get('exp-2');
        expect(await db.accountEntries.where('eventId').equals(second!.financialEventId!).count()).toBe(0);
        expect(await accountTotal()).toBe(-50_000);
    });

    it('gives the correction back when edited down or deleted', async () => {
        await correction(50_000);
        await saveExpenseWithLedger(past(), { kind: 'ACCOUNT', accountId: 'cop' });
        await saveExpenseWithLedger({ ...(await db.expenses.get('exp-1'))!, amount: 20_000 }, { kind: 'ACCOUNT', accountId: 'cop' });
        expect(await accountTotal()).toBe(-50_000);
        await deleteExpenseWithLedger((await db.expenses.get('exp-1'))!);
        expect(await accountTotal()).toBe(-50_000);
        expect(await db.expenses.count()).toBe(0);
    });

    it('links a payment to the planned expense it fulfils and keeps the link on edit', async () => {
        await saveExpenseWithLedger(expense(), { kind: 'ACCOUNT', accountId: 'cop' }, { plannedCashFlowId: 'flow-1' });
        await saveExpenseWithLedger({ ...(await db.expenses.get('exp-1'))!, amount: 60_000 }, { kind: 'ACCOUNT', accountId: 'cop' });
        const saved = await db.expenses.get('exp-1');
        expect((await db.financialEvents.get(saved!.financialEventId!))?.plannedCashFlowId).toBe('flow-1');
    });
});
