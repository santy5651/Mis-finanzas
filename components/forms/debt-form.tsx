'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { debtSchema, debtTypeSchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { v4 as uuidv4 } from 'uuid';
import { useActivePeriod } from '@/lib/hooks/use-active-period';

type DebtFormValues = z.infer<typeof debtSchema>;

interface DebtFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<DebtFormValues>;
}

export function DebtForm({ onSuccess, defaultValues }: DebtFormProps) {
    const { periodId } = useActivePeriod();
    // const periodId = activePeriod?.id || new Date().toISOString().slice(0, 7); // periodId is already string

    // Fetch entities (Banks, People, etc.)
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const debtTypes = debtTypeSchema.options;

    const form = useForm<DebtFormValues>({
        resolver: zodResolver(debtSchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            periodId: defaultValues?.periodId ?? periodId,
            entityId: defaultValues?.entityId ?? '',
            debtType: defaultValues?.debtType ?? 'CREDIT_CARD',
            amount: defaultValues?.amount ?? 0,
            currency: defaultValues?.currency ?? 'COP',
            dueDate: defaultValues?.dueDate ?? '',
            notes: defaultValues?.notes ?? '',
        }
    });

    async function onSubmit(data: DebtFormValues) {
        try {
            await db.debts.put({
                ...data,
                dueDate: data.dueDate || undefined // Ensure undefined if empty string
            });
            form.reset({
                id: uuidv4(),
                periodId: periodId,
                entityId: '',
                debtType: 'CREDIT_CARD',
                amount: 0,
                currency: 'COP',
                dueDate: '',
                notes: '',
            });
            onSuccess?.();
            alert("Deuda registrada exitosamente!");
        } catch (error) {
            console.error(error);
            alert("Error al guardar la deuda");
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="entityId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Entidad (A quien se debe)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione entidad..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
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
                        name="debtType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Deuda</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione tipo..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {debtTypes.map(t => (
                                            <SelectItem key={t} value={t}>
                                                {t.replace(/_/g, ' ')}
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
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monto a Pagar</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        {...field}
                                        onChange={e => field.onChange(e.target.valueAsNumber)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Moneda</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Moneda" />
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
                    name="dueDate"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Fecha Límite (Opcional)</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notas</FormLabel>
                            <FormControl>
                                <Input placeholder="Detalles adicionales..." {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full">Guardar Deuda</Button>
            </form>
        </Form>
    );
}
