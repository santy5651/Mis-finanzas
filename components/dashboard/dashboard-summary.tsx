'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import {
    calculatePeriodSummary,
    calculateProjectedReturn,
    calculateRealReturn,
    toCOP
} from '@/lib/calculations/financials';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { subMonths, parse, format } from 'date-fns';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, PiggyBank, Briefcase } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

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

export function DashboardSummary() {
    const { periodId } = useActivePeriod();
    const [sortKey, setSortKey] = useState<'accountName' | 'entityName' | 'balance' | 'prevBalance' | 'balanceDiff' | 'projected' | 'real' | 'diff' | 'diffPct'>('accountName');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [showReturns, setShowReturns] = useState(true);
    const [expandReturns, setExpandReturns] = useState(false);

    const data = useLiveQuery(async () => {
        if (!periodId) return null;

        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        const prevDate = subMonths(currentDate, 1);
        const prevPrevDate = subMonths(currentDate, 2);
        const prevPeriodId = format(prevDate, 'yyyy-MM');
        const prevPrevPeriodId = format(prevPrevDate, 'yyyy-MM');

        const period = await db.periods.get(periodId);
        const safePeriod = period || { id: periodId, year: currentDate.getFullYear(), month: currentDate.getMonth() + 1, usdCopRate: null };
        const prevPeriod = await db.periods.get(prevPeriodId);
        const safePrevPeriod = prevPeriod || { id: prevPeriodId, year: prevDate.getFullYear(), month: prevDate.getMonth() + 1, usdCopRate: null };

        const [
            accounts,
            snapshots,
            prevSnapshots,
            prevPrevSnapshots,
            incomes,
            prevIncomes,
            expenses,
            prevExpenses,
            debts,
            prevDebts,
            prevPrevDebts,
            entities,
            projectedIncomes,
            prevProjectedIncomes
        ] = await Promise.all([
            db.accounts.filter(a => a.isActive).toArray(),
            db.accountSnapshots.where('periodId').equals(periodId).toArray(),
            db.accountSnapshots.where('periodId').equals(prevPeriodId).toArray(),
            db.accountSnapshots.where('periodId').equals(prevPrevPeriodId).toArray(),
            db.incomes.where('periodId').equals(periodId).toArray(),
            db.incomes.where('periodId').equals(prevPeriodId).toArray(),
            db.expenses.where('periodId').equals(periodId).toArray(),
            db.expenses.where('periodId').equals(prevPeriodId).toArray(),
            db.debts.where('periodId').equals(periodId).toArray(),
            db.debts.where('periodId').equals(prevPeriodId).toArray(),
            db.debts.where('periodId').equals(prevPrevPeriodId).toArray(),
            db.entities.toArray(),
            db.projectedIncomes.where('periodId').equals(periodId).toArray(),
            db.projectedIncomes.where('periodId').equals(prevPeriodId).toArray()
        ]);

        const summary = calculatePeriodSummary(
            safePeriod,
            incomes,
            expenses,
            debts,
            prevDebts,
            accounts,
            snapshots,
            prevSnapshots
        );

        const prevSummary = calculatePeriodSummary(
            safePrevPeriod,
            prevIncomes,
            prevExpenses,
            prevDebts,
            prevPrevDebts,
            accounts,
            prevSnapshots,
            prevPrevSnapshots
        );

        const entityMap = new Map(entities.map(e => [e.id, e.name]));
        const prevSnapMap = new Map(prevSnapshots.map(s => [s.accountId, s]));

        const snapMap = new Map(snapshots.map(s => [s.accountId, s]));
        const rows = snapshots.map(snap => {
            const account = accounts.find(acc => acc.id === snap.accountId);
            if (!account) return null;
            const prev = prevSnapMap.get(snap.accountId);
            const real = calculateRealReturn(snap.balance, prev?.balance).realMonthlyReturn;
            const projected = snap.effectiveAnnualRateProjected
                ? calculateProjectedReturn(snap.balance, snap.effectiveAnnualRateProjected).projectedMonthlyReturn
                : 0;
            const needsTrm = account.currency === 'USD' && !safePeriod.usdCopRate;
            if (needsTrm) {
                return {
                    id: account.id,
                    accountName: account.name,
                    entityName: entityMap.get(account.entityId) || 'Sin Entidad',
                    balance: null,
                    prevBalance: null,
                    balanceDiff: null,
                    real: null,
                    projected: null,
                    diff: null,
                    diffPct: null
                };
            }

            const realCop = toCOP(real, account.currency, safePeriod);
            const projCop = toCOP(projected, account.currency, safePeriod);
            const balanceCop = toCOP(snap.balance, account.currency, safePeriod);
            const prevBalanceCop = toCOP(prev?.balance ?? 0, account.currency, safePeriod);
            const balanceDiff = balanceCop - prevBalanceCop;
            const diff = realCop - projCop;
            const diffPct = projCop !== 0 ? (diff / Math.abs(projCop)) * 100 : null;

            return {
                id: account.id,
                accountName: account.name,
                entityName: entityMap.get(account.entityId) || 'Sin Entidad',
                balance: balanceCop,
                prevBalance: prevBalanceCop,
                balanceDiff,
                real: realCop,
                projected: projCop,
                diff,
                diffPct
            };
        }).filter(Boolean);

        const prevProjectedIncrease = prevSummary.incomeNonSalaryProjected + prevSummary.balance;
        const actualIncreaseThis = summary.capitalTotal - prevSummary.capitalTotal;
        const projectionDelta = actualIncreaseThis - prevProjectedIncrease;
        const projectedIncomeTotal = projectedIncomes.reduce((sum, item) => {
            const account = accounts.find(acc => acc.id === item.accountId);
            const balance = snapMap.get(item.accountId)?.balance ?? 0;
            if (!account) return sum;
            const amount = calculateProjectedIncomeAmount(item, balance);
            return sum + toCOP(amount, account.currency, safePeriod);
        }, 0);
        const prevProjectedIncomeTotal = prevProjectedIncomes.reduce((sum, item) => {
            const account = accounts.find(acc => acc.id === item.accountId);
            const balance = prevSnapMap.get(item.accountId)?.balance ?? 0;
            if (!account) return sum;
            const amount = calculateProjectedIncomeAmount(item, balance);
            return sum + toCOP(amount, account.currency, safePrevPeriod);
        }, 0);

        return {
            summary,
            prevSummary,
            rows,
            prevProjectedIncrease,
            actualIncreaseThis,
            projectionDelta,
            projectedIncomeTotal,
            prevProjectedIncomeTotal
        };
    }, [periodId]);

    const rows = data?.rows || [];
    const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return 0;
        });
        return copy;
    }, [rows, sortKey, sortDir]);

    const toggleSort = (key: typeof sortKey) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sortIndicator = (key: typeof sortKey) => {
        if (sortKey !== key) return '';
        return sortDir === 'asc' ? ' ^' : ' v';
    };

    if (!data) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    const projectedIncomeNet = data.projectedIncomeTotal;
    const projectedCapitalNext = data.summary.capitalTotal + projectedIncomeNet - data.summary.expensesTotal;
    const deltaColor = data.projectionDelta >= 0 ? 'text-green-600' : 'text-red-600';
    const realIncome = data.actualIncreaseThis;
    const balanceFromSnapshots = realIncome - data.summary.expensesTotal;
    const descuadreValue = realIncome - (data.prevProjectedIncomeTotal - data.prevSummary.expensesTotal);
    const descuadreColor = descuadreValue >= 0 ? 'text-green-600' : 'text-red-600';

    return (
        <div className="space-y-8">
            <div className="rounded-xl border bg-muted/20 p-4 md:p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Flujo del Mes</h2>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <SummaryCard
                        title="Ingresos Reales"
                        value={realIncome}
                        icon={TrendingUp}
                        formula="Capital total actual - Capital total anterior"
                        description="Crecimiento real del patrimonio"
                        color="text-green-600"
                    />
                    <SummaryCard
                        title="Ingresos Proyectados"
                        value={projectedIncomeNet}
                        icon={TrendingUp}
                        formula="Suma de ingresos proyectados del mes"
                        description="Ingreso esperado del mes"
                        color="text-blue-600"
                    />
                    <SummaryCard
                        title="Egresos"
                        value={data.summary.expensesTotal}
                        icon={TrendingDown}
                        formula="Suma de egresos registrados del mes"
                        description="Gasto total del mes"
                        color="text-red-600"
                    />
                    <SummaryCard
                        title="Balance (Ahorro)"
                        value={balanceFromSnapshots}
                        icon={Wallet}
                        formula="Ingresos reales - Egresos"
                        description="Resultado neto del mes"
                        color={balanceFromSnapshots >= 0 ? "text-blue-600" : "text-red-600"}
                    />
                    <SummaryCard
                        title="Descuadre"
                        value={descuadreValue}
                        icon={Briefcase}
                        color={descuadreColor}
                        formula="Ingresos reales del mes - (Ingresos proyectados mes anterior - Egresos mes anterior)"
                        description="Positivo: ingresos no reportados. Negativo: egresos no reportados."
                    />
                </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 md:p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Patrimonio</h2>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <SummaryCard
                        title="Capital Total"
                        value={data.summary.capitalTotal}
                        icon={PiggyBank}
                        formula="Activos (segun snapshots) - Deudas netas"
                        description="Valor neto total"
                    />
                    <SummaryCard
                        title="Patrimonio Liquido"
                        value={data.summary.liquidTotal}
                        icon={DollarSign}
                        formula="Suma de saldos en cuentas liquidas"
                        description="Dinero de facil acceso"
                    />
                    <SummaryCard
                        title="Deudas restantes"
                        value={data.summary.debtTotal}
                        icon={CreditCard}
                        formula="Suma de (monto - amortizacion) por deuda"
                        description="Saldo pendiente total"
                        color="text-orange-600"
                    />
                    <SummaryCard
                        title="Delta Capital"
                        value={data.actualIncreaseThis}
                        icon={TrendingUp}
                        formula="Capital total actual - Capital total anterior"
                        description="Variacion del patrimonio"
                        color={data.actualIncreaseThis >= 0 ? "text-green-600" : "text-red-600"}
                    />
                    <SummaryCard
                        title="Capital Proyectado (Mes Siguiente)"
                        value={projectedCapitalNext}
                        icon={TrendingUp}
                        formula="Capital total + Ingresos proyectados - Egresos"
                        description="Capital estimado del proximo mes"
                        color="text-blue-600"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="relative z-20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                            <span
                                className="group relative mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground transition-colors hover:bg-muted/60"
                            >
                                ?
                                <span className="pointer-events-none absolute left-0 top-6 z-50 w-56 rounded-md border bg-background px-2 py-1 text-[10px] text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                    (Delta de capital actual) - (Proyectado mes anterior)
                                </span>
                            </span>
                            Diferencia vs proyeccion anterior
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${deltaColor}`}>
                            ${formatMoney(data.projectionDelta)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Diferencia entre proyeccion previa y resultado real
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Proyectado mes anterior: ${formatMoney(data.prevProjectedIncrease)} | Real este mes: ${formatMoney(data.actualIncreaseThis)}
                        </p>
                    </CardContent>
                </Card>

                {(data.summary.incomeNonSalaryProjected > 0) && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Proyeccion de Rendimientos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-700">
                                ${formatMoney(data.summary.incomeNonSalaryProjected)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Rendimientos estimados del mes actual
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="flex justify-center">
                <Card className="w-full max-w-6xl">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Rendimientos por Cuenta</CardTitle>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setExpandReturns(prev => !prev)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                {expandReturns ? 'Reducir' : 'Maximizar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReturns(prev => !prev)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                {showReturns ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                    </CardHeader>
                    {showReturns && (
                        <CardContent className="pt-0">
                            <div className={`${expandReturns ? 'max-h-none' : 'max-h-[32rem]'} overflow-auto rounded-md border`}>
                                <Table>
                                    <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('accountName')}>
                                                Cuenta{sortIndicator('accountName')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('entityName')}>
                                                Entidad{sortIndicator('entityName')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('balance')}>
                                                Saldo actual (COP){sortIndicator('balance')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('prevBalance')}>
                                                Saldo mes pasado (COP){sortIndicator('prevBalance')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('balanceDiff')}>
                                                Diferencia saldo (COP){sortIndicator('balanceDiff')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('projected')}>
                                                Proyectado (COP){sortIndicator('projected')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('real')}>
                                                Real (COP){sortIndicator('real')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('diff')}>
                                                Diferencia (COP){sortIndicator('diff')}
                                            </button>
                                        </TableHead>
                                        <TableHead className="whitespace-normal">
                                            <button type="button" onClick={() => toggleSort('diffPct')}>
                                                % Dif.{sortIndicator('diffPct')}
                                            </button>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedRows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center text-muted-foreground">
                                                No hay datos de snapshots para comparar.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {sortedRows.map((row) => {
                                        const diffValue = row.diff ?? 0;
                                        const diffColor = diffValue >= 0 ? 'text-green-600' : 'text-red-600';
                                        const balanceDiffValue = row.balanceDiff ?? 0;
                                        const balanceDiffColor = balanceDiffValue >= 0 ? 'text-green-600' : 'text-red-600';
                                        const pct = row.diffPct === null ? '-' : `${row.diffPct.toFixed(1)}%`;
                                        return (
                                            <TableRow key={row.id}>
                                                <TableCell>{row.accountName}</TableCell>
                                                <TableCell>{row.entityName}</TableCell>
                                                <TableCell>{row.balance === null ? 'Sin TRM' : `$${formatMoney(row.balance)}`}</TableCell>
                                                <TableCell>{row.prevBalance === null ? 'Sin TRM' : `$${formatMoney(row.prevBalance)}`}</TableCell>
                                                <TableCell className={balanceDiffColor}>
                                                    {row.balanceDiff === null ? '-' : `$${formatMoney(row.balanceDiff)}`}
                                                </TableCell>
                                                <TableCell>{row.projected === null ? 'Sin TRM' : `$${formatMoney(row.projected)}`}</TableCell>
                                                <TableCell>{row.real === null ? 'Sin TRM' : `$${formatMoney(row.real)}`}</TableCell>
                                                <TableCell className={diffColor}>{row.diff === null ? '-' : `$${formatMoney(row.diff)}`}</TableCell>
                                                <TableCell className={diffColor}>{row.diff === null ? '-' : pct}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    )}
                </Card>
            </div>
        </div>
    );
}

function SummaryCard({
    title,
    value,
    icon: Icon,
    description,
    formula,
    color
}: {
    title: string;
    value: number;
    icon: any;
    description?: string;
    formula?: string;
    color?: string;
}) {
    return (
        <Card className="relative z-20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center text-sm font-medium">
                    {formula && (
                        <span
                            className="group relative mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground transition-colors hover:bg-muted/60"
                        >
                            ?
                            <span className="pointer-events-none absolute left-0 top-6 z-50 w-56 rounded-md border bg-background px-2 py-1 text-[10px] text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                {formula}
                            </span>
                        </span>
                    )}
                    {title}
                </CardTitle>
                <Icon className={`h-4 w-4 text-muted-foreground ${color}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${color}`}>
                    ${formatMoney(value)}
                </div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {description}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
