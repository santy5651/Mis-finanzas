import { differenceInCalendarDays, differenceInCalendarMonths, parse } from 'date-fns';
import type { Expense, FinancialEvent, ObligationEntry } from '@/lib/types';

/** Next date on which a monthly day falls, today included; short months use their last day. */
export function nextMonthlyDate(day: number, today: Date): Date {
    const inMonth = (year: number, month: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
    const thisMonth = inMonth(today.getFullYear(), today.getMonth());
    if (differenceInCalendarDays(thisMonth, today) >= 0) return thisMonth;
    return inMonth(today.getFullYear(), today.getMonth() + 1);
}

export function daysUntil(date: Date, today: Date): number {
    return differenceInCalendarDays(date, today);
}

export interface InstallmentStatus {
    expense: Expense;
    paid: number;
    remaining: number;
    monthly: number;
}

const monthsBetween = (fromPeriodId: string, toPeriodId: string) =>
    differenceInCalendarMonths(parse(toPeriodId, 'yyyy-MM', new Date()), parse(fromPeriodId, 'yyyy-MM', new Date()));

/**
 * Card purchases split in installments, seen from a period. The first installment is billed the
 * month after the purchase; interest is not included, so the monthly figure is a lower bound.
 */
export function installmentPlan(cardExpenses: Expense[], periodId: string): { active: InstallmentStatus[]; dueThisPeriod: number } {
    let dueThisPeriod = 0;
    const active: InstallmentStatus[] = [];
    for (const expense of cardExpenses) {
        const count = Math.max(1, expense.installments);
        const elapsed = monthsBetween(expense.periodId, periodId);
        if (elapsed < 0) continue;
        const monthly = expense.amount / count;
        if (elapsed >= 1 && elapsed <= count) dueThisPeriod += monthly;
        const paid = Math.min(count, elapsed);
        if (count > 1 && paid < count) active.push({ expense, paid, remaining: count - paid, monthly });
    }
    return { active, dueThisPeriod };
}

/** Interest and fees charged to a card in the period, from charges registered with a kind. */
export function cardCharges(obligationId: string, events: FinancialEvent[], entries: ObligationEntry[]): { interest: number; fees: number } {
    const kinds = new Map(events.map(event => [event.id, event.chargeKind]));
    let interest = 0;
    let fees = 0;
    for (const entry of entries) {
        if (entry.obligationId !== obligationId || entry.amount <= 0) continue;
        const kind = kinds.get(entry.eventId);
        if (kind === 'INTEREST') interest += entry.amount;
        else if (kind === 'FEE') fees += entry.amount;
    }
    return { interest, fees };
}

/** Share of the limit in use, or null when no limit is configured. */
export function creditUsage(balance: number, creditLimit?: number): number | null {
    return creditLimit && creditLimit > 0 ? balance / creditLimit : null;
}
