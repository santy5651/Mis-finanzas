import type { AccountEntry, AccountPlan, AccountSnapshot, FinancialEvent, ObligationEntry, ObligationSnapshot } from '@/lib/types';

export function expectedPassiveReturn(openingBalance: number, plan?: AccountPlan): number {
    if (!plan) return 0;
    if (plan.type === 'FIXED_EA') {
        const monthlyRate = Math.pow(1 + (plan.rateEA ?? 0), 1 / 12) - 1;
        return openingBalance * monthlyRate;
    }
    return openingBalance * ((plan.rateMonthly ?? 0) / 100);
}

export function calculateAccountReconciliation(
    current: AccountSnapshot,
    previous: AccountSnapshot | undefined,
    entries: AccountEntry[],
    events: FinancialEvent[],
) {
    const eventMap = new Map(events.map(event => [event.id, event]));
    const openingBalance = previous?.balance ?? current.balance;
    const totals = {
        externalIncome: 0,
        expenses: 0,
        transfers: 0,
        passiveReturn: 0,
        adjustments: 0,
        cashFlow: 0,
    };

    entries.forEach(entry => {
        const type = eventMap.get(entry.eventId)?.type ?? 'LEGACY_MOVEMENT';
        if (type !== 'TRANSFER') totals.cashFlow += entry.amount;
        if (type === 'INCOME') totals.externalIncome += entry.amount;
        else if (type === 'EXPENSE') totals.expenses += entry.amount;
        else if (type === 'TRANSFER') totals.transfers += entry.amount;
        else if (type === 'PASSIVE_RETURN') totals.passiveReturn += entry.amount;
        else totals.adjustments += entry.amount;
    });

    const explainedChange = totals.externalIncome + totals.expenses + totals.transfers
        + totals.passiveReturn + totals.adjustments;
    const balanceChange = previous ? current.balance - previous.balance : 0;
    const unexplained = previous ? balanceChange - explainedChange : 0;

    return { openingBalance, balanceChange, explainedChange, unexplained, ...totals };
}

export function calculateFxEffect(previous: AccountSnapshot | undefined, current: AccountSnapshot): number {
    if (!previous?.usdCopRate || !current.usdCopRate) return 0;
    return previous.balance * (current.usdCopRate - previous.usdCopRate);
}

export function calculateObligationReconciliation(
    current: ObligationSnapshot,
    previous: ObligationSnapshot | undefined,
    entries: ObligationEntry[],
) {
    const openingBalance = previous?.balance ?? current.balance;
    const explained = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const balanceChange = previous ? current.balance - previous.balance : 0;
    return {
        openingBalance,
        explained,
        balanceChange,
        unexplained: previous ? balanceChange - explained : 0,
    };
}
