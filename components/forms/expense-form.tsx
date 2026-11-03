'use client';

import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expenseSchema } from '@/lib/validators';
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
import { saveExpenseWithLedger } from '@/lib/finance/ledger';
import { dateInsidePeriod } from '@/lib/finance/period';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, guessCategory, resolveCategory } from '@/lib/finance/categories';
import { useState } from 'react';

type ExpenseFormValues = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
    onSuccess?: () => void;
    defaultValues?: Partial<ExpenseFormValues>;
}

export function ExpenseForm({ onSuccess, defaultValues }: ExpenseFormProps) {
    const { periodId } = useActivePeriod();
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const accounts = useLiveQuery(() => db.accounts.filter(account => account.isActive).toArray()) || [];
    const obligations = useLiveQuery(
        () => db.obligations.filter(item => item.isActive && item.direction === 'PAYABLE' && item.type === 'CREDIT_CARD').toArray(),
    ) || [];
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const [saveError, setSaveError] = useState<string | null>(null);

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema) as Resolver<ExpenseFormValues>,
        defaultValues: {
            id: defaultValues?.id ?? uuidv4(),
            periodId: defaultValues?.periodId ?? periodId,
            date: defaultValues?.date ?? dateInsidePeriod(periodId),
            currency: defaultValues?.currency ?? 'COP',
            amount: defaultValues?.amount ?? 0,
            reason: defaultValues?.reason ?? '',
            method: defaultValues?.method ?? 'DEBIT',
            installments: defaultValues?.installments ?? 1,
            category: defaultValues?.category ?? (defaultValues?.reason ? resolveCategory({ reason: defaultValues.reason }) : undefined),
            entityId: defaultValues?.entityId ?? undefined,
            isRecurring: defaultValues?.isRecurring ?? false,
            keepsBalance: defaultValues?.keepsBalance ?? false,
            notes: defaultValues?.notes ?? undefined,
            paymentAccountId: defaultValues?.paymentAccountId ?? undefined,
            obligationId: defaultValues?.obligationId ?? undefined,
            financialEventId: defaultValues?.financialEventId ?? undefined,
        }
    });

    useEffect(() => {
        if (periodId && !defaultValues?.id) {
            form.setValue('periodId', periodId);
            form.setValue('date', dateInsidePeriod(periodId));
        }
    }, [periodId, form, defaultValues]);

    async function onSubmit(formData: ExpenseFormValues) {
        setSaveError(null);
        // The period follows the chosen date, so an expense dated next month lands in next month.
        const data = { ...formData, periodId: formData.date.slice(0, 7), category: formData.category ?? guessCategory(formData.reason) ?? 'OTHER' };
        try {
            if (period?.status === 'CLOSED') {
                setSaveError('Reabre el mes antes de registrar o editar gastos.');
                return;
            }
            if (data.method === 'CREDIT_CARD') {
                if (!data.obligationId) {
                    setSaveError('Selecciona la tarjeta que utilizaste.');
                    return;
                }
                await saveExpenseWithLedger(data, { kind: 'CREDIT_CARD', obligationId: data.obligationId });
            } else {
                if (!data.paymentAccountId) {
                    setSaveError('Selecciona la cuenta desde la que salió el dinero.');
                    return;
                }
                await saveExpenseWithLedger(data, { kind: 'ACCOUNT', accountId: data.paymentAccountId });
            }
            form.reset({
                id: uuidv4(),
                periodId,
                date: dateInsidePeriod(periodId),
                currency: 'COP',
                amount: 0,
                reason: '',
                method: 'DEBIT',
                installments: 1,
                isRecurring: false,
                keepsBalance: false,
            });
            onSuccess?.();
        } catch (error) {
            console.error('Failed to save expense:', error);
            setSaveError(error instanceof Error ? error.message : 'No fue posible guardar el gasto.');
        }
    }

    const selectedMethod = useWatch({ control: form.control, name: 'method' });
    const reasonValue = useWatch({ control: form.control, name: 'reason' });
    const selectedCurrency = useWatch({ control: form.control, name: 'currency' });

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

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="reason"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Razon / Descripcion</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ej: Mercado, Gasolina..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoría</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={`Automática: ${EXPENSE_CATEGORY_LABELS[guessCategory(reasonValue ?? '') ?? 'OTHER']}`} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {EXPENSE_CATEGORIES.map(item => <SelectItem key={item} value={item}>{EXPENSE_CATEGORY_LABELS[item]}</SelectItem>)}
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

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Metodo de Pago</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="DEBIT">Debito</SelectItem>
                                        <SelectItem value="CREDIT_CARD">Tarjeta de Credito</SelectItem>
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

                {selectedMethod === 'CREDIT_CARD' ? (
                    <FormField
                        control={form.control}
                        name="obligationId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tarjeta utilizada</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona una tarjeta" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {obligations.filter(item => item.currency === selectedCurrency).map(item => (
                                            <SelectItem key={item.id} value={item.id}>{item.name} · {entities.find(entity => entity.id === item.entityId)?.name ?? item.currency}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : (
                    <FormField
                        control={form.control}
                        name="paymentAccountId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cuenta de pago</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {accounts.filter(item => item.currency === selectedCurrency).map(item => (
                                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

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
                                <FormLabel>
                                    Gasto mensual persistente
                                </FormLabel>
                            </div>
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="keepsBalance"
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
                                    Gasto pasado: no modificar el saldo
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                    Para un gasto que ya estaba reflejado en el saldo, por ejemplo uno que en el cierre quedó como corrección. Cuenta como gasto en su categoría, pero no mueve la cuenta: si ese mes hay una corrección de la misma cuenta, el gasto toma su lugar. Usa la fecha real del gasto; si el mes está cerrado, reábrelo primero.
                                </p>
                            </div>
                        </FormItem>
                    )}
                />

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

                {saveError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}
                <Button type="submit" className="w-full">Guardar gasto</Button>
            </form>
        </Form>
    );
}
