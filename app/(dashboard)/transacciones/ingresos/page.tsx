'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parse, subMonths } from 'date-fns';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { db } from '@/lib/db/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { formatMoney } from '@/lib/utils';
import { toCOP } from '@/lib/calculations/financials';

export default function IncomesPage() {
    const { periodId } = useActivePeriod();

    const accounts = useLiveQuery(() => db.accounts.filter(a => a.isActive).toArray()) || [];
    const entities = useLiveQuery(() => db.entities.toArray()) || [];

    const prevPeriodId = useMemo(() => {
        if (!periodId) return null;
        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        return format(subMonths(currentDate, 1), 'yyyy-MM');
    }, [periodId]);

    const snapshots = useLiveQuery(() => {
        if (!periodId || !prevPeriodId) return [];
        return db.accountSnapshots.where('periodId').anyOf([periodId, prevPeriodId]).toArray();
    }, [periodId, prevPeriodId]) || [];

    const movements = useLiveQuery(() => {
        if (!periodId) return [];
        return db.accountMovements.where('periodId').equals(periodId).toArray();
    }, [periodId]) || [];

    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const safePeriod = period || { id: periodId, year: 0, month: 0, usdCopRate: null };

    const calculatedRows = useMemo(() => {
        if (!periodId || !prevPeriodId) return [];
        const entityMap = new Map(entities.map(e => [e.id, e.name]));
        const snapshotMap = new Map(snapshots.filter(s => s.periodId === periodId).map(s => [s.accountId, s]));
        const prevSnapshotMap = new Map(snapshots.filter(s => s.periodId === prevPeriodId).map(s => [s.accountId, s]));
        const movementTotals = new Map<string, number>();

        movements.forEach(movement => {
            const sign = (movement.type === 'DEPOSIT' || movement.type === 'TRANSFER_IN') ? 1 : -1;
            const prev = movementTotals.get(movement.accountId) ?? 0;
            movementTotals.set(movement.accountId, prev + (sign * movement.amount));
        });

        return accounts.map(account => {
            const currentSnap = snapshotMap.get(account.id);
            const prevSnap = prevSnapshotMap.get(account.id);
            if (!currentSnap || !prevSnap) return null;
            const netFlow = movementTotals.get(account.id) ?? 0;
            const adjustedReturn = (currentSnap.balance - prevSnap.balance) - netFlow;
            if (adjustedReturn === 0) return null;
            return {
                accountId: account.id,
                accountName: account.name,
                entityName: entityMap.get(account.entityId) || 'Sin Entidad',
                currency: account.currency,
                amount: adjustedReturn
            };
        }).filter(Boolean) as Array<{
            accountId: string;
            accountName: string;
            entityName: string;
            currency: 'COP' | 'USD';
            amount: number;
        }>;
    }, [accounts, entities, movements, periodId, prevPeriodId, snapshots]);

    const totalCalculated = calculatedRows.reduce((sum, row) => {
        return sum + toCOP(row.amount, row.currency, safePeriod);
    }, 0);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Ingresos ({periodId})</h1>
                <PeriodSelector />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ingresos Calculados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${formatMoney(totalCalculated)} COP
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Calculados con la diferencia entre el mes anterior y el mes actual.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Ingresos Calculados</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cuenta</TableHead>
                                <TableHead>Entidad</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Moneda</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedRows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                                        No hay ingresos calculados para este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                            {calculatedRows.map((row) => {
                                const amountColor = row.amount >= 0 ? 'text-green-600' : 'text-red-600';
                                return (
                                    <TableRow key={row.accountId}>
                                        <TableCell>{row.accountName}</TableCell>
                                        <TableCell>{row.entityName}</TableCell>
                                        <TableCell className={amountColor}>
                                            ${formatMoney(row.amount, row.currency)}
                                        </TableCell>
                                        <TableCell>{row.currency}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
