'use client';

import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { DashboardSummary } from '@/components/dashboard/dashboard-summary';
import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/utils';

export default function DashboardPage() {
    const { periodId } = useActivePeriod();
    const [usdCopRate, setUsdCopRate] = useState<number | ''>('');

    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);

    useEffect(() => {
        if (period?.usdCopRate) {
            setUsdCopRate(period.usdCopRate);
        } else {
            setUsdCopRate('');
        }
    }, [periodId, period?.usdCopRate]);

    const incomes = useLiveQuery(
        () => db.incomes.where('periodId').equals(periodId).reverse().limit(5).toArray(),
        [periodId]
    ) || [];

    const expenses = useLiveQuery(
        () => db.expenses.where('periodId').equals(periodId).reverse().limit(5).toArray(),
        [periodId]
    ) || [];

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Resumen Mensual</h1>
                    <p className="text-sm text-muted-foreground">
                        Indicadores clave, proyecciones y actividad reciente del periodo.
                    </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                        <span className="text-xs text-muted-foreground">TRM USD/COP</span>
                        <Input
                            type="number"
                            className="w-32 bg-background"
                            value={usdCopRate}
                            onChange={(event) => {
                                const value = event.target.valueAsNumber;
                                setUsdCopRate(Number.isNaN(value) ? '' : value);
                            }}
                        />
                        <Button
                            variant="outline"
                            onClick={async () => {
                                const [yearStr, monthStr] = periodId.split('-');
                                const nextRate = usdCopRate === '' ? null : Number(usdCopRate);
                                await db.periods.put({
                                    id: periodId,
                                    year: parseInt(yearStr),
                                    month: parseInt(monthStr),
                                    usdCopRate: nextRate
                                });
                            }}
                        >
                            Guardar TRM
                        </Button>
                    </div>
                    <PeriodSelector />
                </div>
            </div>

            <DashboardSummary />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Graficos</h2>
                </div>
                <DashboardCharts />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Ingresos Recientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {incomes.map(inc => (
                                <li key={inc.id} className="flex justify-between items-center border-b pb-2">
                                    <span className="font-medium">{inc.concept}</span>
                                    <span className="text-green-600">+${formatMoney(inc.amount, inc.currency)}</span>
                                </li>
                            ))}
                            {incomes.length === 0 && <p className="text-sm text-muted-foreground">No hay registros.</p>}
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Egresos Recientes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {expenses.map(exp => (
                                <li key={exp.id} className="flex justify-between items-center border-b pb-2">
                                    <span className="font-medium">{exp.reason}</span>
                                    <span className="text-red-600">-${formatMoney(exp.amount, exp.currency)}</span>
                                </li>
                            ))}
                            {expenses.length === 0 && <p className="text-sm text-muted-foreground">No hay registros.</p>}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
