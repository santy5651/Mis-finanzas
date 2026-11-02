import { describe, expect, it } from 'vitest';
import { computeNetWorth, type NetWorthInput } from './networth';
import type { Account, AccountSnapshot, Obligation, Period } from '@/lib/types';

const account = (id: string, overrides: Partial<Account> = {}): Account => ({ id, name: id, entityId: 'e', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true, ...overrides });
const snap = (accountId: string, periodId: string, balance: number, usdCopRate?: number): AccountSnapshot => ({ id: `${periodId}-${accountId}`, periodId, accountId, balance, usdCopRate, createdAt: '', updatedAt: '' });
const card: Obligation = { id: 'card', entityId: 'e', name: 'Tarjeta', direction: 'PAYABLE', type: 'CREDIT_CARD', currency: 'COP', isActive: true, createdAt: '', updatedAt: '' };
const october: Period = { id: '2026-10', year: 2026, month: 10, usdCopRate: 4_000, status: 'OPEN' };

function input(overrides: Partial<NetWorthInput>): NetWorthInput {
    return { period: october, accounts: [], snapshots: [], previousSnapshots: [], entries: [], obligations: [], obligationSnapshots: [], previousObligationSnapshots: [], obligationEntries: [], ...overrides };
}

describe('computeNetWorth', () => {
    it('estimates a forgotten balance from last month plus this month entries', () => {
        const result = computeNetWorth(input({
            accounts: [account('nu'), account('pibank')],
            snapshots: [snap('nu', '2026-10', 1_000_000)],
            previousSnapshots: [snap('nu', '2026-09', 900_000), snap('pibank', '2026-09', 10_000_000)],
            entries: [{ id: 'x', eventId: 'e', periodId: '2026-10', accountId: 'pibank', amount: 80_000, currency: 'COP', createdAt: '' }],
        }));
        expect(result.assets).toBe(11_080_000);
        expect(result.estimatedAccounts.map(item => item.id)).toEqual(['pibank']);
    });

    it('does not estimate inactive or brand-new accounts', () => {
        const result = computeNetWorth(input({
            accounts: [account('closed', { isActive: false }), account('new')],
            previousSnapshots: [snap('closed', '2026-09', 500_000)],
        }));
        expect(result.assets).toBe(0);
        expect(result.estimatedAccounts).toEqual([]);
    });

    it('reports USD balances without a rate instead of counting them as zero', () => {
        const result = computeNetWorth(input({
            period: { ...october, usdCopRate: null },
            accounts: [account('broker', { currency: 'USD', name: 'eToro' }), account('nu')],
            snapshots: [snap('broker', '2026-10', 250), snap('nu', '2026-10', 100)],
        }));
        expect(result.missingRate).toEqual(['eToro']);
        expect(result.assets).toBe(100);
    });

    it('uses the frozen snapshot rate once the period is closed', () => {
        const result = computeNetWorth(input({
            period: { ...october, status: 'CLOSED', usdCopRate: 4_500 },
            accounts: [account('broker', { currency: 'USD' })],
            snapshots: [snap('broker', '2026-10', 100, 4_000)],
        }));
        expect(result.assets).toBe(400_000);
    });

    it('subtracts payables and carries a card balance forward with its entries', () => {
        const result = computeNetWorth(input({
            accounts: [account('nu')],
            snapshots: [snap('nu', '2026-10', 5_000_000)],
            obligations: [card],
            previousObligationSnapshots: [{ id: 'o', periodId: '2026-09', obligationId: 'card', balance: 1_000_000, createdAt: '', updatedAt: '' }],
            obligationEntries: [{ id: 'oe', eventId: 'e', periodId: '2026-10', obligationId: 'card', amount: 200_000, currency: 'COP', createdAt: '' }],
        }));
        expect(result.payables).toBe(1_200_000);
        expect(result.netWorth).toBe(3_800_000);
    });
});
