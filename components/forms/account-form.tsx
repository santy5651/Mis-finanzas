'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountSchema, accountCategorySchema } from '@/lib/validators';
import { z } from 'zod';
import { db } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<AccountFormValues>;
}

export function AccountForm({ onSuccess, defaultValues }: AccountFormProps) {
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const categories = accountCategorySchema.options;

    const form = useForm<AccountFormValues>({
        resolver: zodResolver(accountSchema),
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            name: defaultValues?.name ?? '',
            entityId: defaultValues?.entityId ?? '',
            accountType: defaultValues?.accountType ?? '',
            category: defaultValues?.category ?? 'SAVINGS',
            currency: defaultValues?.currency ?? 'COP',
            isSalaryAccount: defaultValues?.isSalaryAccount ?? false,
            isActive: defaultValues?.isActive ?? true,
        }
    });

    async function onSubmit(data: AccountFormValues) {
        try {
            await db.accounts.put(data);
            form.reset({
                id: uuidv4(),
                name: '',
                entityId: '',
                accountType: '',
                category: 'SAVINGS',
                currency: 'COP',
                isSalaryAccount: false,
                isActive: true,
            });
            onSuccess?.();
            alert("Cuenta guardada exitosamente!");
        } catch (error) {
            console.error(error);
            alert("Error al guardar la cuenta");
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
                            <FormLabel>Nombre de la Cuenta</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Ahorros Bancolombia" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="entityId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Entidad</FormLabel>
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
                        name="accountType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Producto</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ej: Ahorros, CDT, Fiducia" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoría</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione categoría" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {categories.map(cat => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat.replace(/_/g, ' ')}
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
                </div>

                <div className="flex space-x-4">
                    <FormField
                        control={form.control}
                        name="isSalaryAccount"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <FormLabel>Es Cuenta de Nómina</FormLabel>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <FormLabel>Activa</FormLabel>
                            </FormItem>
                        )}
                    />
                </div>

                <Button type="submit" className="w-full">Guardar Cuenta</Button>
            </form>
        </Form>
    );
}
