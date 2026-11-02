import { format, parse, subMonths } from 'date-fns';
import type { Account, AccountEntry, AccountSnapshot, FinancialEvent, Income, Obligation, ObligationEntry, ObligationSnapshot, Period } from '@/lib/types';
import { convertToCop } from './currency';
import { computeNetWorth } from './networth';
import { resolveReturnKind } from './returns';

export interface TaxYearInput {
    year: number;
    accounts: Account[];
    obligations: Obligation[];
    periods: Period[];
    snapshots: AccountSnapshot[];
    obligationSnapshots: ObligationSnapshot[];
    entries: AccountEntry[];
    obligationEntries: ObligationEntry[];
    events: FinancialEvent[];
    /** Legacy income rows: events migrated from them have no account entries. */
    incomes: Income[];
}

export interface TaxAsset {
    name: string;
    currency: Account['currency'];
    native: number;
    cop: number | null;
    estimated: boolean;
    restricted: boolean;
}

export interface TaxReport {
    year: number;
    closingPeriodId: string;
    closingIsClosed: boolean;
    assets: TaxAsset[];
    receivables: number;
    grossWealth: number;
    debts: number;
    netWealth: number;
    missingRate: string[];
    laborIncome: number;
    otherIncome: number;
    interest: number;
    dividends: number;
    realizedGains: number;
    /** Returns credited to restricted accounts (cesantías); reported apart because their tax treatment differs. */
    restrictedReturns: number;
    /** Valuation changes: they move wealth but are not income of the year. */
    unrealized: number;
    cardPurchases: number;
    /** Every amount that entered an account, the closest proxy to "consignaciones". */
    deposits: number;
    foreignCurrencyAssets: number;
}

const inYear = (periodId: string, year: number) => periodId.startsWith(`${year}-`);

/**
 * Figures for the income tax return of one taxable year, taken from what the app already records.
 * Wealth is the balance at the December close, or the latest close of a year still in progress
 * (estimated when a balance is missing); flows add up
 * the twelve periods. It is a worksheet, not a tax calculation.
 */
export function computeTaxReport(input: TaxYearInput): TaxReport {
    const { year } = input;
    // A year still in progress has no December: use its latest balances and say so.
    const closingPeriodId = input.snapshots.some(item => item.periodId === `${year}-12`)
        ? `${year}-12`
        : input.snapshots.map(item => item.periodId).filter(id => inYear(id, year)).sort().at(-1) ?? `${year}-12`;
    const previousPeriodId = format(subMonths(parse(closingPeriodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
    const period = input.periods.find(item => item.id === closingPeriodId);
    const wealth = computeNetWorth({
        period,
        accounts: input.accounts,
        snapshots: input.snapshots.filter(item => item.periodId === closingPeriodId),
        previousSnapshots: input.snapshots.filter(item => item.periodId === previousPeriodId),
        entries: input.entries.filter(item => item.periodId === closingPeriodId),
        obligations: input.obligations,
        obligationSnapshots: input.obligationSnapshots.filter(item => item.periodId === closingPeriodId),
        previousObligationSnapshots: input.obligationSnapshots.filter(item => item.periodId === previousPeriodId),
        obligationEntries: input.obligationEntries.filter(item => item.periodId === closingPeriodId),
    });

    const periods = new Map(input.periods.map(item => [item.id, item]));
    const accounts = new Map(input.accounts.map(item => [item.id, item]));
    const events = new Map(input.events.map(item => [item.id, item]));
    const cards = new Set(input.obligations.filter(item => item.type === 'CREDIT_CARD').map(item => item.id));
    const toCop = (amount: number, currency: Account['currency'], periodId: string) => convertToCop(amount, currency, periods.get(periodId));

    const totals = { laborIncome: 0, otherIncome: 0, interest: 0, dividends: 0, realizedGains: 0, restrictedReturns: 0, unrealized: 0, cardPurchases: 0, deposits: 0 };
    const eventsWithEntries = new Set<string>();
    for (const entry of input.entries.filter(item => inYear(item.periodId, year))) {
        eventsWithEntries.add(entry.eventId);
        const event = events.get(entry.eventId);
        const value = toCop(entry.amount, entry.currency, entry.periodId);
        if (value > 0) totals.deposits += value;
        if (event?.type === 'INCOME') {
            if (event.incomeKind === 'SALARY') totals.laborIncome += value;
            else totals.otherIncome += value;
        } else if (event?.type === 'PASSIVE_RETURN') {
            const account = accounts.get(entry.accountId);
            const kind = resolveReturnKind(event, account);
            if (kind === 'UNREALIZED_VALUATION') totals.unrealized += value;
            else if (account?.isRestricted) totals.restrictedReturns += value;
            else if (kind === 'INTEREST' || kind === 'OTHER') totals.interest += value;
            else if (kind === 'DIVIDEND') totals.dividends += value;
            else if (kind === 'REALIZED_GAIN') totals.realizedGains += value;
        }
    }
    for (const income of input.incomes.filter(item => inYear(item.periodId, year))) {
        const migrated = input.events.find(event => event.incomeId === income.id);
        if (migrated && eventsWithEntries.has(migrated.id)) continue;
        const value = toCop(income.amount, income.currency, income.periodId);
        if (income.isSalary) totals.laborIncome += value;
        else totals.otherIncome += value;
    }
    for (const entry of input.obligationEntries.filter(item => inYear(item.periodId, year) && cards.has(item.obligationId) && item.amount > 0)) {
        const event = events.get(entry.eventId);
        if (event?.type === 'EXPENSE' && event.chargeKind !== 'INTEREST' && event.chargeKind !== 'FEE') {
            totals.cardPurchases += toCop(entry.amount, entry.currency, entry.periodId);
        }
    }

    const grossWealth = wealth.assets + wealth.receivables;
    return {
        year,
        closingPeriodId,
        closingIsClosed: period?.status === 'CLOSED',
        assets: wealth.accountValues.map(item => ({ name: item.account.name, currency: item.account.currency, native: item.native, cop: item.cop, estimated: item.estimated, restricted: Boolean(item.account.isRestricted) })),
        receivables: wealth.receivables,
        grossWealth,
        debts: wealth.payables,
        netWealth: grossWealth - wealth.payables,
        missingRate: wealth.missingRate,
        ...totals,
        foreignCurrencyAssets: wealth.accountValues.filter(item => item.account.currency === 'USD').reduce((sum, item) => sum + (item.cop ?? 0), 0),
    };
}

export interface FilingCheck {
    label: string;
    value: number;
    limitUvt: number;
    limit: number;
    exceeded: boolean;
}

/** Thresholds that oblige a resident individual to file, expressed in UVT of the taxable year. */
export function filingChecks(report: TaxReport, uvt: number): FilingCheck[] {
    const rows: Array<[string, number, number]> = [
        ['Patrimonio bruto al 31 de diciembre', report.grossWealth, 4_500],
        ['Ingresos brutos del año', report.laborIncome + report.otherIncome + report.interest + report.dividends + report.realizedGains + report.restrictedReturns, 1_400],
        ['Consumos con tarjeta de crédito', report.cardPurchases, 1_400],
        ['Consignaciones e inversiones (aproximado)', report.deposits, 1_400],
    ];
    return rows.map(([label, value, limitUvt]) => ({ label, value, limitUvt, limit: limitUvt * uvt, exceeded: value > limitUvt * uvt }));
}

/** Part of financial interest that is not taxable income, given the yearly percentage the DIAN publishes. */
export function inflationaryComponent(interest: number, percent: number): number {
    return interest * Math.min(100, Math.max(0, percent)) / 100;
}
