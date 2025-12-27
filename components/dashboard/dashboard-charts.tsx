'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import {
    calculateProjectedReturn,
    calculateRealReturn,
    CAPITAL_CATEGORIES,
    LIQUID_CATEGORIES,
    toCOP
} from '@/lib/calculations/financials';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    CartesianGrid,
    Legend,
    ComposedChart
} from 'recharts';
import { format, parse, subMonths } from 'date-fns';
import { formatMoney } from '@/lib/utils';
import type { Account, AccountSnapshot, Debt, Period } from '@/lib/types';

const COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)'
];

function getAccountCategories(account: Account) {
    const legacy = (account as Account & { category?: string }).category;
    return account.categories?.length ? account.categories : (legacy ? [legacy] : []);
}

function getSafePeriod(periodId: string, period: Period | undefined) {
    if (period) return period;
    const date = parse(periodId, 'yyyy-MM', new Date());
    return {
        id: periodId,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        usdCopRate: null
    };
}

function getNetDebtAmount(debt: Debt, period: Period) {
    const amortization = debt.amortizationAmount ?? 0;
    const net = debt.amount - amortization;
    return Math.max(0, toCOP(net, debt.currency, period));
}

function calculateProjectedIncomeAmount(item: any, balance: number) {
    if (item.type === 'SALARY') {
        return item.amount ?? 0;
    }
    if (item.type === 'FIXED_EA') {
        const ea = item.rateEA ?? 0;
        const monthlyRate = Math.pow(1 + (ea / 100), 1 / 12) - 1;
        return balance * monthlyRate;
    }
    const monthly = item.rateMonthly ?? 0;
    return balance * (monthly / 100);
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card className="h-full overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="h-64 overflow-hidden">
                {children}
            </CardContent>
        </Card>
    );
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
            <div className="font-medium">{label}</div>
            {payload.map((entry: any) => (
                <div key={entry.dataKey} className="text-muted-foreground">
                    {entry.name}: ${formatMoney(entry.value ?? 0)}
                </div>
            ))}
        </div>
    );
}

export function DashboardCharts() {
    const { periodId } = useActivePeriod();
    const axisTick = { fill: 'var(--muted-foreground)', fontSize: 10 };
    const yAxisWidth = 72;

    const periodIds = useMemo(() => {
        if (!periodId) return [];
        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        return Array.from({ length: 6 }, (_, index) => {
            const date = subMonths(currentDate, 5 - index);
            return format(date, 'yyyy-MM');
        });
    }, [periodId]);

    const data = useLiveQuery(async () => {
        if (!periodId || periodIds.length === 0) return null;

        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        const prevPeriodId = format(subMonths(currentDate, 1), 'yyyy-MM');

        const [
            accounts,
            snapshots,
            incomes,
            expenses,
            debts,
            projectedIncomes,
            periods,
            entities,
            prevSnapshots
        ] = await Promise.all([
            db.accounts.filter(a => a.isActive).toArray(),
            db.accountSnapshots.where('periodId').anyOf(periodIds).toArray(),
            db.incomes.where('periodId').anyOf(periodIds).toArray(),
            db.expenses.where('periodId').anyOf(periodIds).toArray(),
            db.debts.where('periodId').anyOf(periodIds).toArray(),
            db.projectedIncomes.where('periodId').anyOf(periodIds).toArray(),
            db.periods.where('id').anyOf(periodIds).toArray(),
            db.entities.toArray(),
            db.accountSnapshots.where('periodId').equals(prevPeriodId).toArray()
        ]);

        const periodMap = new Map(periods.map(p => [p.id, p]));
        const entityMap = new Map(entities.map(e => [e.id, e.name]));

        const snapshotsByPeriod = new Map<string, AccountSnapshot[]>();
        snapshots.forEach(snap => {
            const list = snapshotsByPeriod.get(snap.periodId) ?? [];
            list.push(snap);
            snapshotsByPeriod.set(snap.periodId, list);
        });

        const debtsByPeriod = new Map<string, Debt[]>();
        debts.forEach(debt => {
            const list = debtsByPeriod.get(debt.periodId) ?? [];
            list.push(debt);
            debtsByPeriod.set(debt.periodId, list);
        });

        const expensesByPeriod = new Map<string, typeof expenses>();
        expenses.forEach(exp => {
            const list = expensesByPeriod.get(exp.periodId) ?? [];
            list.push(exp);
            expensesByPeriod.set(exp.periodId, list);
        });

        const projectedByPeriod = new Map<string, typeof projectedIncomes>();
        projectedIncomes.forEach(item => {
            const list = projectedByPeriod.get(item.periodId) ?? [];
            list.push(item);
            projectedByPeriod.set(item.periodId, list);
        });

        const getCapitalTotal = (pid: string) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            const snaps = snapshotsByPeriod.get(pid) ?? [];
            const debtsList = debtsByPeriod.get(pid) ?? [];

            let capital = 0;
            snaps.forEach(snap => {
                const account = accounts.find(a => a.id === snap.accountId);
                if (!account) return;
                const val = toCOP(snap.balance, account.currency, period);
                const categories = getAccountCategories(account);
                if (categories.some(category => CAPITAL_CATEGORIES.includes(category))) {
                    capital += val;
                }
            });

            const debtTotal = debtsList.reduce((sum, debt) => sum + getNetDebtAmount(debt, period), 0);
            return capital - debtTotal;
        };

        const getLiquidTotal = (pid: string) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            const snaps = snapshotsByPeriod.get(pid) ?? [];
            let liquid = 0;
            snaps.forEach(snap => {
                const account = accounts.find(a => a.id === snap.accountId);
                if (!account) return;
                const val = toCOP(snap.balance, account.currency, period);
                const categories = getAccountCategories(account);
                if (categories.some(category => LIQUID_CATEGORIES.includes(category))) {
                    liquid += val;
                }
            });
            return liquid;
        };

        const getDebtTotal = (pid: string) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            return (debtsByPeriod.get(pid) ?? []).reduce((sum, debt) => sum + getNetDebtAmount(debt, period), 0);
        };

        const getExpensesTotal = (pid: string) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            return (expensesByPeriod.get(pid) ?? []).reduce((sum, exp) => sum + toCOP(exp.amount, exp.currency, period), 0);
        };

        const getProjectedIncomeTotal = (pid: string) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            const snaps = snapshotsByPeriod.get(pid) ?? [];
            const snapMap = new Map(snaps.map(s => [s.accountId, s]));
            return (projectedByPeriod.get(pid) ?? []).reduce((sum, item) => {
                const account = accounts.find(acc => acc.id === item.accountId);
                if (!account) return sum;
                const balance = snapMap.get(item.accountId)?.balance ?? 0;
                const amount = calculateProjectedIncomeAmount(item, balance);
                return sum + toCOP(amount, account.currency, period);
            }, 0);
        };

        const monthlySeries = periodIds.map((pid, index) => {
            const period = getSafePeriod(pid, periodMap.get(pid));
            const capitalTotal = getCapitalTotal(pid);
            const liquidTotal = getLiquidTotal(pid);
            const debtTotal = getDebtTotal(pid);
            const expensesTotal = getExpensesTotal(pid);
            const projectedIncome = getProjectedIncomeTotal(pid);

            const prevPid = index > 0 ? periodIds[index - 1] : null;
            const prevCapital = prevPid ? getCapitalTotal(prevPid) : capitalTotal;
            const realIncome = capitalTotal - prevCapital;

            return {
                periodId: pid,
                label: format(parse(pid, 'yyyy-MM', new Date()), 'MMM yy'),
                capitalTotal,
                liquidTotal,
                debtTotal,
                expensesTotal,
                realIncome,
                projectedIncome,
                period
            };
        });

        const currentPeriod = getSafePeriod(periodId, periodMap.get(periodId));
        const currentSnapshots = snapshotsByPeriod.get(periodId) ?? [];

        const expensesCurrent = expensesByPeriod.get(periodId) ?? [];
        const expensesByEntity = new Map<string, number>();
        expensesCurrent.forEach(exp => {
            const name = exp.entityId ? entityMap.get(exp.entityId) || 'Sin Entidad' : 'Sin Entidad';
            const prev = expensesByEntity.get(name) ?? 0;
            expensesByEntity.set(name, prev + toCOP(exp.amount, exp.currency, currentPeriod));
        });
        const expensesByEntityData = Array.from(expensesByEntity.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        const returnsByEntity = new Map<string, { projected: number; real: number }>();
        const prevSnapMap = new Map(prevSnapshots.map(s => [s.accountId, s]));
        currentSnapshots.forEach(snap => {
            const account = accounts.find(a => a.id === snap.accountId);
            if (!account) return;
            const name = entityMap.get(account.entityId) || 'Sin Entidad';
            const prev = prevSnapMap.get(snap.accountId);
            const realReturn = calculateRealReturn(snap.balance, prev?.balance).realMonthlyReturn;
            const projectedReturn = snap.effectiveAnnualRateProjected
                ? calculateProjectedReturn(snap.balance, snap.effectiveAnnualRateProjected).projectedMonthlyReturn
                : 0;
            const entry = returnsByEntity.get(name) ?? { projected: 0, real: 0 };
            entry.real += toCOP(realReturn, account.currency, currentPeriod);
            entry.projected += toCOP(projectedReturn, account.currency, currentPeriod);
            returnsByEntity.set(name, entry);
        });
        const returnsByEntityData = Array.from(returnsByEntity.entries()).map(([name, value]) => ({
            name,
            projected: value.projected,
            real: value.real
        }));

        const assetsByAccountType = new Map<string, number>();
        currentSnapshots.forEach(snap => {
            const account = accounts.find(a => a.id === snap.accountId);
            if (!account) return;
            const label = account.accountType || 'Otro';
            const prev = assetsByAccountType.get(label) ?? 0;
            assetsByAccountType.set(label, prev + toCOP(snap.balance, account.currency, currentPeriod));
        });
        const assetsByAccountTypeData = Array.from(assetsByAccountType.entries()).map(([name, value]) => ({
            name,
            value
        }));

        let investShort = 0;
        let investMedium = 0;
        let investLong = 0;
        currentSnapshots.forEach(snap => {
            const account = accounts.find(a => a.id === snap.accountId);
            if (!account) return;
            const value = toCOP(snap.balance, account.currency, currentPeriod);
            const categories = getAccountCategories(account);
            if (categories.includes('INVEST_SHORT')) {
                investShort += value;
            } else if (categories.includes('INVEST_MEDIUM')) {
                investMedium += value;
            } else if (categories.includes('INVEST_LONG')) {
                investLong += value;
            }
        });
        const investmentTermData = [
            { name: 'Bajo Riesgo', value: investShort },
            { name: 'Riesgo Moderado', value: investMedium },
            { name: 'Alto Riesgo', value: investLong }
        ].filter(item => item.value > 0);

        const liquidTotal = getLiquidTotal(periodId);
        const capitalTotal = getCapitalTotal(periodId);
        const liquidVsNon = [
            { name: 'Liquido', value: liquidTotal },
            { name: 'No Liquido', value: Math.max(0, capitalTotal - liquidTotal) }
        ];

        const prevCapital = getCapitalTotal(prevPeriodId);
        const currentCapital = capitalTotal;
        const currentExpenses = getExpensesTotal(periodId);
        const currentProjected = getProjectedIncomeTotal(periodId);

        const waterfallData = [
            { name: 'Capital Anterior', value: prevCapital },
            { name: 'Ingresos Reales', value: currentCapital - prevCapital },
            { name: 'Egresos', value: -currentExpenses },
            { name: 'Capital Actual', value: currentCapital }
        ];

        return {
            monthlySeries,
            expensesByEntityData,
            returnsByEntityData,
            assetsByAccountTypeData,
            investmentTermData,
            liquidVsNon,
            waterfallData
        };
    }, [periodId, periodIds]);

    if (!data) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Capital Total (6 meses)">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={axisTick} minTickGap={16} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Line type="monotone" dataKey="capitalTotal" name="Capital" stroke={COLORS[0]} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Patrimonio Liquido vs Capital Total">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={axisTick} minTickGap={16} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Line type="monotone" dataKey="liquidTotal" name="Liquido" stroke={COLORS[1]} strokeWidth={2} />
                            <Line type="monotone" dataKey="capitalTotal" name="Capital" stroke={COLORS[2]} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Ingresos Reales vs Proyectados">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={axisTick} minTickGap={16} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="realIncome" name="Ingresos Reales" fill={COLORS[0]} />
                            <Line type="monotone" dataKey="projectedIncome" name="Ingresos Proyectados" stroke={COLORS[3]} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Deudas Totales (6 meses)">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={axisTick} minTickGap={16} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="debtTotal" name="Deudas" stroke={COLORS[4]} fill={COLORS[4]} fillOpacity={0.2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Egresos por Entidad (mes actual)">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.expensesByEntityData} margin={{ top: 12, right: 12, left: 8, bottom: 32 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} tickMargin={8} tick={axisTick} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="value" name="Egresos" fill={COLORS[2]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Rendimientos por Entidad (mes actual)">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.returnsByEntityData} margin={{ top: 12, right: 12, left: 8, bottom: 32 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} tickMargin={8} tick={axisTick} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Bar dataKey="projected" name="Proyectado" fill={COLORS[1]} />
                            <Bar dataKey="real" name="Real" fill={COLORS[0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <ChartCard title="Activos por Tipo de Cuenta">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip content={<ChartTooltip />} />
                            <Pie data={data.assetsByAccountTypeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                                {data.assetsByAccountTypeData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Inversion por Riesgo">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip content={<ChartTooltip />} />
                            <Pie data={data.investmentTermData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                                {data.investmentTermData.map((_, index) => (
                                    <Cell key={`cell-term-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Liquido vs No Liquido">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip content={<ChartTooltip />} />
                            <Pie data={data.liquidVsNon} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                                {data.liquidVsNon.map((_, index) => (
                                    <Cell key={`cell-liq-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Balance y Egresos (6 meses)">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={axisTick} minTickGap={16} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Line type="monotone" dataKey="realIncome" name="Ingresos Reales" stroke={COLORS[0]} strokeWidth={2} />
                            <Line type="monotone" dataKey="expensesTotal" name="Egresos" stroke={COLORS[4]} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Waterfall del Mes">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.waterfallData} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={axisTick} />
                            <YAxis width={yAxisWidth} tickFormatter={(value) => `$${formatMoney(value)}`} tick={axisTick} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="value" name="Valor" fill={COLORS[3]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    );
}
