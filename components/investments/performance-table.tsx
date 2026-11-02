'use client';

import type { Account, AccountEntry, AccountSnapshot, FinancialEvent, Period } from '@/lib/types';
import { convertToCopOrNull } from '@/lib/finance/currency';
import { combinePerformance, monthlyPerformance, realRate, summarizePerformance, type MonthlyPerformance, type PerformanceSummary } from '@/lib/finance/performance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const pct = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${(value * 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** A month in COP, valued at the closing month's rate; months without a rate are dropped. */
function toCop(months: MonthlyPerformance[], account: Account, periods: Map<string, Period>, snapshots: AccountSnapshot[]): MonthlyPerformance[] {
    if (account.currency === 'COP') return months;
    return months.flatMap(month => {
        const snapshot = snapshots.find(item => item.accountId === account.id && item.periodId === month.periodId);
        const rate = convertToCopOrNull(1, 'USD', periods.get(month.periodId), snapshot);
        return rate === null ? [] : [{ ...month, start: month.start * rate, end: month.end * rate, gain: month.gain * rate, netFlows: month.netFlows * rate }];
    });
}

export function buildPerformance(accounts: Account[], periods: Period[], snapshots: AccountSnapshot[], entries: AccountEntry[], events: FinancialEvent[]) {
    const periodMap = new Map(periods.map(period => [period.id, period]));
    const rows = accounts.map(account => {
        const months = monthlyPerformance(account, snapshots, entries, events);
        return { account, months, summary: summarizePerformance(months), copMonths: toCop(months, account, periodMap, snapshots) };
    }).filter(row => row.months.some(month => month.gain !== 0));
    const group = (filter: (account: Account) => boolean) => summarizePerformance(combinePerformance(rows.filter(row => filter(row.account)).map(row => row.copMonths)));
    return {
        rows,
        market: group(account => account.returnBehavior === 'MARKET_VALUE'),
        interest: group(account => account.returnBehavior !== 'MARKET_VALUE'),
        total: group(() => true),
    };
}

export function PerformanceTable({ data, inflation }: { data: ReturnType<typeof buildPerformance>; inflation: { value: number; periodId: string } | null }) {
    const line = (label: string, summary: PerformanceSummary, detail: string, strong = false) => (
        <TableRow key={label} className={strong ? 'bg-slate-50 font-medium' : ''}>
            <TableCell><span className={strong ? 'font-semibold' : 'font-medium'}>{label}</span><span className="block text-xs text-slate-500">{detail}</span></TableCell>
            <TableCell className="text-right tabular-nums">{pct(summary.lastMonth?.rate)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(summary.trailing?.cumulative)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(summary.trailing?.annualized)}</TableCell>
            <TableCell className="text-right tabular-nums">{summary.trailing?.annualized !== null && summary.trailing?.annualized !== undefined && inflation ? pct(realRate(summary.trailing.annualized, inflation.value)) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums text-slate-500">{summary.trailing?.months ?? 0}</TableCell>
        </TableRow>
    );
    return (
        <Card>
            <CardHeader className="border-b">
                <CardTitle>Rentabilidad</CardTitle>
                <CardDescription>
                    Calculada sola con tus saldos y movimientos (método Dietz modificado): los aportes y retiros no cuentan como ganancia, solo los rendimientos clasificados.
                    Las cuentas en USD se miden en dólares, sin el efecto TRM.{inflation ? ` Real = descontando el IPC anual de ${inflation.periodId} (${pct(inflation.value)}).` : ' Ingresa el IPC en el paso 1 del cierre para ver la rentabilidad real.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
                <Table>
                    <TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead className="text-right">Último mes</TableHead><TableHead className="text-right">Últimos 12 meses</TableHead><TableHead className="text-right">Anualizada</TableHead><TableHead className="text-right">Real anual</TableHead><TableHead className="text-right">Meses</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {line('Total', data.total, 'Todas las cuentas con rendimientos, en COP', true)}
                        {line('Inversiones de mercado', data.market, 'Fondos y brókeres')}
                        {line('Cuentas que pagan intereses', data.interest, 'Ahorros, bolsillos y cesantías')}
                        {data.rows.map(row => line(row.account.name, row.summary, `${row.account.returnBehavior === 'MARKET_VALUE' ? 'Valor de mercado' : 'Intereses'} · ${row.account.currency}${row.account.isRestricted ? ' · restringida' : ''}`))}
                        {data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Aún no hay meses con rendimientos registrados.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
