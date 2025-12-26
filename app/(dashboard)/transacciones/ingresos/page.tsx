
'use client';

import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { IncomeForm } from '@/components/forms/income-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DeleteButton } from '@/components/ui/delete-button';

import { EditButton } from '@/components/ui/edit-button';
import { Income } from '@/lib/db/db';
import { CopyIncomesButton } from '@/components/dashboard/copy-incomes-button';
import { InlineAmount } from '@/components/ui/inline-amount';

export default function IncomesPage() {
    const { periodId } = useActivePeriod();
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Income | null>(null);

    const incomes = useLiveQuery(
        () => db.incomes.where('periodId').equals(periodId).toArray(),
        [periodId]
    );

    const totalIncome = incomes?.reduce((sum, inc) => sum + inc.amount, 0) || 0;

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null); // Reset on close
    };



    // ... (imports)

    const handleEdit = (income: Income) => {
        setEditingItem(income);
        setOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Ingresos ({periodId})</h1>
                <div className="flex gap-2">
                    <CopyIncomesButton />
                    <Dialog open={open} onOpenChange={handleOpenChange}>
                        <DialogTrigger asChild>
                            <Button onClick={() => setEditingItem(null)}><Plus className="mr-2 h-4 w-4" /> Nuevo Ingreso</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingItem ? 'Editar Ingreso' : 'Registrar Ingreso'}</DialogTitle>
                            </DialogHeader>
                            <IncomeForm
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
                        <CardTitle className="text-sm font-medium">Total Ingresos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${totalIncome.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Listado de Ingresos</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Monto</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {incomes?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        No hay ingresos registrados en este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                            {incomes?.map((income) => (


                                // ... (in component)
                                <TableRow key={income.id}>
                                    <TableCell>{income.date}</TableCell>
                                    <TableCell>{income.concept}</TableCell>
                                    <TableCell>
                                        <InlineAmount
                                            value={income.amount}
                                            currency={income.currency}
                                            onSave={async (val) => {
                                                await db.incomes.update(income.id, { amount: val });
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>{income.currency}</TableCell>
                                    <TableCell>{income.isSalary ? 'Salario' : 'Extra'}</TableCell>
                                    <TableCell className="flex gap-1">
                                        <EditButton onClick={() => handleEdit(income)} />
                                        <DeleteButton
                                            onDelete={() => db.incomes.delete(income.id)}
                                            itemName="ingreso"
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
