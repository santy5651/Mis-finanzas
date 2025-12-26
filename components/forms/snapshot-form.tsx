'use client';

import { useState, useEffect } from 'react';
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
import { v4 as uuidv4 } from 'uuid';
import { Loader2, Save } from 'lucide-react';

const snapshotEntrySchema = z.object({
    accountId: z.string(),
    accountName: z.string(),
    currency: z.string(),
    balance: z.number().min(0),
    effectiveAnnualRateProjected: z.number().min(0).max(100).optional(), // Input as percentage (e.g. 12 for 12%)
});

const snapshotFormSchema = z.object({
    periodId: z.string(),
    snapshots: z.array(snapshotEntrySchema),
});

type SnapshotFormValues = z.infer<typeof snapshotFormSchema>;

export function SnapshotForm() {
    const [loading, setLoading] = useState(false);

    // Fetch active accounts
    const accounts = useLiveQuery(() =>
        db.accounts.filter(a => a.isActive).toArray()
    ) || [];

    // Fetch existing periods (mocked for now, need Period CRUD but we can use simple string YYYY-MM)
    // For now, let's allow manual text input or simple generation of last 12 months
    const generatePeriods = () => {
        const dates = [];
        const today = new Date();
        for (let i = 0; i < 6; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            dates.push(d.toISOString().slice(0, 7)); // YYYY-MM
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

    const { fields, replace } = useFieldArray({
        control: form.control,
        name: "snapshots"
    });

    // When accounts or period changes, load existing data or prepopulate
    const selectedPeriod = form.watch('periodId');

    useEffect(() => {
        const loadData = async () => {
            if (!accounts.length || !selectedPeriod) return;

            // Try to find existing snapshots for this period
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
                    effectiveAnnualRateProjected: existing?.effectiveAnnualRateProjected ? existing.effectiveAnnualRateProjected * 100 : 0, // Convert decimal 0.12 back to 12% for input
                };
            });

            replace(newFields);
        };

        loadData();
    }, [accounts.length, selectedPeriod, replace]); // accounts.length to trigger when loaded

    async function onSubmit(data: SnapshotFormValues) {
        setLoading(true);
        try {
            const snapshotsToSave = data.snapshots.map(s => {
                // Determine ID: check if one exists for (period + account) or generate new
                // For simplicity in this bulk update, we can find existing again or just upsert if we handled IDs correctly.
                // Better: find existing IDs in the useEffect and keep them in the form state? 
                // Alternatively, query DB before save. Let's query DB to be safe and clean.

                // Logic: 
                // 1. We need to save decimal rate (12% -> 0.12)
                const rateDecimal = s.effectiveAnnualRateProjected ? s.effectiveAnnualRateProjected / 100 : 0;

                return {
                    periodId: data.periodId,
                    accountId: s.accountId,
                    balance: s.balance,
                    effectiveAnnualRateProjected: rateDecimal,
                    updatedAt: new Date().toISOString(),
                };
            });

            // We need to use put() but ensure we use the same ID if it exists to update.
            // But db.accountSnapshots allows finding by [periodId+accountId].
            // Dexie 'put' will update if primary key provided. Our PK is 'id'.
            // Uniqueness is logically (periodId, accountId).
            // Let's do a transaction.
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

            alert('Snapshots guardados correctamente');
        } catch (error) {
            console.error(error);
            alert('Error al guardar snapshots');
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

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Cuenta</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead>Saldo Actual</TableHead>
                                <TableHead>% E.A. Proyectado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field, index) => (
                                <TableRow key={field.id}>
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
                                                            type="number"
                                                            {...f}
                                                            onChange={e => f.onChange(e.target.valueAsNumber)}
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
                                                                type="number"
                                                                className="pr-6"
                                                                {...f}
                                                                onChange={e => f.onChange(e.target.valueAsNumber)}
                                                            />
                                                            <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">%</span>
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {fields.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        No hay cuentas activas registradas. Ve a la sección de Cuentas para crear una.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </form>
        </Form>
    );
}
