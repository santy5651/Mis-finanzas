
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
import { useState } from 'react';
import { DeleteButton } from '@/components/ui/delete-button';

import { EditButton } from '@/components/ui/edit-button';
import { InlineAmount } from '@/components/ui/inline-amount';
import { Expense } from '@/lib/db/db';

export default function ExpensesPage() {
    const { periodId } = useActivePeriod();
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Expense | null>(null);

    const expenses = useLiveQuery(
        () => db.expenses.where('periodId').equals(periodId).toArray(),
        [periodId]
    );

    const totalExpense = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null); // Reset on close
    };

    const handleEdit = (expense: Expense) => {
        setEditingItem(expense);
        setOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Egresos ({periodId})</h1>
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Egresos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${totalExpense.toLocaleString()}
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
                                <TableHead>Razón</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead>Método</TableHead>
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
                                    <TableCell>{expense.method}</TableCell>
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
