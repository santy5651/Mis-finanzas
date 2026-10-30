import { describe, expect, it } from 'vitest';
import { convertToCop, resolveUsdCopRate } from './currency';
import type { AccountSnapshot, Period } from '@/lib/types';

const snapshot: AccountSnapshot = {
    id: 'snapshot', periodId: '2026-08', accountId: 'usd', balance: 100,
    usdCopRate: 3_100, createdAt: '', updatedAt: '',
};

function period(status: Period['status'], rate: number): Period {
    return { id: '2026-08', year: 2026, month: 8, usdCopRate: rate, status };
}

describe('COP conversion for monthly close', () => {
    it('converts a confirmed USD passive return before adding it to COP totals', () => {
        expect(convertToCop(25, 'USD', period('CLOSED', 3_200), { ...snapshot, usdCopRate: 3_200 })).toBe(80_000);
    });

    it('uses the candidate period rate while reopened', () => {
        const reopened = period('OPEN', 3_300);
        expect(resolveUsdCopRate(reopened, snapshot)).toBe(3_300);
        expect(convertToCop(25, 'USD', reopened, snapshot)).toBe(82_500);
    });

    it('keeps the snapshot rate authoritative after closing', () => {
        const closed = period('CLOSED', 3_300);
        expect(resolveUsdCopRate(closed, snapshot)).toBe(3_100);
        expect(convertToCop(25, 'USD', closed, snapshot)).toBe(77_500);
    });
});
