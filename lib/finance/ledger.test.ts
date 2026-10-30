import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import type { Account, Expense, Obligation } from '@/lib/types';
import { deleteExpenseWithLedger, deleteFinancialEvent, LedgerError, saveExpenseWithLedger, saveFinancialEvent } from './ledger';

const now = '2026-10-01T00:00:00.000Z';
const cop: Account = { id: 'cop', name: 'Ahorros COP', entityId: 'bank', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true };
const usd: Account = { ...cop, id: 'usd', name: 'Cuenta USD', currency: 'USD' };
const card: Obligation = { id: 'card', entityId: 'bank', name: 'Tarjeta', direction: 'PAYABLE', type: 'CREDIT_CARD', currency: 'COP', isActive: true, createdAt: now, updatedAt: now };

async function closePeriod(periodId: string) {
    await db.periods.put({ id: periodId, year: Number(periodId.slice(0, 4)), month: Number(periodId.slice(5)), usdCopRate: 4_000, status: 'CLOSED' });
}

function expense(overrides: Partial<Expense> = {}): Expense {
    return { id: 'exp-1', date: '2026-10-15', periodId: '2026-10', reason: 'Mercado', amount: 50_000, currency: 'COP', method: 'DEBIT', installments: 1, ...overrides };
}

beforeEach(async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await db.accounts.bulkAdd([cop, usd]);
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
