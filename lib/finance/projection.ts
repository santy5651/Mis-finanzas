import { addMonths, format, parse } from 'date-fns';

export interface ProjectionAccount {
    id: string;
    name: string;
    /** Latest balance, already in COP. */
    balance: number;
    behavior: 'INTEREST' | 'MARKET_VALUE';
    restricted: boolean;
    /** Planned effective annual rate for interest accounts; null when the account has no plan. */
    annualRate: number | null;
}

export interface ProjectionInput {
    /** Last period with real balances; the projection starts the month after. */
    fromPeriodId: string;
    accounts: ProjectionAccount[];
    /** Recurring planned income and expenses per month, in COP. */
    monthlyIncome: number;
    monthlyExpenses: number;
    /** Payables minus receivables, kept constant. */
    netLiabilities: number;
    /** Annual inflation as a fraction, for the real value of net worth. */
    inflation: number | null;
}

export interface Scenario {
    /** Shift applied to every planned interest rate, in percentage points (-1 = one point less). */
    rateShiftPoints: number;
    /** Expected annual return of market-value accounts, as a fraction. */
    marketReturn: number;
    includePlannedFlows: boolean;
    /** Simulated annual rate that replaces the plan of every unrestricted interest account, planned or not. */
    interestRateOverride?: number | null;
}

export interface ProjectionMonth {
    periodId: string;
    interestAvailable: number;
    interestRestricted: number;
    marketGain: number;
    netSavings: number;
    netWorth: number;
    realNetWorth: number | null;
    /** Share of planned expenses that available interest pays, or null without planned expenses. */
    coverage: number | null;
}

const monthlyFromAnnual = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/**
 * Effective annual rate an account earns under a scenario, or null when it earns nothing.
 * Restricted accounts (cesantías) keep their own rate: a simulated savings rate does not apply to them.
 * Monthly compounding of this rate gives exactly balance × rate over twelve months.
 */
export function scenarioRate(account: ProjectionAccount, scenario: Scenario): number | null {
    if (account.behavior === 'MARKET_VALUE') return scenario.marketReturn;
    const override = scenario.interestRateOverride;
    const base = override !== undefined && override !== null && !account.restricted ? override : account.annualRate;
    return base === null ? null : Math.max(0, base + scenario.rateShiftPoints / 100);
}

/**
 * Twelve months ahead under explicit assumptions. Interest is reinvested in its own account,
 * market accounts grow at the scenario rate, and planned net savings pile up without return,
 * which keeps the estimate on the conservative side.
 */
export function projectTwelveMonths(input: ProjectionInput, scenario: Scenario): ProjectionMonth[] {
    const balances = new Map(input.accounts.map(account => [account.id, account.balance]));
    const start = parse(input.fromPeriodId, 'yyyy-MM', new Date());
    const netSavings = scenario.includePlannedFlows ? input.monthlyIncome - input.monthlyExpenses : 0;
    let savedCash = 0;

    return Array.from({ length: 12 }, (_, index) => {
        let interestAvailable = 0;
        let interestRestricted = 0;
        let marketGain = 0;
        for (const account of input.accounts) {
            const balance = balances.get(account.id)!;
            const rate = scenarioRate(account, scenario);
            if (account.behavior === 'MARKET_VALUE') {
                const gain = balance * monthlyFromAnnual(rate ?? 0);
                marketGain += gain;
                balances.set(account.id, balance + gain);
                continue;
            }
            if (rate === null) continue;
            const interest = balance * monthlyFromAnnual(rate);
            if (account.restricted) interestRestricted += interest;
            else interestAvailable += interest;
            balances.set(account.id, balance + interest);
        }
        savedCash += netSavings;
        const assets = [...balances.values()].reduce((sum, value) => sum + value, 0) + savedCash;
        const netWorth = assets - input.netLiabilities;
        const months = index + 1;
        return {
            periodId: format(addMonths(start, months), 'yyyy-MM'),
            interestAvailable,
            interestRestricted,
            marketGain,
            netSavings,
            netWorth,
            realNetWorth: input.inflation === null ? null : netWorth / Math.pow(1 + input.inflation, months / 12),
            coverage: input.monthlyExpenses > 0 ? interestAvailable / input.monthlyExpenses : null,
        };
    });
}

/** Balance-weighted planned rate of the unrestricted interest accounts that have a plan, or null when none has. */
export function averagePlannedRate(accounts: ProjectionAccount[]): number | null {
    const planned = accounts.filter(account => account.behavior === 'INTEREST' && !account.restricted && account.annualRate !== null && account.balance > 0);
    const total = planned.reduce((sum, account) => sum + account.balance, 0);
    return total > 0 ? planned.reduce((sum, account) => sum + account.balance * account.annualRate!, 0) / total : null;
}
