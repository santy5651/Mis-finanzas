import type { Account, AccountPlan, Currency } from '@/lib/types';
import { roundMoney } from './currency';

export interface MovementCandidate {
    accountId: string;
    currency: Currency;
    /** Part of the unexplained difference that is probably money moved, not return. */
    estimate: number;
}

export interface TransferSuggestion {
    fromAccountId: string;
    toAccountId: string;
    currency: Currency;
    amount: number;
    fromEstimate: number;
    toEstimate: number;
}

/**
 * Interest accounts are expected to grow by their planned return, so that part is set aside
 * before looking for a movement. Market-value accounts have no reliable expectation.
 */
export function estimateMovement(
    unexplained: number,
    expected: number,
    account: Pick<Account, 'returnBehavior'>,
): number {
    if (account.returnBehavior === 'MARKET_VALUE') return unexplained;
    return unexplained - Math.max(0, expected);
}

/** Below this a pairing is noise: a few pesos of interest look like a transfer otherwise. */
const MIN_TRANSFER: Record<Currency, number> = { COP: 10_000, USD: 5 };

/**
 * Pairs an account that lost money with one that gained a similar amount in the same currency.
 * Closest matches win and each account is used once.
 */
export function suggestTransfers(candidates: MovementCandidate[], tolerance = 0.15): TransferSuggestion[] {
    const outgoing = candidates.filter(item => item.estimate <= -MIN_TRANSFER[item.currency]);
    const incoming = candidates.filter(item => item.estimate >= MIN_TRANSFER[item.currency]);
    const pairs = outgoing.flatMap(from => incoming
        .filter(to => to.currency === from.currency && to.accountId !== from.accountId)
        .map(to => {
            const sent = Math.abs(from.estimate);
            const gap = Math.abs(sent - to.estimate) / Math.max(sent, to.estimate);
            return { from, to, gap };
        })
        .filter(pair => pair.gap <= tolerance))
        .sort((a, b) => a.gap - b.gap);

    const used = new Set<string>();
    const suggestions: TransferSuggestion[] = [];
    for (const { from, to } of pairs) {
        if (used.has(from.accountId) || used.has(to.accountId)) continue;
        used.add(from.accountId);
        used.add(to.accountId);
        suggestions.push({
            fromAccountId: from.accountId,
            toAccountId: to.accountId,
            currency: from.currency,
            amount: roundMoney((Math.abs(from.estimate) + to.estimate) / 2, from.currency),
            fromEstimate: from.estimate,
            toEstimate: to.estimate,
        });
    }
    return suggestions;
}

/**
 * Whether a positive difference on an interest account can reasonably be the month's interest.
 * Up to three times the plan, or 2% of the opening balance when there is no plan.
 */
export function isPlausibleInterest(residual: number, expected: number, openingBalance: number): boolean {
    if (residual <= 0) return false;
    const limit = Math.max(3 * Math.abs(expected), Math.abs(openingBalance) * 0.02);
    return residual <= limit;
}

/** Effective annual rate implied by one month of interest. */
export function impliedAnnualRate(interest: number, openingBalance: number): number | null {
    if (openingBalance <= 0 || interest <= 0) return null;
    return Math.pow(1 + interest / openingBalance, 12) - 1;
}

/** The plan's rate expressed as an effective annual fraction, whatever its type. */
export function planAnnualRate(plan?: Pick<AccountPlan, 'type' | 'rateEA' | 'rateMonthly'>): number | null {
    if (!plan) return null;
    if (plan.type === 'FIXED_EA') return plan.rateEA ?? null;
    return plan.rateMonthly === undefined ? null : Math.pow(1 + plan.rateMonthly / 100, 12) - 1;
}
