import type { Account, AccountEntry, FinancialEvent, ReturnKind } from '@/lib/types';

export const RETURN_KIND_LABELS: Record<ReturnKind, string> = {
    INTEREST: 'Intereses',
    DIVIDEND: 'Dividendos y distribuciones',
    REALIZED_GAIN: 'Resultado realizado',
    UNREALIZED_VALUATION: 'Valorización no realizada',
    CASHBACK: 'Cashback y beneficios',
    OTHER: 'Otro rendimiento',
};

export const RETURN_KINDS = Object.keys(RETURN_KIND_LABELS) as ReturnKind[];

/** Kinds that can carry a loss; the rest are credits and are always positive. */
export const SIGNED_RETURN_KINDS: ReturnKind[] = ['REALIZED_GAIN', 'UNREALIZED_VALUATION'];

/** Kind a new return gets by default for this account. */
export function defaultReturnKind(account?: Pick<Account, 'returnBehavior'>): ReturnKind {
    return account?.returnBehavior === 'MARKET_VALUE' ? 'UNREALIZED_VALUATION' : 'INTEREST';
}

/**
 * Events recorded before return kinds existed have none: they are read through the
 * account's current profile, so changing the profile reclassifies them consistently.
 */
export function resolveReturnKind(event: Pick<FinancialEvent, 'returnKind'>, account?: Pick<Account, 'returnBehavior'>): ReturnKind {
    return event.returnKind ?? defaultReturnKind(account);
}

export interface ReturnsSummary {
    byKind: Record<ReturnKind, number>;
    /** Interest and dividends actually credited, any account. */
    collected: number;
    /** Interest, dividends and cashback credited to accounts not marked as restricted. */
    availableForSpending: number;
    /** Every return booked on restricted accounts, whatever its kind. */
    restricted: number;
    /** Sum of all PASSIVE_RETURN entries; equals the former "Rendimiento pasivo" figure. */
    total: number;
}

const SPENDABLE_KINDS: ReturnKind[] = ['INTEREST', 'DIVIDEND', 'CASHBACK'];

/**
 * Splits the period's PASSIVE_RETURN entries by nature and availability. Transfers, income and
 * adjustments are ignored, so moving credited interest to another account never counts twice.
 */
export function summarizeReturns(
    entries: AccountEntry[],
    events: FinancialEvent[],
    accounts: Account[],
    toCop: (entry: AccountEntry) => number,
): ReturnsSummary {
    const eventMap = new Map(events.map(event => [event.id, event]));
    const accountMap = new Map(accounts.map(account => [account.id, account]));
    const byKind = Object.fromEntries(RETURN_KINDS.map(kind => [kind, 0])) as Record<ReturnKind, number>;
    let availableForSpending = 0;
    let restricted = 0;

    for (const entry of entries) {
        const event = eventMap.get(entry.eventId);
        if (event?.type !== 'PASSIVE_RETURN') continue;
        const account = accountMap.get(entry.accountId);
        const kind = resolveReturnKind(event, account);
        const value = toCop(entry);
        byKind[kind] += value;
        if (account?.isRestricted) restricted += value;
        else if (SPENDABLE_KINDS.includes(kind)) availableForSpending += value;
    }

    return {
        byKind,
        collected: byKind.INTEREST + byKind.DIVIDEND,
        availableForSpending,
        restricted,
        total: RETURN_KINDS.reduce((sum, kind) => sum + byKind[kind], 0),
    };
}
