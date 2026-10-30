import { format } from 'date-fns';

/** Local-time date clamped to the period: today inside it, the last day for past periods, the first for future ones. */
export function dateInsidePeriod(periodId: string, today: Date = new Date()): string {
    const todayId = format(today, 'yyyy-MM-dd');
    if (todayId.startsWith(periodId)) return todayId;
    if (periodId > todayId.slice(0, 7)) return `${periodId}-01`;
    const [year, month] = periodId.split('-').map(Number);
    return `${periodId}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

/** Parses a user-typed amount; blank or invalid input yields null instead of 0. */
export function parseAmountInput(raw: string | undefined): number | null {
    if (raw === undefined || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
