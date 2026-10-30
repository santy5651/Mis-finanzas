import { describe, expect, it } from 'vitest';
import { defaultReturnKind, resolveReturnKind, summarizeReturns } from './returns';
import type { Account, AccountEntry, FinancialEvent, ReturnKind } from '@/lib/types';

function account(id: string, overrides: Partial<Account> = {}): Account {
    return { id, name: id, entityId: 'e', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true, ...overrides };
}
function event(id: string, type: FinancialEvent['type'], returnKind?: ReturnKind): FinancialEvent {
    return { id, periodId: '2026-10', date: '2026-10-31', type, concept: id, returnKind, createdAt: '', updatedAt: '' };
}
function entry(eventId: string, accountId: string, amount: number, currency: Account['currency'] = 'COP'): AccountEntry {
    return { id: `${eventId}-${accountId}`, eventId, periodId: '2026-10', accountId, amount, currency, createdAt: '' };
}
const asCop = (item: AccountEntry) => item.currency === 'USD' ? item.amount * 4_000 : item.amount;

const accounts = [
    account('nu'),
    account('tyba', { returnBehavior: 'MARKET_VALUE' }),
    account('broker', { returnBehavior: 'MARKET_VALUE', currency: 'USD' }),
    account('fna', { isRestricted: true }),
    account('lulo-mama', { legalHolder: 'Mamá' }),
];

describe('return kind resolution', () => {
    it('keeps an explicit kind and otherwise follows the account profile', () => {
        expect(resolveReturnKind({ returnKind: 'CASHBACK' }, accounts[1])).toBe('CASHBACK');
        expect(resolveReturnKind({}, accounts[1])).toBe('UNREALIZED_VALUATION');
        expect(resolveReturnKind({}, accounts[0])).toBe('INTEREST');
        expect(defaultReturnKind(undefined)).toBe('INTEREST');
    });
});

describe('summarizeReturns', () => {
    it('counts credited interest once even after it is transferred to another account', () => {
        const result = summarizeReturns(
            [entry('interest', 'nu', 120_000), entry('move', 'nu', -120_000), entry('move', 'lulo-mama', 120_000)],
            [event('interest', 'PASSIVE_RETURN', 'INTEREST'), event('move', 'TRANSFER')],
            accounts, asCop,
        );
        expect(result.collected).toBe(120_000);
        expect(result.availableForSpending).toBe(120_000);
        expect(result.total).toBe(120_000);
    });

    it('keeps fund valuation out of collected and spendable returns', () => {
        const result = summarizeReturns(
            [entry('tyba-close', 'tyba', 850_000)],
            [event('tyba-close', 'PASSIVE_RETURN')],
            accounts, asCop,
        );
        expect(result.byKind.UNREALIZED_VALUATION).toBe(850_000);
        expect(result.collected).toBe(0);
        expect(result.availableForSpending).toBe(0);
    });

    it('nets broker gains and losses without calling them realized or passive income', () => {
        const result = summarizeReturns(
            [entry('gain', 'broker', 50, 'USD'), entry('loss', 'broker', -80, 'USD')],
            [event('gain', 'PASSIVE_RETURN'), event('loss', 'PASSIVE_RETURN')],
            accounts, asCop,
        );
        expect(result.byKind.UNREALIZED_VALUATION).toBe(-120_000);
        expect(result.byKind.REALIZED_GAIN).toBe(0);
        expect(result.availableForSpending).toBe(0);
    });

    it('marks restricted returns apart from spendable money', () => {
        const result = summarizeReturns(
            [entry('fna-interest', 'fna', 300_000)],
            [event('fna-interest', 'PASSIVE_RETURN', 'INTEREST')],
            accounts, asCop,
        );
        expect(result.collected).toBe(300_000);
        expect(result.restricted).toBe(300_000);
        expect(result.availableForSpending).toBe(0);
    });

    it('reports cashback separately from interest but as spendable', () => {
        const result = summarizeReturns(
            [entry('cashback', 'nu', 15_000)],
            [event('cashback', 'PASSIVE_RETURN', 'CASHBACK')],
            accounts, asCop,
        );
        expect(result.byKind.CASHBACK).toBe(15_000);
        expect(result.collected).toBe(0);
        expect(result.availableForSpending).toBe(15_000);
    });

    it('ignores salary, adjustments and money from third-party custody accounts', () => {
        const result = summarizeReturns(
            [entry('salary', 'nu', 5_000_000), entry('adjust', 'nu', 1_000), entry('from-mom', 'lulo-mama', -400_000), entry('from-mom', 'nu', 400_000)],
            [event('salary', 'INCOME'), event('adjust', 'ADJUSTMENT'), event('from-mom', 'TRANSFER')],
            accounts, asCop,
        );
        expect(result.total).toBe(0);
    });
});
