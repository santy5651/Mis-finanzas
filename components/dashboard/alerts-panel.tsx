'use client';

import Link from 'next/link';
import { format, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, ChevronRight } from 'lucide-react';
import { db } from '@/lib/db/db';
import { SETTING_KEYS } from '@/lib/db/settings';
import { computeAlerts, withAlertDefaults, type AlertInput } from '@/lib/finance/alerts';
import { planAnnualRate } from '@/lib/finance/assistant';
import { convertToCop } from '@/lib/finance/currency';
import { obligationBalance } from '@/lib/finance/networth';
import { calculateAccountReconciliation } from '@/lib/finance/reconciliation';

/** Alerts are about today, not about the period being browsed. */
async function loadAlertInput(today: Date): Promise<AlertInput> {
    const currentId = format(today, 'yyyy-MM');
    const previousId = format(subMonths(today, 1), 'yyyy-MM');
    const twoBackId = format(subMonths(today, 2), 'yyyy-MM');
    const [accounts, obligations, periods, snapshots, obligationSnapshots, obligationEntries, entries, events, plans, lastBackup] = await Promise.all([
        db.accounts.toArray(),
        db.obligations.filter(item => item.isActive && item.direction === 'PAYABLE' && item.type === 'CREDIT_CARD').toArray(),
        db.periods.bulkGet([currentId, previousId]),
        db.accountSnapshots.where('periodId').anyOf(currentId, previousId, twoBackId).toArray(),
        db.obligationSnapshots.where('periodId').anyOf(currentId, previousId).toArray(),
        db.obligationEntries.where('periodId').equals(currentId).toArray(),
        db.accountEntries.where('periodId').anyOf(currentId, previousId).toArray(),
        db.financialEvents.where('periodId').anyOf(currentId, previousId).toArray(),
        db.accountPlans.where('periodId').anyOf(currentId, previousId).toArray(),
        db.settings.get(SETTING_KEYS.lastBackupAt),
    ]);
    const [currentPeriod, previousPeriod] = periods;
    const byPeriod = <T extends { periodId: string }>(rows: T[], id: string) => rows.filter(row => row.periodId === id);

    const unexplained: AlertInput['unexplained'] = [];
    for (const [periodId, before, period] of [[previousId, twoBackId, previousPeriod], [currentId, previousId, currentPeriod]] as const) {
        if (period?.status === 'CLOSED') continue;
        for (const snapshot of byPeriod(snapshots, periodId)) {
            const account = accounts.find(item => item.id === snapshot.accountId);
            const prior = byPeriod(snapshots, before).find(item => item.accountId === snapshot.accountId);
            if (!account || !prior) continue;
            const { unexplained: amount } = calculateAccountReconciliation(snapshot, prior, byPeriod(entries, periodId).filter(item => item.accountId === account.id), byPeriod(events, periodId));
            unexplained.push({ periodId, accountName: account.name, amountCop: convertToCop(amount, account.currency, period ?? undefined, snapshot) });
        }
    }

    const rateChanges = byPeriod(plans, currentId).flatMap(plan => {
        const before = byPeriod(plans, previousId).find(item => item.accountId === plan.accountId);
        const [previous, current] = [planAnnualRate(before), planAnnualRate(plan)];
        const account = accounts.find(item => item.id === plan.accountId);
        return previous !== null && current !== null && account ? [{ accountName: account.name, previous, current }] : [];
    });

    return {
        today,
        cards: obligations.map(card => ({ card, balance: obligationBalance(card.id, byPeriod(obligationSnapshots, currentId), byPeriod(obligationSnapshots, previousId), obligationEntries) })),
        unexplained,
        previousPeriod: { id: previousId, hasBalances: byPeriod(snapshots, previousId).length > 0, closed: previousPeriod?.status === 'CLOSED' },
        rateChanges,
        lastBackupAt: typeof lastBackup?.value === 'string' ? lastBackup.value : undefined,
    };
}

export function AlertsPanel() {
    const alerts = useLiveQuery(async () => {
        const [input, stored] = await Promise.all([loadAlertInput(new Date()), db.settings.get(SETTING_KEYS.alerts)]);
        return computeAlerts(input, withAlertDefaults(stored?.value));
    });
    if (!alerts?.length) return null;
    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900"><BellRing className="size-4" /> Alertas ({alerts.length})</p>
            <ul className="space-y-1">
                {alerts.map(alert => (
                    <li key={alert.id}>
                        {alert.href
                            ? <Link href={alert.href} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm text-amber-900 hover:bg-amber-100">{alert.text}<ChevronRight className="size-4 shrink-0 opacity-50 group-hover:opacity-100" /></Link>
                            : <span className="px-2 text-sm text-amber-900">{alert.text}</span>}
                    </li>
                ))}
            </ul>
            <p className="mt-2 px-2 text-xs text-amber-800/70">Puedes ajustar o desactivar cada alerta en <Link href="/config" className="underline">Datos y entidades</Link>.</p>
        </div>
    );
}
