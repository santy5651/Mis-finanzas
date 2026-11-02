import { describe, expect, it } from 'vitest';
import { annualize, chainReturns, combinePerformance, monthlyPerformance, realRate, summarizePerformance } from './performance';
import type { AccountEntry, AccountSnapshot, FinancialEvent } from '@/lib/types';

const snap = (periodId: string, balance: number, accountId = 'tyba'): AccountSnapshot => ({ id: `${accountId}-${periodId}`, periodId, accountId, balance, createdAt: '', updatedAt: '' });
const event = (id: string, type: FinancialEvent['type'], periodId: string): FinancialEvent => ({ id, periodId, date: `${periodId}-28`, type, concept: id, createdAt: '', updatedAt: '' });
const entry = (eventId: string, periodId: string, amount: number, accountId = 'tyba'): AccountEntry => ({ id: `${eventId}-${accountId}`, eventId, periodId, accountId, amount, currency: 'COP', createdAt: '' });

describe('monthlyPerformance', () => {
    it('does not count a 3M contribution as return', () => {
        const [month] = monthlyPerformance(
            { id: 'tyba' },
            [snap('2026-06', 30_000_000), snap('2026-07', 33_300_000)],
            [entry('aporte', '2026-07', 3_000_000), entry('valor', '2026-07', 300_000)],
            [event('aporte', 'TRANSFER', '2026-07'), event('valor', 'PASSIVE_RETURN', '2026-07')],
        );
        expect(month.gain).toBe(300_000);
        expect(month.netFlows).toBe(3_000_000);
        expect(month.rate).toBeCloseTo(300_000 / 31_500_000, 10);
    });

    it('treats an unexplained difference as a flow, never as return', () => {
        const [month] = monthlyPerformance({ id: 'tyba' }, [snap('2026-06', 1_000_000), snap('2026-07', 1_500_000)], [], []);
        expect(month.gain).toBe(0);
        expect(month.rate).toBe(0);
    });

    it('leaves cashback out of the return', () => {
        const [month] = monthlyPerformance(
            { id: 'tyba' },
            [snap('2026-06', 1_000_000), snap('2026-07', 1_020_000)],
            [entry('cb', '2026-07', 20_000)],
            [{ ...event('cb', 'PASSIVE_RETURN', '2026-07'), returnKind: 'CASHBACK' }],
        );
        expect(month.gain).toBe(0);
    });

    it('skips months without an opening balance', () => {
        expect(monthlyPerformance({ id: 'tyba' }, [snap('2026-05', 100), snap('2026-07', 120)], [], [])).toEqual([]);
    });
});

describe('aggregation', () => {
    it('chains, annualizes and adjusts for inflation', () => {
        expect(chainReturns([0.01, 0.01])).toBeCloseTo(0.0201, 10);
        expect(annualize(0.0201, 2)).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
        expect(realRate(0.1, 0.05)).toBeCloseTo(0.047619, 6);
    });

    it('summarizes the last 12 months', () => {
        const months = Array.from({ length: 14 }, (_, index) => ({ periodId: `p${index}`, start: 100, end: 101, gain: 1, netFlows: 0, rate: 0.01 }));
        const summary = summarizePerformance(months);
        expect(summary.trailing?.months).toBe(12);
        expect(summary.trailing?.annualized).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
        expect(summarizePerformance([]).trailing).toBeNull();
    });

    it('weights a portfolio by money, not by account count', () => {
        const [month] = combinePerformance([
            [{ periodId: '2026-07', start: 9_000_000, end: 9_090_000, gain: 90_000, netFlows: 0, rate: 0.01 }],
            [{ periodId: '2026-07', start: 1_000_000, end: 1_050_000, gain: 50_000, netFlows: 0, rate: 0.05 }],
        ]);
        expect(month.rate).toBeCloseTo(0.014, 10);
    });
});
