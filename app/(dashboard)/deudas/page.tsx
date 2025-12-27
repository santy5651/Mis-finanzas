'use client';

import { useEffect, useRef, useState } from 'react';
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
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Input } from '@/components/ui/input';
import { v4 as uuidv4 } from 'uuid';
import { formatMoney } from '@/lib/utils';

export default function DebtsPage() {
    const [open, setOpen] = useState(false);
    const { periodId } = useActivePeriod();
    const [autoCopiedPeriod, setAutoCopiedPeriod] = useState<string | null>(null);
    const copyInProgressRef = useRef(false);
    const [amortizeOpen, setAmortizeOpen] = useState(false);
    const [amortizeTargetId, setAmortizeTargetId] = useState<string | null>(null);
    const [amortizeValue, setAmortizeValue] = useState(0);
    const [amortizeNote, setAmortizeNote] = useState('');
    const [increaseOpen, setIncreaseOpen] = useState(false);
    const [increaseTargetId, setIncreaseTargetId] = useState<string | null>(null);
    const [increaseValue, setIncreaseValue] = useState(0);
    const [increaseNote, setIncreaseNote] = useState('');
    const [openHistoryIds, setOpenHistoryIds] = useState<string[]>([]);

    const debts = useLiveQuery(async () => {
        if (!periodId) return [];
        const perDebts = await db.debts.where('periodId').equals(periodId).toArray();
        const entities = await db.entities.toArray();
        const entMap = new Map(entities.map(e => [e.id, e]));

        return perDebts.map(d => ({
            ...d,
            entityName: entMap.get(d.entityId)?.name || 'Desconocido'
        }));
    }, [periodId]);

    useEffect(() => {
        if (!periodId) return;
        if (autoCopiedPeriod === periodId) return;
        if (!debts) return;

        const copyFromPrevious = async () => {
            if (copyInProgressRef.current) return;
            copyInProgressRef.current = true;
            try {
                const existingCount = await db.debts.where('periodId').equals(periodId).count();
                if (existingCount > 0) {
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
                const prevDebts = await db.debts.where('periodId').equals(prevPeriodId).toArray();

                if (prevDebts.length === 0) {
                    setAutoCopiedPeriod(periodId);
                    return;
                }

                const newDebts = prevDebts
                    .map(debt => {
                        const amortization = debt.amortizationAmount ?? 0;
                        const netAmount = Math.max(0, debt.amount - amortization);
                        if (netAmount === 0) return null;
                        return {
                            ...debt,
                            id: uuidv4(),
                            seriesId: debt.seriesId ?? debt.id,
                            periodId,
                            amount: netAmount,
                            amortizationAmount: 0,
                            increaseAmount: 0,
                            dueDay: debt.dueDay,
                            notes: debt.notes || undefined,
                            history: []
                        };
                    })
                    .filter(Boolean);

                await db.transaction('rw', db.debts, async () => {
                    const countInside = await db.debts.where('periodId').equals(periodId).count();
                    if (countInside > 0) return;
                    if (newDebts.length > 0) {
                        await db.debts.bulkAdd(newDebts);
                    }
                });
                setAutoCopiedPeriod(periodId);
            } finally {
                copyInProgressRef.current = false;
            }
        };

        copyFromPrevious();
    }, [periodId, debts, autoCopiedPeriod]);

    const debtList = debts || [];
    const totalDebt = debtList.reduce((sum, d) => {
        const amortization = d.amortizationAmount ?? 0;
        return sum + Math.max(0, d.amount - amortization);
    }, 0);
    const getDebtTypeLabel = (type: string) => {
        if (type === 'CREDIT_CARD') return 'Tarjeta de Credito';
        if (type === 'PERSONAL') return 'Personal';
        if (type === 'LOAN') return 'Prestamo';
        return 'Otro';
    };
    const targetDebt = amortizeTargetId ? debtList.find(d => d.id === amortizeTargetId) : null;
    const increaseTarget = increaseTargetId ? debtList.find(d => d.id === increaseTargetId) : null;

    const appendHistory = (debt: typeof debtList[number], type: 'AMORTIZATION' | 'INCREASE', amount: number, note?: string) => {
        const entry = {
            id: uuidv4(),
            type,
            amount,
            note: note && note.length ? note : undefined,
            createdAt: new Date().toISOString()
        };
        return [...(debt.history ?? []), entry];
    };

    const toggleHistory = (id: string) => {
        setOpenHistoryIds(prev => (
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        ));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Deudas Totales</h1>
                    <p className="text-muted-foreground">
                        Registra lo que aun debes pagar (Tarjetas, Prestamos, etc.)
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Obligaciones acumuladas
                    </p>
                </div>
                <div className="flex gap-2">
                    <PeriodSelector />
                    <Button
                        variant="destructive"
                        onClick={async () => {
                            if (!confirm(`Eliminar todas las deudas del periodo ${periodId}?`)) return;
                            await db.debts.where('periodId').equals(periodId).delete();
                        }}
                    >
                        Borrar Todo
                    </Button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Nueva Deuda
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Registrar Obligacion</DialogTitle>
                                <DialogDescription>
                                    Agrega una deuda pendiente para este periodo.
                                </DialogDescription>
                            </DialogHeader>
                            <DebtForm onSuccess={() => setOpen(false)} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">
                        Total Deudas acumuladas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                        ${formatMoney(totalDebt)} COP
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {debtList.map(debt => {
                    const amortization = debt.amortizationAmount ?? 0;
                    const netDebt = Math.max(0, debt.amount - amortization);
                    return (
                        <Card key={debt.id} className={netDebt === 0 ? 'opacity-70' : undefined}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="font-semibold">{debt.entityName}</div>
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setAmortizeTargetId(debt.id);
                                            setAmortizeValue(debt.amortizationAmount ?? 0);
                                            setAmortizeNote('');
                                            setAmortizeOpen(true);
                                        }}
                                    >
                                        Amortizar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setIncreaseTargetId(debt.id);
                                            setIncreaseValue(debt.increaseAmount ?? 0);
                                            setIncreaseNote('');
                                            setIncreaseOpen(true);
                                        }}
                                    >
                                        Aumentar
                                    </Button>
                                    <DeleteButton
                                        onDelete={async () => {
                                            if (!periodId) return;
                                            const seriesId = debt.seriesId ?? debt.id;
                                            await db.debts
                                                .where('seriesId')
                                                .equals(seriesId)
                                                .filter(item => item.periodId >= periodId)
                                                .delete();
                                        }}
                                        itemName="deuda"
                                        description="Se eliminara esta deuda y no se volvera a copiar en meses futuros."
                                    />
                                </div>
                            </CardHeader>

                            <CardContent className="relative">
                                {netDebt === 0 && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <span className="text-3xl font-bold uppercase text-gray-400/30">
                                            Pagada
                                        </span>
                                    </div>
                                )}
                                <div className="text-xl font-bold flex items-center gap-1">
                                    <InlineAmount
                                        value={debt.amount}
                                        onSave={async (val) => {
                                            const delta = val - debt.amount;
                                            if (delta === 0) return;
                                            const nextHistory = appendHistory(
                                                debt,
                                                delta > 0 ? 'INCREASE' : 'AMORTIZATION',
                                                Math.abs(delta)
                                            );
                                            const cappedAmortization = Math.min(debt.amortizationAmount ?? 0, val);
                                            await db.debts.update(debt.id, {
                                                amount: val,
                                                amortizationAmount: cappedAmortization,
                                                history: nextHistory
                                            });
                                        }}
                                        className="text-xl"
                                    />
                                    <span className="text-xs font-normal text-muted-foreground">{debt.currency}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    Amortizacion:
                                    <InlineAmount
                                        value={debt.amortizationAmount ?? 0}
                                        onSave={async (val) => {
                                            const next = Math.max(0, Math.min(val, debt.amount));
                                            await db.debts.update(debt.id, { amortizationAmount: next });
                                        }}
                                        className="ml-1"
                                    />
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    Aumento:
                                    <InlineAmount
                                        value={debt.increaseAmount ?? 0}
                                        onSave={async (val) => {
                                            const current = debt.increaseAmount ?? 0;
                                            if (val < current) {
                                                alert('El aumento no puede ser menor que el valor actual.');
                                                return;
                                            }
                                            const delta = val - current;
                                            if (delta === 0) return;
                                            const nextHistory = appendHistory(debt, 'INCREASE', delta);
                                            await db.debts.update(debt.id, {
                                                increaseAmount: val,
                                                amount: debt.amount + delta,
                                                history: nextHistory
                                            });
                                        }}
                                        className="ml-1"
                                    />
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Saldo neto: ${formatMoney(netDebt, debt.currency)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {getDebtTypeLabel(debt.debtType)}
                                </div>
                                {debt.dueDay && (
                                    <div className="text-xs text-red-500 mt-2 font-medium">
                                        Vence: dia {debt.dueDay}
                                    </div>
                                )}
                                {debt.notes && (
                                    <div className="text-xs text-muted-foreground mt-2 italic">
                                        "{debt.notes}"
                                    </div>
                                )}
                                <div className="mt-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleHistory(debt.id)}
                                    >
                                        {openHistoryIds.includes(debt.id) ? 'Ocultar historial' : 'Ver historial'}
                                    </Button>
                                    {openHistoryIds.includes(debt.id) && (
                                        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                                            {(debt.history ?? []).length === 0 && (
                                                <div>Sin movimientos registrados.</div>
                                            )}
                                            {(debt.history ?? []).map(entry => (
                                                <div key={entry.id} className="flex justify-between gap-4 border-b pb-1 last:border-0">
                                                    <div>
                                                        <div className="font-medium">
                                                            {entry.type === 'AMORTIZATION' ? 'Amortizacion' : 'Aumento'}: ${formatMoney(entry.amount, debt.currency)}
                                                        </div>
                                                        {entry.note && <div className="italic">"{entry.note}"</div>}
                                                    </div>
                                                    <div className="text-[11px]">{new Date(entry.createdAt).toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {debtList.length === 0 && (
                    <div className="col-span-full text-center py-10 text-muted-foreground">
                        No hay deudas registradas para este periodo.
                    </div>
                )}
            </div>

            <Dialog
                open={amortizeOpen}
                onOpenChange={(next) => {
                    setAmortizeOpen(next);
                    if (!next) {
                        setAmortizeTargetId(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Amortizar Deuda</DialogTitle>
                        <DialogDescription>
                            Define el valor de amortizacion de este mes (reemplaza el valor anterior).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            type="number"
                            value={amortizeValue}
                            onChange={(event) => {
                                setAmortizeValue(event.target.valueAsNumber || 0);
                            }}
                        />
                        <Input
                            placeholder="Nota (opcional)"
                            value={amortizeNote}
                            onChange={(event) => {
                                setAmortizeNote(event.target.value);
                            }}
                        />
                        <Button
                            onClick={async () => {
                                if (!amortizeTargetId) return;
                                if (amortizeValue < 0) return;
                                if (targetDebt && amortizeValue > targetDebt.amount) {
                                    alert('La amortizacion no puede ser mayor que el monto de la deuda.');
                                    return;
                                }
                                const next = targetDebt ? Math.min(amortizeValue, targetDebt.amount) : amortizeValue;
                                const history = targetDebt ? appendHistory(targetDebt, 'AMORTIZATION', next, amortizeNote.trim()) : [];
                                await db.debts.update(amortizeTargetId, {
                                    amortizationAmount: next,
                                    history
                                });
                                setAmortizeOpen(false);
                                setAmortizeTargetId(null);
                            }}
                        >
                            Guardar Amortizacion
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={increaseOpen}
                onOpenChange={(next) => {
                    setIncreaseOpen(next);
                    if (!next) {
                        setIncreaseTargetId(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Aumentar Deuda</DialogTitle>
                        <DialogDescription>
                            Indica cuanto se suma al monto de la deuda.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            type="number"
                            value={increaseValue}
                            onChange={(event) => {
                                setIncreaseValue(event.target.valueAsNumber || 0);
                            }}
                        />
                        <Input
                            placeholder="Nota (opcional)"
                            value={increaseNote}
                            onChange={(event) => {
                                setIncreaseNote(event.target.value);
                            }}
                        />
                        <Button
                            onClick={async () => {
                                if (!increaseTargetId) return;
                                if (increaseValue <= 0) return;
                                if (!increaseTarget) return;
                                if (increaseValue < (increaseTarget.increaseAmount ?? 0)) {
                                    alert('El aumento no puede ser menor que el valor actual.');
                                    return;
                                }
                                const delta = increaseValue - (increaseTarget.increaseAmount ?? 0);
                                if (delta === 0) return;
                                const history = appendHistory(increaseTarget, 'INCREASE', delta, increaseNote.trim());
                                await db.debts.update(increaseTargetId, {
                                    amount: increaseTarget.amount + delta,
                                    increaseAmount: increaseValue,
                                    history
                                });
                                setIncreaseOpen(false);
                                setIncreaseTargetId(null);
                            }}
                        >
                            Guardar Aumento
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
