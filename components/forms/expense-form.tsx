
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expenseSchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

type ExpenseFormValues = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<ExpenseFormValues>;
}

export function ExpenseForm({ onSuccess, defaultValues }: ExpenseFormProps) {
    const { periodId } = useActivePeriod();
    const entities = useLiveQuery(() => db.entities.toArray()) || [];

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            periodId: defaultValues?.periodId ?? periodId,
            date: defaultValues?.date ?? new Date().toISOString().split('T')[0],
            currency: defaultValues?.currency ?? 'COP',
            amount: defaultValues?.amount ?? 0,
            reason: defaultValues?.reason ?? '',
            method: defaultValues?.method ?? 'DEBIT',
            installments: defaultValues?.installments ?? 1,
            entityId: defaultValues?.entityId ?? undefined,
            notes: defaultValues?.notes ?? undefined,
        }
    });

    // Update periodId if it changes
    useEffect(() => {
        if (periodId && !defaultValues?.id) {
            form.setValue('periodId', periodId);
        }
    }, [periodId, form, defaultValues]);

    async function onSubmit(data: ExpenseFormValues) {
        try {
            await db.expenses.put(data);
            form.reset({
                id: uuidv4(),
                periodId,
                date: new Date().toISOString().split('T')[0],
                currency: 'COP',
                amount: 0,
                reason: '',
                method: 'DEBIT',
                installments: 1
            });
            onSuccess?.();
        } catch (error) {
            console.error('Failed to save expense:', error);
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
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monto</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="any"
                                        placeholder="0.00"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Razón / Descripción</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Mercado, Gasolina..." {...field} />
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
                                            <SelectValue placeholder="Select currency" />
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Método de Pago</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="DEBIT">Débito</SelectItem>
                                        <SelectItem value="CREDIT_CARD">Tarjeta de Crédito</SelectItem>
                                        <SelectItem value="CASH">Efectivo</SelectItem>
                                        <SelectItem value="TRANSFER">Transferencia</SelectItem>
                                        <SelectItem value="OTHER">Otro</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="installments"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cuotas</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min="1"
                                        {...field}
                                        onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="entityId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Entidad / Proveedor (Opcional)</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === 'none' ? undefined : val)} value={field.value || 'none'}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Ninguno</SelectItem>
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

                <Button type="submit" className="w-full">Guardar Egreso</Button>
            </form>
        </Form>
    );
}
