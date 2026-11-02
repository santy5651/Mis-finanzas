import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Obligation } from '@/lib/types';
import { creditUsage, daysUntil, nextMonthlyDate } from './cards';

export interface AlertSettings {
    cardDue: { enabled: boolean; days: number };
    cardUsage: { enabled: boolean; percent: number };
    unexplained: { enabled: boolean; amount: number };
    openPreviousMonth: { enabled: boolean; day: number };
    rateDrop: { enabled: boolean; points: number };
    backup: { enabled: boolean; days: number };
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
    cardDue: { enabled: true, days: 5 },
    cardUsage: { enabled: true, percent: 50 },
    unexplained: { enabled: true, amount: 500_000 },
    openPreviousMonth: { enabled: true, day: 10 },
    rateDrop: { enabled: true, points: 0.5 },
    backup: { enabled: true, days: 35 },
};

/** Stored settings may predate a rule; every missing piece falls back to its default. */
export function withAlertDefaults(stored: unknown): AlertSettings {
    const value = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof AlertSettings, object>>;
    return Object.fromEntries(Object.entries(DEFAULT_ALERT_SETTINGS).map(([key, defaults]) => [
        key,
        { ...defaults, ...(value[key as keyof AlertSettings] ?? {}) },
    ])) as unknown as AlertSettings;
}

export interface AlertInput {
    today: Date;
    cards: Array<{ card: Obligation; balance: number }>;
    /** Unexplained differences of open periods, already in COP. */
    unexplained: Array<{ periodId: string; accountName: string; amountCop: number }>;
    previousPeriod?: { id: string; hasBalances: boolean; closed: boolean };
    rateChanges: Array<{ accountName: string; previous: number; current: number }>;
    lastBackupAt?: string;
}

export interface AppAlert {
    id: string;
    text: string;
    href?: string;
}

const percent = (value: number) => `${(value * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`;
const money = (value: number) => `$${Math.round(value).toLocaleString('es-CO')}`;

export function computeAlerts(input: AlertInput, settings: AlertSettings): AppAlert[] {
    const alerts: AppAlert[] = [];
    for (const { card, balance } of input.cards) {
        if (settings.cardDue.enabled && card.dueDay && balance > 0) {
            const due = nextMonthlyDate(card.dueDay, input.today);
            const days = daysUntil(due, input.today);
            if (days <= settings.cardDue.days) {
                alerts.push({ id: `card-due-${card.id}`, href: '/obligaciones', text: `${card.name}: el pago vence ${days === 0 ? 'hoy' : `en ${days} día(s)`} (${format(due, "d 'de' MMMM", { locale: es })}). Saldo ${money(balance)}.` });
            }
        }
        const usage = creditUsage(balance, card.creditLimit);
        if (settings.cardUsage.enabled && usage !== null && usage * 100 >= settings.cardUsage.percent) {
            alerts.push({ id: `card-usage-${card.id}`, href: '/obligaciones', text: `${card.name} usa el ${Math.round(usage * 100)}% del cupo.` });
        }
    }
    if (settings.unexplained.enabled) {
        for (const item of input.unexplained.filter(row => Math.abs(row.amountCop) >= settings.unexplained.amount)) {
            alerts.push({ id: `unexplained-${item.periodId}-${item.accountName}`, href: `/cierre?period=${item.periodId}`, text: `${item.accountName} tiene ${money(item.amountCop)} sin explicar en ${item.periodId}.` });
        }
    }
    const previous = input.previousPeriod;
    if (settings.openPreviousMonth.enabled && previous?.hasBalances && !previous.closed && input.today.getDate() >= settings.openPreviousMonth.day) {
        alerts.push({ id: `open-${previous.id}`, href: `/cierre?period=${previous.id}`, text: `El mes ${previous.id} sigue abierto. Ciérralo para congelar saldos y TRM.` });
    }
    if (settings.rateDrop.enabled) {
        for (const change of input.rateChanges.filter(item => (item.previous - item.current) * 100 >= settings.rateDrop.points)) {
            alerts.push({ id: `rate-${change.accountName}`, href: '/ingresos-proyectados', text: `La tasa de ${change.accountName} bajó de ${percent(change.previous)} a ${percent(change.current)} E.A.` });
        }
    }
    if (settings.backup.enabled) {
        const age = input.lastBackupAt ? differenceInCalendarDays(input.today, parseISO(input.lastBackupAt)) : null;
        if (age === null || age >= settings.backup.days) {
            alerts.push({ id: 'backup', href: '/config', text: age === null ? 'No hay registro de un respaldo descargado. Descarga uno desde Datos y entidades.' : `Tu último respaldo tiene ${age} días.` });
        }
    }
    return alerts;
}
