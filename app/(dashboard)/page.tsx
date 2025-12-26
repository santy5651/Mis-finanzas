'use client';

import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { DashboardSummary } from '@/components/dashboard/dashboard-summary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';

export default function DashboardPage() {
    const { periodId } = useActivePeriod();

    const incomes = useLiveQuery(
        () => db.incomes.where('periodId').equals(periodId).reverse().limit(5).toArray(),
        [periodId]
    ) || [];

    const expenses = useLiveQuery(
        () => db.expenses.where('periodId').equals(periodId).reverse().limit(5).toArray(),
        [periodId]
    ) || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Resumen Mensual</h1>
                <PeriodSelector />
            </div>

            <DashboardSummary />

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
                                    <span className="text-green-600">+${inc.amount.toLocaleString()}</span>
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
                                    <span className="text-red-600">-${exp.amount.toLocaleString()}</span>
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
