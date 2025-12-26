'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { entitySchema, entityTypeSchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { v4 as uuidv4 } from 'uuid';

type EntityFormValues = z.infer<typeof entitySchema>;

interface EntityFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<EntityFormValues>;
}

export function EntityForm({ onSuccess, defaultValues }: EntityFormProps) {
    const types = entityTypeSchema.options;

    const form = useForm<EntityFormValues>({
        resolver: zodResolver(entitySchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            name: defaultValues?.name ?? '',
            type: defaultValues?.type ?? 'BANK',
            notes: defaultValues?.notes ?? '',
        }
    });

    async function onSubmit(data: EntityFormValues) {
        try {
            await db.entities.put(data);
            form.reset({
                id: uuidv4(),
                name: '',
                type: 'BANK',
                notes: '',
            });
            onSuccess?.();
        } catch (error) {
            console.error(error);
            alert("Error al guardar la entidad");
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Bancolombia, Pepe, Claro" {...field} />
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
                                    {types.map(t => (
                                        <SelectItem key={t} value={t}>
                                            {t}
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
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notas (Opcional)</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full">Guardar Entidad</Button>
            </form>
        </Form>
    );
}
