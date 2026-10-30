import type { AccountSnapshot, Currency, Period } from '@/lib/types';

/**
 * While a period is open its candidate TRM is authoritative. Once closed, the
 * rate frozen in the snapshot takes precedence so historical totals cannot drift.
 */
export function resolveUsdCopRate(period?: Period, snapshot?: Pick<AccountSnapshot, 'usdCopRate'>): number | null {
    if (period?.status === 'CLOSED') return snapshot?.usdCopRate ?? period.usdCopRate ?? null;
    return period?.usdCopRate ?? snapshot?.usdCopRate ?? null;
}

export function convertToCop(
    amount: number,
    currency: Currency,
    period?: Period,
    snapshot?: Pick<AccountSnapshot, 'usdCopRate'>,
): number {
    if (currency === 'COP') return amount;
    const rate = resolveUsdCopRate(period, snapshot);
    return rate ? amount * rate : 0;
}

/** Smallest difference worth explaining: one peso, or one cent of a dollar. */
export function isSignificant(amount: number, currency: Currency): boolean {
    return Math.abs(amount) >= (currency === 'COP' ? 1 : 0.01);
}

export function roundMoney(amount: number, currency: Currency): number {
    return currency === 'COP' ? Math.round(amount) : Math.round(amount * 100) / 100;
}
