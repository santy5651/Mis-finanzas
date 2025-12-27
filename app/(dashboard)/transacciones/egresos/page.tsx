'use client';

import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { ExpenseForm } from '@/components/forms/expense-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DeleteButton } from '@/components/ui/delete-button';
import { EditButton } from '@/components/ui/edit-button';
import { InlineAmount } from '@/components/ui/inline-amount';
import { Expense } from '@/lib/db/db';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { v4 as uuidv4 } from 'uuid';
import { formatMoney } from '@/lib/utils';

export default function ExpensesPage() {
    const { periodId } = useActivePeriod();
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Expense | null>(null);
    const [autoCopiedPeriod, setAutoCopiedPeriod] = useState<string | null>(null);
    const copyInProgressRef = useRef(false);

    const expenses = useLiveQuery(
        () => db.expenses.where('periodId').equals(periodId).toArray(),
        [periodId]
    );

    useEffect(() => {
        if (!periodId) return;
        if (autoCopiedPeriod === periodId) return;
        if (!expenses) return;

        const copyRecurringFromPrevious = async () => {
            if (copyInProgressRef.current) return;
            copyInProgressRef.current = true;
            try {
                const existingRecurringCount = await db.expenses
                    .where('periodId')
                    .equals(periodId)
                    .filter(exp => exp.isRecurring)
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
                const prevExpenses = await db.expenses.where('periodId').equals(prevPeriodId).toArray();
                const recurringExpenses = prevExpenses.filter(exp => exp.isRecurring);

                if (recurringExpenses.length === 0) {
                    setAutoCopiedPeriod(periodId);
                    return;
                }

                const newExpenses = recurringExpenses.map(exp => ({
                    ...exp,
                    id: uuidv4(),
                    periodId,
                    date: `${yearStr}-${monthStr}-${exp.date?.split('-')[2] || '01'}`,
                }));

                newExpenses.forEach(exp => {
                    const d = new Date(exp.date);
                    if (isNaN(d.getTime())) {
                        exp.date = `${yearStr}-${monthStr}-01`;
                    }
                });

                await db.transaction('rw', db.expenses, async () => {
                    const countInside = await db.expenses
                        .where('periodId')
                        .equals(periodId)
                        .filter(exp => exp.isRecurring)
                        .count();
                    if (countInside > 0) return;
                    if (newExpenses.length > 0) {
                        await db.expenses.bulkAdd(newExpenses);
                    }
                });
                setAutoCopiedPeriod(periodId);
            } finally {
                copyInProgressRef.current = false;
            }
        };

        copyRecurringFromPrevious();
    }, [periodId, expenses, autoCopiedPeriod]);

    const totalExpense = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null);
    };

    const handleEdit = (expense: Expense) => {
        setEditingItem(expense);
        setOpen(true);
    };

    const getMethodLabel = (method: string) => {
        if (method === 'DEBIT') return 'Debito';
        if (method === 'CREDIT_CARD') return 'Tarjeta de Credito';
        if (method === 'CASH') return 'Efectivo';
        if (method === 'TRANSFER') return 'Transferencia';
        return 'Otro';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Egresos ({periodId})</h1>
                <div className="flex gap-2">
                    <PeriodSelector />
                    <Button
                        variant="outline"
                        onClick={async () => {
                            if (!periodId) return;
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
                            const prevExpenses = await db.expenses.where('periodId').equals(prevPeriodId).toArray();

                            if (prevExpenses.length === 0) {
                                alert(`No se encontraron egresos en el periodo anterior (${prevPeriodId}).`);
                                return;
                            }

                            if (!confirm(`Copiar ${prevExpenses.length} egresos del mes ${prevPeriodId}?`)) {
                                return;
                            }

                            const newExpenses = prevExpenses.map(exp => ({
                                ...exp,
                                id: uuidv4(),
                                periodId,
                                date: `${yearStr}-${monthStr}-${exp.date?.split('-')[2] || '01'}`,
                            }));

                            newExpenses.forEach(exp => {
                                const d = new Date(exp.date);
                                if (isNaN(d.getTime())) {
                                    exp.date = `${yearStr}-${monthStr}-01`;
                                }
                            });

                            await db.expenses.bulkAdd(newExpenses);
                        }}
                    >
                        Copiar Mes Anterior
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={async () => {
                            if (!confirm(`Eliminar todos los egresos del periodo ${periodId}?`)) return;
                            await db.expenses.where('periodId').equals(periodId).delete();
                        }}
                    >
                        Borrar Todo
                    </Button>
                    <Dialog open={open} onOpenChange={handleOpenChange}>
                        <DialogTrigger asChild>
                            <Button onClick={() => setEditingItem(null)}><Plus className="mr-2 h-4 w-4" /> Nuevo Egreso</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingItem ? 'Editar Egreso' : 'Registrar Egreso'}</DialogTitle>
                            </DialogHeader>
                            <ExpenseForm
                                onSuccess={() => setOpen(false)}
                                defaultValues={editingItem || undefined}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Egresos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${formatMoney(totalExpense)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Listado de Egresos</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Razon</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead>Metodo</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expenses?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        No hay egresos registrados en este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                            {expenses?.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell>{expense.date}</TableCell>
                                    <TableCell>{expense.reason}</TableCell>
                                    <TableCell>
                                        <InlineAmount
                                            value={expense.amount}
                                            currency={expense.currency}
                                            onSave={async (val) => {
                                                await db.expenses.update(expense.id, { amount: val });
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>{expense.currency}</TableCell>
                                    <TableCell>{getMethodLabel(expense.method)}</TableCell>
                                    <TableCell className="flex gap-1">
                                        <EditButton onClick={() => handleEdit(expense)} />
                                        <DeleteButton
                                            onDelete={() => db.expenses.delete(expense.id)}
                                            itemName="egreso"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
