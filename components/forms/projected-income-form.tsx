'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { projectedIncomeSchema, projectedIncomeTypeSchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';

type ProjectedIncomeFormValues = z.infer<typeof projectedIncomeSchema>;

interface ProjectedIncomeFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<ProjectedIncomeFormValues>;
}

export function ProjectedIncomeForm({ onSuccess, defaultValues }: ProjectedIncomeFormProps) {
    const { periodId } = useActivePeriod();
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
    const snapshots = useLiveQuery(
        () => db.accountSnapshots.where('periodId').equals(periodId).toArray(),
        [periodId]
    ) || [];

    const snapshotMap = useMemo(() => new Map(snapshots.map(s => [s.accountId, s])), [snapshots]);

    const form = useForm<ProjectedIncomeFormValues>({
        resolver: zodResolver(projectedIncomeSchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            periodId: defaultValues?.periodId ?? periodId,
            date: defaultValues?.date ?? new Date().toISOString().split('T')[0],
            entityId: defaultValues?.entityId ?? undefined,
            accountId: defaultValues?.accountId ?? '',
            concept: defaultValues?.concept ?? '',
            currency: defaultValues?.currency ?? 'COP',
            type: defaultValues?.type ?? 'FIXED_EA',
            rateEA: defaultValues?.rateEA ?? 0,
            rateMonthly: defaultValues?.rateMonthly ?? 0,
            amount: defaultValues?.amount ?? 0,
            isRecurring: defaultValues?.isRecurring ?? false,
            notes: defaultValues?.notes ?? undefined,
        }
    });

    useEffect(() => {
        if (periodId && !defaultValues?.id) {
            form.setValue('periodId', periodId);
        }
    }, [periodId, form, defaultValues]);

    const selectedAccountId = form.watch('accountId');
    const selectedType = form.watch('type');
    const snapshotBalance = selectedAccountId ? (snapshotMap.get(selectedAccountId)?.balance ?? 0) : 0;

    const rateEA = form.watch('rateEA') || 0;
    const rateMonthly = form.watch('rateMonthly') || 0;
    const monthlyRateFromEA = Math.pow(1 + (rateEA / 100), 1 / 12) - 1;
    const monthlyRate = selectedType === 'FIXED_EA' ? monthlyRateFromEA : (rateMonthly / 100);
    const manualAmount = form.watch('amount') || 0;
    const projectedAmount = selectedType === 'SALARY' ? manualAmount : snapshotBalance * monthlyRate;

    async function onSubmit(data: ProjectedIncomeFormValues) {
        try {
            await db.projectedIncomes.put(data);
            const resetId = uuidv4();
            form.reset({
                id: resetId,
                periodId,
                date: new Date().toISOString().split('T')[0],
                entityId: undefined,
                accountId: '',
                concept: '',
                currency: 'COP',
                type: 'FIXED_EA',
                rateEA: 0,
                rateMonthly: 0,
                amount: 0,
                isRecurring: false,
                notes: undefined
            });
            onSuccess?.();
        } catch (error) {
            console.error('Failed to save projected income:', error);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fecha</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione tipo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {projectedIncomeTypeSchema.options.map(type => (
                                            <SelectItem key={type} value={type}>
                                                {type === 'FIXED_EA'
                                                    ? 'Tasa Fija (EA)'
                                                    : type === 'VARIABLE_MONTHLY'
                                                        ? 'Tasa Variable (Mes)'
                                                        : type === 'SALARY'
                                                            ? 'Salario'
                                                            : 'Ingreso Unico'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="entityId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Entidad (Opcional)</FormLabel>
                                <Select onValueChange={(val) => field.onChange(val === 'none' ? undefined : val)} value={field.value || 'none'}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione entidad..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">Ninguna</SelectItem>
                                        {entities.map(entity => (
                                            <SelectItem key={entity.id} value={entity.id}>
                                                {entity.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="accountId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cuenta</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione cuenta..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {accounts.map(account => (
                                            <SelectItem key={account.id} value={account.id}>
                                                {account.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="concept"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Concepto</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Rendimiento CDT" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Moneda</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione moneda" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="COP">COP</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormItem>
                        <FormLabel>Saldo Actual (Saldos Mensuales)</FormLabel>
                        <FormControl>
                            <Input type="number" value={snapshotBalance} disabled />
                        </FormControl>
                    </FormItem>
                </div>

                {selectedType === 'FIXED_EA' && (
                    <FormField
                        control={form.control}
                        name="rateEA"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tasa EA (%)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="any" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {selectedType !== 'FIXED_EA' && selectedType !== 'SALARY' && (
                    <FormField
                        control={form.control}
                        name="rateMonthly"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tasa Mensual (%)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="any" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {selectedType === 'SALARY' && (
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Salario Proyectado</FormLabel>
                                <FormControl>
                                    <Input type="number" step="any" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormItem>
                    <FormLabel>Monto Proyectado</FormLabel>
                    <FormControl>
                        <Input type="number" value={projectedAmount} disabled />
                    </FormControl>
                </FormItem>

                <FormField
                    control={form.control}
                    name="isRecurring"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>Ingreso mensual persistente</FormLabel>
                            </div>
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full">Guardar Ingreso Proyectado</Button>
            </form>
        </Form>
    );
}
