import type { Account, AccountEntry, AccountSnapshot, Obligation, ObligationEntry, ObligationSnapshot, Period } from '@/lib/types';
import { convertToCopOrNull } from './currency';

export interface NetWorthInput {
    period?: Period;
    accounts: Account[];
    /** Snapshots of this period and of the one before, used to estimate a missing balance. */
    snapshots: AccountSnapshot[];
    previousSnapshots: AccountSnapshot[];
    entries: AccountEntry[];
    obligations: Obligation[];
    obligationSnapshots: ObligationSnapshot[];
    previousObligationSnapshots: ObligationSnapshot[];
    obligationEntries: ObligationEntry[];
}

export interface NetWorthResult {
    assets: number;
    receivables: number;
    payables: number;
    netWorth: number;
    /** Active accounts without a real balance this month, valued at last balance plus this month's entries. */
    estimatedAccounts: Account[];
    /** Names of USD accounts or obligations left out because the period has no TRM. */
    missingRate: string[];
}

const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + row.amount, 0);

/** Real balance of the period, or last month's balance carried forward with this month's entries. */
export function obligationBalance(
    obligationId: string,
    snapshots: ObligationSnapshot[],
    previousSnapshots: ObligationSnapshot[],
    entries: ObligationEntry[],
): number {
    const snapshot = snapshots.find(item => item.obligationId === obligationId);
    if (snapshot) return snapshot.balance;
    const previous = previousSnapshots.find(item => item.obligationId === obligationId);
    return Math.max(0, (previous?.balance ?? 0) + sum(entries.filter(item => item.obligationId === obligationId)));
}

/**
 * Net worth for one period. A forgotten balance is estimated instead of dropped, so the month's
 * variation does not fall by that account's whole balance; a missing TRM is reported instead of
 * silently valuing USD at zero.
 */
export function computeNetWorth(input: NetWorthInput): NetWorthResult {
    const estimatedAccounts: Account[] = [];
    const missingRate: string[] = [];
    let assets = 0;

    for (const account of input.accounts) {
        const snapshot = input.snapshots.find(item => item.accountId === account.id);
        let balance: number;
        if (snapshot) {
            balance = snapshot.balance;
        } else {
            const previous = input.previousSnapshots.find(item => item.accountId === account.id);
            if (!account.isActive || !previous) continue;
            balance = previous.balance + sum(input.entries.filter(item => item.accountId === account.id));
            estimatedAccounts.push(account);
        }
        const value = convertToCopOrNull(balance, account.currency, input.period, snapshot);
        if (value === null) missingRate.push(account.name);
        else assets += value;
    }

    let receivables = 0;
    let payables = 0;
    for (const obligation of input.obligations) {
        const snapshot = input.obligationSnapshots.find(item => item.obligationId === obligation.id);
        const balance = obligationBalance(obligation.id, input.obligationSnapshots, input.previousObligationSnapshots, input.obligationEntries);
        if (!balance) continue;
        const value = convertToCopOrNull(balance, obligation.currency, input.period, snapshot);
        if (value === null) missingRate.push(obligation.name);
        else if (obligation.direction === 'RECEIVABLE') receivables += value;
        else payables += value;
    }

    return { assets, receivables, payables, netWorth: assets + receivables - payables, estimatedAccounts, missingRate };
}
