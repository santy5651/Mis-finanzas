
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { incomeSchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

type IncomeFormValues = z.infer<typeof incomeSchema>;

interface IncomeFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<IncomeFormValues>;
}

export function IncomeForm({ onSuccess, defaultValues }: IncomeFormProps) {
    const { periodId } = useActivePeriod();
    const entities = useLiveQuery(() => db.entities.toArray()) || [];

    const form = useForm<IncomeFormValues>({
        resolver: zodResolver(incomeSchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            periodId: defaultValues?.periodId ?? periodId,
            date: defaultValues?.date ?? new Date().toISOString().split('T')[0],
            currency: defaultValues?.currency ?? 'COP',
            isSalary: defaultValues?.isSalary ?? false,
            amount: defaultValues?.amount ?? 0,
            concept: defaultValues?.concept ?? '',
            entityId: defaultValues?.entityId ?? undefined,
            method: defaultValues?.method ?? undefined,
            notes: defaultValues?.notes ?? undefined,
        }
    });

    // Update periodId if it changes and we are in create mode (no defaultValues or defaultValues.periodId matches old)
    useEffect(() => {
        if (periodId && !defaultValues?.id) {
            form.setValue('periodId', periodId);
        }
    }, [periodId, form, defaultValues]);

    async function onSubmit(data: IncomeFormValues) {
        try {
            await db.incomes.put(data);
            form.reset({
                id: uuidv4(),
                periodId,
                date: new Date().toISOString().split('T')[0],
                currency: 'COP',
                isSalary: false,
                amount: 0,
                concept: '',
            });
            onSuccess?.();
        } catch (error) {
            console.error('Failed to save income:', error);
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
                    name="concept"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Concepto</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Salario Mensual, Venta Garage..." {...field} />
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
                    name="isSalary"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Es Salario
                                </FormLabel>
                            </div>
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full">Guardar Ingreso</Button>
            </form>
        </Form>
    );
}
