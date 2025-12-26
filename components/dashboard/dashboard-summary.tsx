'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { calculatePeriodSummary, PeriodSummary } from '@/lib/calculations/financials';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { subMonths, parse, format } from 'date-fns';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, PiggyBank, Briefcase } from 'lucide-react';

export function DashboardSummary() {
    const { periodId } = useActivePeriod();

    const data = useLiveQuery(async () => {
        if (!periodId) return null;

        // 1. Calculate Previous Period ID (YYYY-MM)
        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        const prevDate = subMonths(currentDate, 1);
        const prevPeriodId = format(prevDate, 'yyyy-MM');

        // 2. Fetch Period Data (TRM)
        const period = await db.periods.get(periodId);
        // Fallback for period if not created explicitly yet (using default/mock)
        const safePeriod = period || { id: periodId, year: currentDate.getFullYear(), month: currentDate.getMonth() + 1, usdCopRate: null };

        // 3. Parallel Fetches
        const [
            accounts,
            snapshots,
            prevSnapshots,
            incomes,
            expenses,
            debts
        ] = await Promise.all([
            db.accounts.filter(a => a.isActive).toArray(),
            db.accountSnapshots.where('periodId').equals(periodId).toArray(),
            db.accountSnapshots.where('periodId').equals(prevPeriodId).toArray(),
            db.incomes.where('periodId').equals(periodId).toArray(),
            db.expenses.where('periodId').equals(periodId).toArray(),
            db.debts.where('periodId').equals(periodId).toArray()
        ]);

        // 4. Calculate Summary
        const summary = calculatePeriodSummary(
            safePeriod,
            incomes,
            expenses,
            debts,
            accounts,
            snapshots,
            prevSnapshots
        );

        return summary;
    }, [periodId]);

    if (!data) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* INGRESOS */}
                <SummaryCard
                    title="Ingresos Totales"
                    value={data.incomeTotal}
                    icon={TrendingUp}
                    description={`Salario: $${data.incomeSalary.toLocaleString()} | Otros: $${data.incomeNonSalaryReal.toLocaleString()}`}
                    color="text-green-600"
                />

                {/* EGRESOS */}
                <SummaryCard
                    title="Egresos Totales"
                    value={data.expensesTotal}
                    icon={TrendingDown}
                    color="text-red-600"
                />

                {/* BALANCE */}
                <SummaryCard
                    title="Balance (Ahorro)"
                    value={data.balance}
                    icon={Wallet}
                    description={`Sin Salario: $${data.balanceWithoutSalary.toLocaleString()}`}
                    color={data.balance >= 0 ? "text-blue-600" : "text-red-600"}
                />

                {/* DEUDA */}
                <SummaryCard
                    title="Deuda del Mes"
                    value={data.debtTotal}
                    icon={CreditCard}
                    color="text-orange-600"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {/* LIQUIDO */}
                <SummaryCard
                    title="Patrimonio Líquido"
                    value={data.liquidTotal}
                    icon={DollarSign}
                    description="Efectivo + Cuentas diarias"
                />

                {/* CAPITAL */}
                <SummaryCard
                    title="Capital Total"
                    value={data.capitalTotal}
                    icon={PiggyBank}
                    description="Total Activos (Líquido + Inversiones)"
                />

                {/* GASTOS NO ESPECIFICADOS */}
                <SummaryCard
                    title="Fuga / No Especificado"
                    value={data.unspecifiedExpense}
                    icon={Briefcase}
                    color="text-gray-500"
                    description="Diferencia flujo vs stock"
                />
            </div>

            {/* PROJECTIONS PREVIEW */}
            {(data.incomeNonSalaryProjected > 0) && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        Proyección Rendimientos este mes:
                        <span className="font-bold text-lg ml-2">
                            ${data.incomeNonSalaryProjected.toLocaleString()}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, description, color }: { title: string, value: number, icon: any, description?: string, color?: string }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {title}
                </CardTitle>
                <Icon className={`h-4 w-4 text-muted-foreground ${color}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${color}`}>
                    ${value.toLocaleString()}
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
