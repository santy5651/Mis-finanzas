import { describe, expect, it } from 'vitest';
import { computeTaxReport, filingChecks, inflationaryComponent, type TaxYearInput } from './tax';
import type { Account, FinancialEvent } from '@/lib/types';

const account = (id: string, overrides: Partial<Account> = {}): Account => ({ id, name: id, entityId: 'e', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true, ...overrides });
const event = (id: string, periodId: string, type: FinancialEvent['type'], extra: Partial<FinancialEvent> = {}): FinancialEvent => ({ id, periodId, date: `${periodId}-15`, type, concept: id, createdAt: '', updatedAt: '', ...extra });

function input(): TaxYearInput {
    return {
        year: 2026,
        accounts: [account('nomina'), account('tyba', { returnBehavior: 'MARKET_VALUE' }), account('fna', { isRestricted: true }), account('etoro', { currency: 'USD' })],
        obligations: [{ id: 'card', entityId: 'e', name: 'Tarjeta', direction: 'PAYABLE', type: 'CREDIT_CARD', currency: 'COP', isActive: true, createdAt: '', updatedAt: '' }],
        periods: [{ id: '2026-12', year: 2026, month: 12, usdCopRate: 4_000, status: 'CLOSED' }, { id: '2026-03', year: 2026, month: 3, usdCopRate: 4_100 }],
        snapshots: [
            { id: 's1', periodId: '2026-12', accountId: 'nomina', balance: 2_000_000, createdAt: '', updatedAt: '' },
            { id: 's2', periodId: '2026-12', accountId: 'tyba', balance: 40_000_000, createdAt: '', updatedAt: '' },
            { id: 's3', periodId: '2026-12', accountId: 'etoro', balance: 250, usdCopRate: 4_000, createdAt: '', updatedAt: '' },
            { id: 's4', periodId: '2026-11', accountId: 'fna', balance: 8_000_000, createdAt: '', updatedAt: '' },
        ],
        obligationSnapshots: [{ id: 'o1', periodId: '2026-12', obligationId: 'card', balance: 1_500_000, createdAt: '', updatedAt: '' }],
        entries: [
            { id: 'a1', eventId: 'salary', periodId: '2026-03', accountId: 'nomina', amount: 5_000_000, currency: 'COP', createdAt: '' },
            { id: 'a2', eventId: 'interest', periodId: '2026-03', accountId: 'nomina', amount: 10_000, currency: 'COP', createdAt: '' },
            { id: 'a3', eventId: 'valuation', periodId: '2026-03', accountId: 'tyba', amount: 300_000, currency: 'COP', createdAt: '' },
            { id: 'a4', eventId: 'cesantias', periodId: '2026-03', accountId: 'fna', amount: 50_000, currency: 'COP', createdAt: '' },
            { id: 'a5', eventId: 'gain', periodId: '2026-03', accountId: 'etoro', amount: 10, currency: 'USD', createdAt: '' },
            { id: 'a6', eventId: 'salary-2025', periodId: '2025-12', accountId: 'nomina', amount: 4_000_000, currency: 'COP', createdAt: '' },
        ],
        obligationEntries: [
            { id: 'c1', eventId: 'purchase', periodId: '2026-03', obligationId: 'card', amount: 900_000, currency: 'COP', createdAt: '' },
            { id: 'c2', eventId: 'fee', periodId: '2026-03', obligationId: 'card', amount: 30_000, currency: 'COP', createdAt: '' },
        ],
        events: [
            event('salary', '2026-03', 'INCOME', { incomeKind: 'SALARY' }),
            event('interest', '2026-03', 'PASSIVE_RETURN', { returnKind: 'INTEREST' }),
            event('valuation', '2026-03', 'PASSIVE_RETURN'),
            event('cesantias', '2026-03', 'PASSIVE_RETURN', { returnKind: 'INTEREST' }),
            event('gain', '2026-03', 'PASSIVE_RETURN', { returnKind: 'REALIZED_GAIN' }),
            event('salary-2025', '2025-12', 'INCOME', { incomeKind: 'SALARY' }),
            event('purchase', '2026-03', 'EXPENSE', { expenseId: 'x' }),
            event('fee', '2026-03', 'EXPENSE', { chargeKind: 'FEE' }),
            event('legacy', '2026-03', 'INCOME', { incomeId: 'old-bonus' }),
        ],
        incomes: [{ id: 'old-bonus', periodId: '2026-03', concept: 'Bono', amount: 700_000, currency: 'COP', isSalary: false }],
    };
}

describe('computeTaxReport', () => {
    const report = computeTaxReport(input());

    it('values wealth at the December close, estimating a missing balance', () => {
        expect(report.assets.find(item => item.name === 'fna')).toMatchObject({ native: 8_000_000, estimated: true, restricted: true });
        expect(report.grossWealth).toBe(2_000_000 + 40_000_000 + 1_000_000 + 8_000_000);
        expect(report.debts).toBe(1_500_000);
        expect(report.netWealth).toBe(49_500_000);
        expect(report.foreignCurrencyAssets).toBe(1_000_000);
        expect(report.closingIsClosed).toBe(true);
    });

    it('adds the year flows by nature and leaves other years out', () => {
        expect(report.laborIncome).toBe(5_000_000);
        expect(report.otherIncome).toBe(700_000);
        expect(report.interest).toBe(10_000);
        expect(report.restrictedReturns).toBe(50_000);
        expect(report.realizedGains).toBe(41_000);
        expect(report.unrealized).toBe(300_000);
        expect(report.cardPurchases).toBe(900_000);
    });
});

describe('year in progress', () => {
    it('uses the latest close of the year when December does not exist yet', () => {
        const data = input();
        data.snapshots = data.snapshots.map(item => ({ ...item, periodId: item.periodId === '2026-12' ? '2026-10' : '2026-09' }));
        const report = computeTaxReport(data);
        expect(report.closingPeriodId).toBe('2026-10');
        expect(report.assets.find(item => item.name === 'nomina')?.native).toBe(2_000_000);
    });
});

describe('filing thresholds', () => {
    it('compares each threshold in UVT', () => {
        const checks = filingChecks(computeTaxReport(input()), 10_000);
        expect(checks[0]).toMatchObject({ limit: 45_000_000, exceeded: true });
        expect(checks[2]).toMatchObject({ value: 900_000, exceeded: false });
    });

    it('computes the non-taxable inflationary part of interest', () => {
        expect(inflationaryComponent(1_000_000, 60.5)).toBe(605_000);
        expect(inflationaryComponent(1_000_000, 150)).toBe(1_000_000);
    });
});
