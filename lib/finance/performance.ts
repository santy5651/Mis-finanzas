import { format, parse, subMonths } from 'date-fns';
import type { Account, AccountEntry, AccountSnapshot, FinancialEvent } from '@/lib/types';

export interface MonthlyPerformance {
    periodId: string;
    start: number;
    end: number;
    /** Registered returns (PASSIVE_RETURN entries) of the month. */
    gain: number;
    /** Everything else that moved the balance: transfers, income, expenses and unexplained differences. */
    netFlows: number;
    rate: number;
}

const previousId = (periodId: string) => format(subMonths(parse(periodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM');

/**
 * Month-by-month return of one account with the Modified Dietz method: the gain over the opening
 * balance plus half the month's net flows, so contributions are not mistaken for performance.
 * Only classified returns (cashback excluded) count as gain; an unexplained difference is treated as a flow, never as
 * performance. Months without a balance at both ends are skipped.
 */
export function monthlyPerformance(
    account: Pick<Account, 'id'>,
    snapshots: AccountSnapshot[],
    entries: AccountEntry[],
    events: FinancialEvent[],
): MonthlyPerformance[] {
    const own = new Map(snapshots.filter(item => item.accountId === account.id).map(item => [item.periodId, item]));
    // Cashback is a reward on spending, not something the balance earned.
    const returnEvents = new Set(events.filter(event => event.type === 'PASSIVE_RETURN' && event.returnKind !== 'CASHBACK').map(event => event.id));
    return [...own.keys()].sort().flatMap(periodId => {
        const opening = own.get(previousId(periodId));
        const closing = own.get(periodId)!;
        if (!opening) return [];
        const gain = entries
            .filter(entry => entry.accountId === account.id && entry.periodId === periodId && returnEvents.has(entry.eventId))
            .reduce((sum, entry) => sum + entry.amount, 0);
        const netFlows = closing.balance - opening.balance - gain;
        const base = opening.balance + netFlows / 2;
        if (base <= 0) return [];
        return [{ periodId, start: opening.balance, end: closing.balance, gain, netFlows, rate: gain / base }];
    });
}

/** Chains monthly rates into a time-weighted return. */
export function chainReturns(rates: number[]): number {
    return rates.reduce((total, rate) => total * (1 + rate), 1) - 1;
}

export function annualize(cumulative: number, months: number): number | null {
    if (months <= 0 || cumulative <= -1) return null;
    return Math.pow(1 + cumulative, 12 / months) - 1;
}

/** Return after inflation, both as effective annual fractions. */
export function realRate(nominal: number, inflation: number): number {
    return (1 + nominal) / (1 + inflation) - 1;
}

export interface PerformanceSummary {
    lastMonth: MonthlyPerformance | null;
    /** Time-weighted return of the last 12 months with data, and how many months it covers. */
    trailing: { cumulative: number; annualized: number | null; months: number } | null;
}

export function summarizePerformance(months: MonthlyPerformance[]): PerformanceSummary {
    if (!months.length) return { lastMonth: null, trailing: null };
    const window = months.slice(-12);
    const cumulative = chainReturns(window.map(item => item.rate));
    return {
        lastMonth: months[months.length - 1],
        trailing: { cumulative, annualized: annualize(cumulative, window.length), months: window.length },
    };
}

/**
 * Combines several accounts' months into one portfolio series. Values must already be in one
 * currency; currency effects are left out, so the result measures the investments themselves.
 */
export function combinePerformance(series: MonthlyPerformance[][]): MonthlyPerformance[] {
    const byPeriod = new Map<string, MonthlyPerformance>();
    for (const item of series.flat()) {
        const current = byPeriod.get(item.periodId) ?? { periodId: item.periodId, start: 0, end: 0, gain: 0, netFlows: 0, rate: 0 };
        byPeriod.set(item.periodId, { ...current, start: current.start + item.start, end: current.end + item.end, gain: current.gain + item.gain, netFlows: current.netFlows + item.netFlows });
    }
    return [...byPeriod.values()].sort((a, b) => a.periodId.localeCompare(b.periodId)).flatMap(item => {
        const base = item.start + item.netFlows / 2;
        return base > 0 ? [{ ...item, rate: item.gain / base }] : [];
    });
}
