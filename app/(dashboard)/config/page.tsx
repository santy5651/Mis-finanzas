'use client';

import { useRef, useState } from 'react';
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
import { EntityForm } from '@/components/forms/entity-form';
import { Plus, Building2 } from 'lucide-react';
import { DeleteButton } from '@/components/ui/delete-button';

export default function ConfigPage() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const getEntityTypeLabel = (type?: string) => {
        if (!type) return 'Otro';
        if (type === 'BANK') return 'Banco';
        if (type === 'FRANCHISE') return 'Comercio';
        if (type === 'PERSON') return 'Persona';
        if (type === 'EMPLOYER') return 'Empleador';
        if (type === 'BROKER') return 'Broker';
        return 'Otro';
    };

    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const sortedEntities = [...entities].sort((a, b) => a.name.localeCompare(b.name));

    const handleExport = async () => {
        setBusy(true);
        try {
            const [
                periods,
                entitiesData,
                accounts,
                accountSnapshots,
                incomes,
                expenses,
                debts
            ] = await Promise.all([
                db.periods.toArray(),
                db.entities.toArray(),
                db.accounts.toArray(),
                db.accountSnapshots.toArray(),
                db.incomes.toArray(),
                db.expenses.toArray(),
                db.debts.toArray()
            ]);

            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                tables: {
                    periods,
                    entities: entitiesData,
                    accounts,
                    accountSnapshots,
                    incomes,
                    expenses,
                    debts
                }
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `finanzas-export-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setBusy(false);
        }
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!confirm('Esto reemplazara todos los datos actuales. Deseas continuar?')) {
            event.target.value = '';
            return;
        }

        setBusy(true);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const tables = parsed?.tables;

            if (!tables) {
                throw new Error('Formato invalido: faltan tablas.');
            }

            const {
                periods = [],
                entities: entitiesData = [],
                accounts = [],
                accountSnapshots = [],
                incomes = [],
                expenses = [],
                debts = []
            } = tables;

            await db.transaction(
                'rw',
                db.periods,
                db.entities,
                db.accounts,
                db.accountSnapshots,
                db.incomes,
                db.expenses,
                db.debts,
                async () => {
                    await Promise.all([
                        db.periods.clear(),
                        db.entities.clear(),
                        db.accounts.clear(),
                        db.accountSnapshots.clear(),
                        db.incomes.clear(),
                        db.expenses.clear(),
                        db.debts.clear()
                    ]);

                    await Promise.all([
                        db.periods.bulkAdd(periods),
                        db.entities.bulkAdd(entitiesData),
                        db.accounts.bulkAdd(accounts),
                        db.accountSnapshots.bulkAdd(accountSnapshots),
                        db.incomes.bulkAdd(incomes),
                        db.expenses.bulkAdd(expenses),
                        db.debts.bulkAdd(debts)
                    ]);
                }
            );

            alert('Importacion completa.');
        } catch (error) {
            console.error(error);
            alert('Error al importar los datos. Verifica el archivo.');
        } finally {
            setBusy(false);
            event.target.value = '';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Configuracion</h1>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Entidad
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Registrar Nueva Entidad</DialogTitle>
                            <DialogDescription>
                                Agrega bancos, personas, comercios o entidades financieras.
                            </DialogDescription>
                        </DialogHeader>
                        <EntityForm onSuccess={() => setOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Building2 className="h-5 w-5" />
                            <span>Entidades Registradas</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {sortedEntities.map(entity => (
                                <div key={entity.id} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                                    <div>
                                        <p className="font-medium">{entity.name}</p>
                                        <p className="text-xs text-muted-foreground">{getEntityTypeLabel(entity.type)}</p>
                                    </div>
                                    <DeleteButton
                                        onDelete={() => db.entities.delete(entity.id)}
                                        itemName="entidad"
                                        description="Si eliminas esta entidad, las cuentas y transacciones asociadas podr｛n quedar inconsistentes."
                                    />
                                </div>
                            ))}
                            {sortedEntities.length === 0 && (
                                <p className="text-sm text-muted-foreground">No hay entidades registradas.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Respaldo de Datos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Exporta o importa toda la informacion almacenada en este dispositivo.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleExport} disabled={busy}>
                                Exportar JSON
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={busy}
                            >
                                Importar JSON
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={async () => {
                                    if (!confirm('Esto eliminara TODOS los datos. Deseas continuar?')) {
                                        return;
                                    }
                                    setBusy(true);
                                    try {
                                        await db.transaction(
                                            'rw',
                                            db.periods,
                                            db.entities,
                                            db.accounts,
                                            db.accountSnapshots,
                                            db.incomes,
                                            db.expenses,
                                            db.debts,
                                            db.projectedIncomes,
                                            async () => {
                                                await Promise.all([
                                                    db.periods.clear(),
                                                    db.entities.clear(),
                                                    db.accounts.clear(),
                                                    db.accountSnapshots.clear(),
                                                    db.incomes.clear(),
                                                    db.expenses.clear(),
                                                    db.debts.clear(),
                                                    db.projectedIncomes.clear()
                                                ]);
                                            }
                                        );
                                        alert('Datos eliminados.');
                                    } catch (error) {
                                        console.error(error);
                                        alert('Error al borrar los datos.');
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                                disabled={busy}
                            >
                                Borrar Todo
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                onChange={handleImportFile}
                                className="hidden"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
