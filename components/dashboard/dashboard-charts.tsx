'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { db } from '@/lib/db/db';
import type { Currency, Period } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

function convert(amount: number, currency: Currency, period?: Period, capturedRate?: number): number | null {
    if (currency === 'COP') return amount;
    const rate = capturedRate ?? period?.usdCopRate;
    return rate ? amount * rate : null;
}

function shortMoney(value: number): string {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} mil M`;
    if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(0)} M`;
    if (absolute >= 1_000) return `${(value / 1_000).toFixed(0)} mil`;
    return value.toFixed(0);
}

export function DashboardCharts() {
    const chartData = useLiveQuery(async () => {
        const [periods, accounts, snapshots, obligations, obligationSnapshots, expenses] = await Promise.all([
            db.periods.toArray(),
            db.accounts.toArray(),
            db.accountSnapshots.toArray(),
            db.obligations.toArray(),
            db.obligationSnapshots.toArray(),
            db.expenses.toArray(),
        ]);
        const periodMap = new Map(periods.map(period => [period.id, period]));
        const accountMap = new Map(accounts.map(account => [account.id, account]));
        const periodIds = new Set([
            ...snapshots.map(snapshot => snapshot.periodId),
            ...expenses.map(expense => expense.periodId),
            ...obligationSnapshots.map(snapshot => snapshot.periodId),
        ]);

        return [...periodIds]
            .sort()
            .slice(-12)
            .map(periodId => {
                const parsedDate = parse(periodId, 'yyyy-MM', new Date());
                const period = periodMap.get(periodId);
                const assets = snapshots
                    .filter(snapshot => snapshot.periodId === periodId)
                    .reduce((total, snapshot) => {
                        const account = accountMap.get(snapshot.accountId);
                        if (!account) return total;
                        return total + (convert(snapshot.balance, account.currency, period, snapshot.usdCopRate) ?? 0);
                    }, 0);
                const obligationTotals = obligationSnapshots
                    .filter(item => item.periodId === periodId)
                    .reduce((total, snapshot) => {
                        const obligation = obligations.find(item => item.id === snapshot.obligationId);
                        if (!obligation) return total;
                        const value = convert(snapshot.balance, obligation.currency, period, snapshot.usdCopRate) ?? 0;
                        return total + (obligation.direction === 'RECEIVABLE' ? value : -value);
                    }, 0);
                const expense = expenses
                    .filter(item => item.periodId === periodId)
                    .reduce((total, item) => total + (convert(item.amount, item.currency, period) ?? 0), 0);
                return {
                    periodId,
                    label: format(parsedDate, 'MMM yy', { locale: es }),
                    patrimonio: assets + obligationTotals,
                    gastos: expense,
                };
            });
    }, []);

    if (!chartData || chartData.length === 0) return null;

    return (
        <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
                <CardHeader>
                    <CardTitle>Evolución del patrimonio</CardTitle>
                    <CardDescription>Saldos históricos menos deuda pendiente.</CardDescription>
                </CardHeader>
                <CardContent className="h-72 pl-1 sm:pl-3">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="patrimonioFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                                    <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis tickFormatter={shortMoney} tickLine={false} axisLine={false} width={58} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip formatter={value => [formatCurrency(Number(value)), 'Patrimonio']} labelFormatter={label => String(label).toUpperCase()} />
                            <Area type="monotone" dataKey="patrimonio" stroke="#059669" strokeWidth={2.5} fill="url(#patrimonioFill)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="xl:col-span-2">
                <CardHeader>
                    <CardTitle>Gastos por mes</CardTitle>
                    <CardDescription>Total de egresos registrados.</CardDescription>
                </CardHeader>
                <CardContent className="h-72 pl-1 sm:pl-3">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis tickFormatter={shortMoney} tickLine={false} axisLine={false} width={58} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip formatter={value => [formatCurrency(Number(value)), 'Gastos']} labelFormatter={label => String(label).toUpperCase()} />
                            <Bar dataKey="gastos" fill="#f43f5e" radius={[5, 5, 0, 0]} maxBarSize={38} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
