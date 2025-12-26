'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { DebtForm } from '@/components/forms/debt-form';
import { Plus, CreditCard } from 'lucide-react';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { DeleteButton } from '@/components/ui/delete-button';
import { InlineAmount } from '@/components/ui/inline-amount';

export default function DebtsPage() {
    const [open, setOpen] = useState(false);
    const { periodId } = useActivePeriod();
    // const periodId = activePeriod?.id;

    // Fetch debts for current period with entity names
    const debts = useLiveQuery(async () => {
        if (!periodId) return [];
        const perDebts = await db.debts.where('periodId').equals(periodId).toArray();
        const entities = await db.entities.toArray();
        const entMap = new Map(entities.map(e => [e.id, e]));

        return perDebts.map(d => ({
            ...d,
            entityName: entMap.get(d.entityId)?.name || 'Desconocido'
        }));
    }, [periodId]) || [];

    const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Obligaciones Mensuales</h1>
                    <p className="text-muted-foreground">
                        Registra lo que debes pagar este mes (Tarjetas, Préstamos, etc.)
                    </p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Deuda
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Registrar Obligación</DialogTitle>
                            <DialogDescription>
                                Agrega una deuda pendiente para este periodo.
                            </DialogDescription>
                        </DialogHeader>
                        <DebtForm onSuccess={() => setOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">
                        Total Deuda del Mes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                        ${totalDebt.toLocaleString()} COP
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {debts.map(debt => (
                    <Card key={debt.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="font-semibold">{debt.entityName}</div>
                            <div className="flex gap-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                                <DeleteButton
                                    onDelete={() => db.debts.delete(debt.id)}
                                    itemName="deuda"
                                />
                            </div>
                        </CardHeader>


                        // ... inside card content
                        <CardContent>
                            <div className="text-xl font-bold flex items-center gap-1">
                                <InlineAmount
                                    value={debt.amount}
                                    onSave={async (val) => {
                                        await db.debts.update(debt.id, { amount: val });
                                    }}
                                    className="text-xl"
                                />
                                <span className="text-xs font-normal text-muted-foreground">{debt.currency}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 capitalize">
                                {debt.debtType.replace(/_/g, ' ').toLowerCase()}
                            </div>
                            {debt.dueDate && (
                                <div className="text-xs text-red-500 mt-2 font-medium">
                                    Vence: {debt.dueDate}
                                </div>
                            )}
                            {debt.notes && (
                                <div className="text-xs text-muted-foreground mt-2 italic">
                                    "{debt.notes}"
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
                {debts.length === 0 && (
                    <div className="col-span-full text-center py-10 text-muted-foreground">
                        No hay deudas registradas para este periodo.
                    </div>
                )}
            </div>
        </div>
    );
}
