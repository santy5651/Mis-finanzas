'use client';

import { useMemo, useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { v4 as uuidv4 } from 'uuid';
import { GripVertical, Loader2, Save } from 'lucide-react';
import { LIQUID_CATEGORIES } from '@/lib/calculations/financials';
import { formatMoney } from '@/lib/utils';
import { DeleteButton } from '@/components/ui/delete-button';
import type { AccountMovement } from '@/lib/types';

const snapshotEntrySchema = z.object({
    accountId: z.string(),
    accountName: z.string(),
    currency: z.string(),
    balance: z.number().min(0),
    effectiveAnnualRateProjected: z.number().min(0).max(100).optional(),
});

const snapshotFormSchema = z.object({
    periodId: z.string(),
    snapshots: z.array(snapshotEntrySchema),
});

type SnapshotFormValues = z.infer<typeof snapshotFormSchema>;

export function SnapshotForm() {
    const [loading, setLoading] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>({});
    const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
    const [movementDialogOpen, setMovementDialogOpen] = useState(false);
    const [movementAccountId, setMovementAccountId] = useState<string | null>(null);
    const [movementType, setMovementType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>('DEPOSIT');
    const [movementDate, setMovementDate] = useState('');
    const [movementAmount, setMovementAmount] = useState('');
    const [movementNotes, setMovementNotes] = useState('');
    const [transferAccountId, setTransferAccountId] = useState<string>('');

    const accounts = useLiveQuery(() =>
        db.accounts.filter(a => a.isActive).toArray()
    ) || [];

    const generatePeriods = () => {
        const dates = [];
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        for (let i = 0; i < 7; i++) {
            const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
            dates.push(d.toISOString().slice(0, 7));
        }
        return dates;
    };
    const periods = generatePeriods();

    const form = useForm<SnapshotFormValues>({
        resolver: zodResolver(snapshotFormSchema),
        defaultValues: {
            periodId: periods[0],
            snapshots: [],
        }
    });

    const { fields, replace, move } = useFieldArray({
        control: form.control,
        name: "snapshots"
    });

    const selectedPeriod = form.watch('periodId');
    const movementAccount = accounts.find(account => account.id === movementAccountId);
    const movements = useLiveQuery(() => {
        if (!movementAccountId || !selectedPeriod) return [];
        return db.accountMovements
            .where('[periodId+accountId]')
            .equals([selectedPeriod, movementAccountId])
            .toArray();
    }, [movementAccountId, selectedPeriod]) || [];
    const transferTargets = movementAccount
        ? accounts.filter(account => account.id !== movementAccount.id && account.currency === movementAccount.currency)
        : [];

    useEffect(() => {
        const loadData = async () => {
            if (!accounts.length || !selectedPeriod) return;

            const existingSnapshots = await db.accountSnapshots
                .where('periodId').equals(selectedPeriod)
                .toArray();

            const snapshotMap = new Map(existingSnapshots.map(s => [s.accountId, s]));

            const newFields = accounts.map(acc => {
                const existing = snapshotMap.get(acc.id);
                return {
                    accountId: acc.id,
                    accountName: acc.name,
                    currency: acc.currency,
                    balance: existing?.balance ?? 0,
                    effectiveAnnualRateProjected: existing?.effectiveAnnualRateProjected ? existing.effectiveAnnualRateProjected * 100 : 0,
                };
            });

            replace(newFields);
            setBalanceInputs(
                Object.fromEntries(
                    newFields.map((snap) => [snap.accountId, formatDecimal(snap.balance)])
                )
            );
            setRateInputs(
                Object.fromEntries(
                    newFields.map((snap) => [snap.accountId, formatDecimal(snap.effectiveAnnualRateProjected)])
                )
            );
        };

        loadData();
    }, [accounts.length, selectedPeriod, replace]);

    const liquidAccountIds = useMemo(() => {
        return new Set(
            accounts
                .filter(account => (account.categories ?? []).some(cat => LIQUID_CATEGORIES.includes(cat)))
                .map(account => account.id)
        );
    }, [accounts]);

    const snapshots = form.watch('snapshots');
    const totals = useMemo(() => {
        return (snapshots || []).reduce(
            (acc, snap) => {
                if (snap.currency === 'USD') {
                    acc.usd += snap.balance || 0;
                } else {
                    acc.cop += snap.balance || 0;
                }
                return acc;
            },
            { cop: 0, usd: 0 }
        );
    }, [snapshots]);

    const formatDecimal = (value: number | undefined) => {
        if (value === undefined || Number.isNaN(value)) return '';
        return value.toString().replace('.', ',');
    };

    const normalizeDecimal = (value: string) => value.replace('.', ',');
    const parseDecimal = (value: string) => {
        const normalized = value.replace(',', '.');
        const parsed = parseFloat(normalized);
        return Number.isNaN(parsed) ? 0 : parsed;
    };

    useEffect(() => {
        if (!movementDialogOpen || !selectedPeriod) return;
        setMovementType('DEPOSIT');
        setMovementAmount('');
        setMovementNotes('');
        setTransferAccountId('');
        setMovementDate(`${selectedPeriod}-01`);
    }, [movementDialogOpen, selectedPeriod]);

    const applyBalanceDelta = (accountId: string, delta: number) => {
        const snapshotsValues = form.getValues('snapshots');
        const index = snapshotsValues.findIndex(snap => snap.accountId === accountId);
        if (index === -1) return;
        const current = form.getValues(`snapshots.${index}.balance`);
        const next = current + delta;
        form.setValue(`snapshots.${index}.balance`, next);
        setBalanceInputs(prev => ({ ...prev, [accountId]: formatDecimal(next) }));
    };

    const handleAddMovement = async () => {
        if (!movementAccount || !movementAccountId || !selectedPeriod) return;
        const amount = parseDecimal(movementAmount);
        if (!movementDate || amount <= 0) {
            alert('Ingresa una fecha y un monto valido.');
            return;
        }

        const createdAt = new Date().toISOString();
        const baseMovement = {
            periodId: selectedPeriod,
            date: movementDate,
            amount,
            currency: movementAccount.currency,
            notes: movementNotes || undefined,
            createdAt
        };

        if (movementType === 'TRANSFER') {
            if (!transferAccountId) {
                alert('Selecciona la cuenta destino para la transferencia.');
                return;
            }
            const targetAccount = accounts.find(account => account.id === transferAccountId);
            if (!targetAccount) {
                alert('Cuenta destino invalida.');
                return;
            }
            const transferGroupId = uuidv4();
            const outgoing: AccountMovement = {
                id: uuidv4(),
                accountId: movementAccount.id,
                type: 'TRANSFER_OUT',
                relatedAccountId: targetAccount.id,
                transferGroupId,
                ...baseMovement
            };
            const incoming: AccountMovement = {
                id: uuidv4(),
                accountId: targetAccount.id,
                type: 'TRANSFER_IN',
                relatedAccountId: movementAccount.id,
                transferGroupId,
                ...baseMovement
            };
            await db.accountMovements.bulkAdd([outgoing, incoming]);
            applyBalanceDelta(movementAccount.id, -amount);
            applyBalanceDelta(targetAccount.id, amount);
        } else {
            const type = movementType === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL';
            const movement: AccountMovement = {
                id: uuidv4(),
                accountId: movementAccount.id,
                type,
                ...baseMovement
            };
            await db.accountMovements.add(movement);
            const delta = type === 'DEPOSIT' ? amount : -amount;
            applyBalanceDelta(movementAccount.id, delta);
        }

        setMovementAmount('');
        setMovementNotes('');
        setTransferAccountId('');
    };

    const handleDeleteMovement = async (movement: AccountMovement) => {
        const reverseDelta = (type: AccountMovement['type'], amount: number) => {
            return (type === 'DEPOSIT' || type === 'TRANSFER_IN') ? -amount : amount;
        };

        if (movement.transferGroupId) {
            const groupMovements = await db.accountMovements
                .where('transferGroupId')
                .equals(movement.transferGroupId)
                .toArray();
            await db.accountMovements.where('transferGroupId').equals(movement.transferGroupId).delete();
            groupMovements.forEach(item => applyBalanceDelta(item.accountId, reverseDelta(item.type, item.amount)));
        } else {
            await db.accountMovements.delete(movement.id);
            applyBalanceDelta(movement.accountId, reverseDelta(movement.type, movement.amount));
        }
    };

    async function onSubmit(data: SnapshotFormValues) {
        setLoading(true);
        try {
            const snapshotsToSave = data.snapshots.map(s => {
                const rateDecimal = s.effectiveAnnualRateProjected ? s.effectiveAnnualRateProjected / 100 : 0;

                return {
                    periodId: data.periodId,
                    accountId: s.accountId,
                    balance: s.balance,
                    effectiveAnnualRateProjected: rateDecimal,
                    updatedAt: new Date().toISOString(),
                };
            });

            await db.transaction('rw', db.accountSnapshots, async () => {
                for (const snap of snapshotsToSave) {
                    const existing = await db.accountSnapshots
                        .where({ periodId: snap.periodId, accountId: snap.accountId })
                        .first();

                    await db.accountSnapshots.put({
                        ...snap,
                        id: existing?.id ?? uuidv4(),
                        createdAt: existing?.createdAt ?? new Date().toISOString(),
                    });
                }
            });

            alert('Saldos guardados correctamente');
        } catch (error) {
            console.error(error);
            alert('Error al guardar saldos');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex items-center space-x-4">
                    <FormField
                        control={form.control}
                        name="periodId"
                        render={({ field }) => (
                            <FormItem className="w-48">
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione periodo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {periods.map(p => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Guardar Todo
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Las filas con fondo azul indican cuentas liquidas de acceso rapido.
                </p>

                <Card className="bg-blue-50/60 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Saldos del Mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${formatMoney(totals.cop, 'COP')} COP
                        </div>
                        {totals.usd > 0 && (
                            <div className="text-sm text-muted-foreground mt-1">
                                ${formatMoney(totals.usd, 'USD')} USD
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead className="w-[300px]">Cuenta</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead>Saldo Actual</TableHead>
                                <TableHead>% E.A. Proyectado</TableHead>
                                <TableHead>Movimientos</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field, index) => (
                                <TableRow
                                    key={field.id}
                                    className={liquidAccountIds.has(field.accountId) ? 'bg-blue-50/60 dark:bg-blue-900/10' : undefined}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={() => {
                                        if (dragIndex === null || dragIndex === index) return;
                                        move(dragIndex, index);
                                        setDragIndex(null);
                                    }}
                                >
                                    <TableCell className="text-muted-foreground">
                                        <button
                                            type="button"
                                            className="cursor-grab active:cursor-grabbing"
                                            draggable
                                            onDragStart={() => setDragIndex(index)}
                                            onDragEnd={() => setDragIndex(null)}
                                        >
                                            <GripVertical className="h-4 w-4" />
                                        </button>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {field.accountName}
                                        <input type="hidden" {...form.register(`snapshots.${index}.accountId`)} />
                                        <input type="hidden" {...form.register(`snapshots.${index}.accountName`)} />
                                    </TableCell>
                                    <TableCell>
                                        {field.currency}
                                        <input type="hidden" {...form.register(`snapshots.${index}.currency`)} />
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`snapshots.${index}.balance`}
                                            render={({ field: f }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={balanceInputs[field.accountId] ?? ''}
                                                            onChange={(event) => {
                                                                const raw = normalizeDecimal(event.target.value);
                                                                setBalanceInputs(prev => ({ ...prev, [field.accountId]: raw }));
                                                                f.onChange(parseDecimal(raw));
                                                            }}
                                                            onBlur={() => {
                                                                const raw = balanceInputs[field.accountId] ?? '';
                                                                setBalanceInputs(prev => ({ ...prev, [field.accountId]: normalizeDecimal(raw) }));
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`snapshots.${index}.effectiveAnnualRateProjected`}
                                            render={({ field: f }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Input
                                                                type="text"
                                                                inputMode="decimal"
                                                                className="pr-6"
                                                                value={rateInputs[field.accountId] ?? ''}
                                                                onChange={(event) => {
                                                                    const raw = normalizeDecimal(event.target.value);
                                                                    setRateInputs(prev => ({ ...prev, [field.accountId]: raw }));
                                                                    f.onChange(parseDecimal(raw));
                                                                }}
                                                                onBlur={() => {
                                                                    const raw = rateInputs[field.accountId] ?? '';
                                                                    setRateInputs(prev => ({ ...prev, [field.accountId]: normalizeDecimal(raw) }));
                                                                }}
                                                            />
                                                            <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">%</span>
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setMovementAccountId(field.accountId);
                                                setMovementDialogOpen(true);
                                            }}
                                        >
                                            Ver
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {fields.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No hay cuentas activas registradas. Ve a la seccion de Cuentas para crear una.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <Dialog
                    open={movementDialogOpen}
                    onOpenChange={(open) => {
                        setMovementDialogOpen(open);
                        if (!open) {
                            setMovementAccountId(null);
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                Movimientos {movementAccount ? `- ${movementAccount.name}` : ''}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Fecha</label>
                                    <Input
                                        type="date"
                                        value={movementDate}
                                        onChange={(event) => setMovementDate(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Tipo</label>
                                    <Select value={movementType} onValueChange={(val) => setMovementType(val as typeof movementType)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="DEPOSIT">Deposito</SelectItem>
                                            <SelectItem value="WITHDRAWAL">Retiro</SelectItem>
                                            <SelectItem value="TRANSFER">Transferencia</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Monto</label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={movementAmount}
                                        onChange={(event) => setMovementAmount(normalizeDecimal(event.target.value))}
                                    />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs text-muted-foreground">Notas</label>
                                    <Input
                                        type="text"
                                        value={movementNotes}
                                        onChange={(event) => setMovementNotes(event.target.value)}
                                    />
                                </div>
                            </div>

                            {movementType === 'TRANSFER' && (
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Cuenta destino</label>
                                    <Select value={transferAccountId} onValueChange={setTransferAccountId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona una cuenta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {transferTargets.map(account => (
                                                <SelectItem key={account.id} value={account.id}>
                                                    {account.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button type="button" onClick={handleAddMovement}>
                                    Agregar Movimiento
                                </Button>
                            </div>

                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Monto</TableHead>
                                            <TableHead>Notas</TableHead>
                                            <TableHead className="w-[80px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {movements.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                    No hay movimientos registrados.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {[...movements]
                                            .sort((a, b) => a.date.localeCompare(b.date))
                                            .map((movement) => {
                                                const label = movement.type === 'DEPOSIT'
                                                    ? 'Deposito'
                                                    : movement.type === 'WITHDRAWAL'
                                                        ? 'Retiro'
                                                        : movement.type === 'TRANSFER_IN'
                                                            ? 'Transferencia (Entrada)'
                                                            : 'Transferencia (Salida)';
                                                const amountColor = (movement.type === 'DEPOSIT' || movement.type === 'TRANSFER_IN')
                                                    ? 'text-green-600'
                                                    : 'text-red-600';
                                                return (
                                                    <TableRow key={movement.id}>
                                                        <TableCell>{movement.date}</TableCell>
                                                        <TableCell>{label}</TableCell>
                                                        <TableCell className={amountColor}>
                                                            ${formatMoney(movement.amount, movement.currency)}
                                                        </TableCell>
                                                        <TableCell>{movement.notes || '-'}</TableCell>
                                                        <TableCell>
                                                            <DeleteButton
                                                                onDelete={() => handleDeleteMovement(movement)}
                                                                itemName="movimiento"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </form>
        </Form>
    );
}
