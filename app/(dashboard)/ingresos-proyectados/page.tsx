'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { ProjectedIncomeForm } from '@/components/forms/projected-income-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { DeleteButton } from '@/components/ui/delete-button';
import { EditButton } from '@/components/ui/edit-button';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { v4 as uuidv4 } from 'uuid';
import { ProjectedIncome } from '@/lib/types';
import { formatMoney } from '@/lib/utils';

function calculateProjectedAmount(item: ProjectedIncome, balance: number) {
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

export default function ProjectedIncomesPage() {
    const { periodId } = useActivePeriod();
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ProjectedIncome | null>(null);
    const [autoCopiedPeriod, setAutoCopiedPeriod] = useState<string | null>(null);
    const copyInProgressRef = useRef(false);

    const projectedIncomes = useLiveQuery(
        () => db.projectedIncomes.where('periodId').equals(periodId).toArray(),
        [periodId]
    );
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
    const snapshots = useLiveQuery(() => db.accountSnapshots.where('periodId').equals(periodId).toArray(), [periodId]) || [];

    const entMap = useMemo(() => new Map(entities.map(e => [e.id, e])), [entities]);
    const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    const snapMap = useMemo(() => new Map(snapshots.map(s => [s.accountId, s])), [snapshots]);

    useEffect(() => {
        if (!periodId) return;
        if (autoCopiedPeriod === periodId) return;
        if (!projectedIncomes) return;

        const copyRecurringFromPrevious = async () => {
            if (copyInProgressRef.current) return;
            copyInProgressRef.current = true;
            try {
            const existingRecurringCount = await db.projectedIncomes
                .where('periodId')
                .equals(periodId)
                .filter(item => item.isRecurring)
                .count();
            if (existingRecurringCount > 0) {
                setAutoCopiedPeriod(periodId);
                return;
            }

            const [yearStr, monthStr] = periodId.split('-');
            let year = parseInt(yearStr);
            let month = parseInt(monthStr);

            let prevMonth = month - 1;
            let prevYear = year;
            if (prevMonth === 0) {
                prevMonth = 12;
                prevYear -= 1;
            }

            const prevPeriodId = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
            const prevItems = await db.projectedIncomes.where('periodId').equals(prevPeriodId).toArray();
            const recurringItems = prevItems.filter(item => item.isRecurring);

            if (recurringItems.length === 0) {
                setAutoCopiedPeriod(periodId);
                return;
            }

            const newItems = recurringItems.map(item => ({
                ...item,
                id: uuidv4(),
                periodId,
                date: `${yearStr}-${monthStr}-${item.date?.split('-')[2] || '01'}`
            }));

            newItems.forEach(item => {
                const d = new Date(item.date || '');
                if (isNaN(d.getTime())) {
                    item.date = `${yearStr}-${monthStr}-01`;
                }
            });

            await db.transaction('rw', db.projectedIncomes, async () => {
                const countInside = await db.projectedIncomes
                    .where('periodId')
                    .equals(periodId)
                    .filter(item => item.isRecurring)
                    .count();
                if (countInside > 0) return;
                if (newItems.length > 0) {
                    await db.projectedIncomes.bulkAdd(newItems);
                }
            });
            setAutoCopiedPeriod(periodId);
            } finally {
                copyInProgressRef.current = false;
            }
        };

        copyRecurringFromPrevious();
    }, [periodId, projectedIncomes, autoCopiedPeriod]);

    const list = projectedIncomes || [];
    const totalProjected = list.reduce((sum, item) => {
        const balance = snapMap.get(item.accountId)?.balance ?? 0;
        return sum + calculateProjectedAmount(item, balance);
    }, 0);

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null);
    };

    const handleEdit = (item: ProjectedIncome) => {
        setEditingItem(item);
        setOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Ingresos Proyectados ({periodId})</h1>
                <div className="flex gap-2">
                    <PeriodSelector />
                    <Button
                        variant="destructive"
                        onClick={async () => {
                            if (!confirm(`Eliminar todos los ingresos proyectados del periodo ${periodId}?`)) return;
                            await db.projectedIncomes.where('periodId').equals(periodId).delete();
                        }}
                    >
                        Borrar Todo
                    </Button>
                    <Dialog open={open} onOpenChange={handleOpenChange}>
                        <DialogTrigger asChild>
                            <Button onClick={() => setEditingItem(null)}>
                                <Plus className="mr-2 h-4 w-4" /> Nuevo Proyectado
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingItem ? 'Editar Ingreso Proyectado' : 'Registrar Ingreso Proyectado'}</DialogTitle>
                            </DialogHeader>
                            <ProjectedIncomeForm
                                onSuccess={() => setOpen(false)}
                                defaultValues={editingItem ? {
                                    ...editingItem,
                                    entityId: editingItem.entityId ?? undefined,
                                    notes: editingItem.notes ?? undefined
                                } : undefined}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Proyectado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${formatMoney(totalProjected)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Listado de Ingresos Proyectados</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Entidad</TableHead>
                                <TableHead>Cuenta</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Tasa</TableHead>
                                <TableHead>Saldo</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                                        No hay ingresos proyectados en este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                            {list.map((item) => {
                                const account = accMap.get(item.accountId);
                                const entityName = item.entityId ? entMap.get(item.entityId)?.name || 'Desconocida' : 'Ninguna';
                                const balance = snapMap.get(item.accountId)?.balance ?? 0;
                                const amount = calculateProjectedAmount(item, balance);
                                const rateLabel = item.type === 'SALARY'
                                    ? '-'
                                    : item.type === 'FIXED_EA'
                                    ? `${item.rateEA ?? 0}% EA`
                                    : `${item.rateMonthly ?? 0}% mes`;
                                const typeLabel = item.type === 'FIXED_EA'
                                    ? 'Tasa Fija'
                                    : item.type === 'VARIABLE_MONTHLY'
                                        ? 'Tasa Variable'
                                        : item.type === 'SALARY'
                                            ? 'Salario'
                                            : 'Ingreso Unico';
                                return (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.date}</TableCell>
                                        <TableCell>{entityName}</TableCell>
                                        <TableCell>{account?.name || 'Sin Cuenta'}</TableCell>
                                        <TableCell>{item.concept}</TableCell>
                                        <TableCell>{typeLabel}</TableCell>
                                        <TableCell>{rateLabel}</TableCell>
                                        <TableCell>{formatMoney(balance, account?.currency || item.currency)}</TableCell>
                                        <TableCell>{formatMoney(amount, item.currency)}</TableCell>
                                        <TableCell>{item.currency}</TableCell>
                                        <TableCell className="flex gap-1">
                                            <EditButton onClick={() => handleEdit(item)} />
                                            <DeleteButton
                                                onDelete={() => db.projectedIncomes.delete(item.id)}
                                                itemName="ingreso proyectado"
                                            />
                                        </TableCell>
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
