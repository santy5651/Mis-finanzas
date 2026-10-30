'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { createBackup, getBackupRecordCount, parseBackup, restoreBackup, type BackupPayload } from '@/lib/db/backup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { EntityForm } from '@/components/forms/entity-form';
import { Building2, Database, Download, Plus, ShieldCheck, Upload } from 'lucide-react';
import { DeleteButton } from '@/components/ui/delete-button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const entityTypeLabels: Record<string, string> = {
    BANK: 'Banco',
    FRANCHISE: 'Comercio',
    PERSON: 'Persona',
    EMPLOYER: 'Empleador',
    BROKER: 'Plataforma de inversión',
    OTHER: 'Otra',
};

export default function ConfigPage() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const [pendingImport, setPendingImport] = useState<{ backup: BackupPayload; count: number; date: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const entities = useLiveQuery(() => db.entities.toArray()) ?? [];
    const recordCounts = useLiveQuery(async () => {
        const [accounts, snapshots, expenses, debts, obligations] = await Promise.all([
            db.accounts.count(),
            db.accountSnapshots.count(),
            db.expenses.count(),
            db.debts.count(),
            db.obligations.count(),
        ]);
        return { accounts, snapshots, expenses, obligations: obligations || debts };
    }, []) ?? { accounts: 0, snapshots: 0, expenses: 0, obligations: 0 };
    const sortedEntities = [...entities].sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const handleExport = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const payload = await createBackup();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `finanzas-export-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            setMessage({ tone: 'success', text: `Respaldo creado: ${getBackupRecordCount(payload)} registros incluidos.` });
        } catch (error) {
            console.error(error);
            setMessage({ tone: 'error', text: 'No fue posible crear el respaldo. Inténtalo de nuevo.' });
        } finally {
            setBusy(false);
        }
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setBusy(true);
        setMessage(null);
        try {
            const backup = parseBackup(JSON.parse(await file.text()));
            const recordCount = getBackupRecordCount(backup);
            const exportedDate = new Date(backup.exportedAt).toLocaleString('es-CO');
            setPendingImport({ backup, count: recordCount, date: exportedDate });
        } catch (error) {
            console.error(error);
            const detail = error instanceof Error ? error.message : 'El archivo no se pudo leer.';
            setMessage({ tone: 'error', text: `No se importó ningún dato. ${detail}` });
        } finally {
            setBusy(false);
            event.target.value = '';
        }
    };

    const confirmImport = async () => {
        if (!pendingImport) return;
        setBusy(true);
        try {
            await restoreBackup(pendingImport.backup);
            setMessage({ tone: 'success', text: `Importación completa: ${pendingImport.count} registros restaurados y migrados.` });
            setPendingImport(null);
        } catch (error) {
            console.error(error);
            setMessage({ tone: 'error', text: 'No se importó ningún dato. La base anterior permanece intacta.' });
        } finally { setBusy(false); }
    };

    const deleteEntity = async (entityId: string) => {
        const [accounts, expenses, incomes, debts, obligations] = await Promise.all([
            db.accounts.where('entityId').equals(entityId).count(),
            db.expenses.filter(item => item.entityId === entityId).count(),
            db.incomes.filter(item => item.entityId === entityId).count(),
            db.debts.where('entityId').equals(entityId).count(),
            db.obligations.where('entityId').equals(entityId).count(),
        ]);
        const references = accounts + expenses + incomes + debts + obligations;
        if (references > 0) {
            setMessage({ tone: 'error', text: `No se puede eliminar: esta entidad está vinculada a ${references} registros. Primero reasigna esos datos.` });
            return;
        }
        await db.entities.delete(entityId);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-emerald-700">Administración</p>
                    <h1 className="page-title">Datos y entidades</h1>
                    <p className="page-description">Protege tu información y organiza los bancos, personas y plataformas asociados a tus cuentas.</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button><Plus /> Nueva entidad</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nueva entidad</DialogTitle>
                            <DialogDescription>Agrega un banco, una persona, un comercio o una plataforma financiera.</DialogDescription>
                        </DialogHeader>
                        <EntityForm onSuccess={() => setOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70">
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><ShieldCheck className="size-5" /></div>
                        <div>
                            <CardTitle>Respaldo de tus finanzas</CardTitle>
                            <CardDescription className="mt-1">El JSON incluye todas las tablas históricas y puede restaurar esta aplicación completa.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                        {[
                            ['Cuentas', recordCounts.accounts],
                            ['Saldos históricos', recordCounts.snapshots],
                            ['Gastos', recordCounts.expenses],
                            ['Obligaciones', recordCounts.obligations],
                        ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-xl border bg-white/80 p-3">
                                <p className="text-xs text-slate-500">{label}</p>
                                <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={handleExport} disabled={busy}><Download /> Descargar respaldo</Button>
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}><Upload /> Restaurar desde JSON</Button>
                        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
                    </div>
                    <p className="text-xs leading-relaxed text-slate-500">Antes de restaurar otro archivo, descarga una copia del estado actual. El archivo se valida antes de reemplazar cualquier dato.</p>
                    {message && (
                        <div className={message.tone === 'success' ? 'rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800' : 'rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800'}>
                            {message.text}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="border-b">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Building2 className="size-5" /></div>
                        <div>
                            <CardTitle>Entidades registradas</CardTitle>
                            <CardDescription className="mt-1">{sortedEntities.length} entidades disponibles para clasificar cuentas y movimientos.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-1">
                    {sortedEntities.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500"><Database className="mx-auto mb-3 size-8 text-slate-300" />Aún no hay entidades registradas.</div>
                    ) : (
                        <div className="divide-y">
                            {sortedEntities.map(entity => (
                                <div key={entity.id} className="flex items-center justify-between gap-4 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900">{entity.name}</p>
                                        <p className="text-xs text-slate-500">{entityTypeLabels[entity.type ?? 'OTHER'] ?? 'Otra'}{entity.notes ? ` · ${entity.notes}` : ''}</p>
                                    </div>
                                    <DeleteButton onDelete={() => deleteEntity(entity.id)} itemName="entidad" description="Solo se eliminará si no tiene registros asociados." />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            <AlertDialog open={Boolean(pendingImport)} onOpenChange={open => !open && setPendingImport(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Restaurar respaldo validado</AlertDialogTitle><AlertDialogDescription>El archivo contiene {pendingImport?.count ?? 0} registros y fue creado {pendingImport?.date}. Al continuar se reemplazarán los datos de este dispositivo; los respaldos v1 se migrarán al modelo conciliado.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); confirmImport(); }}>{busy ? 'Restaurando…' : 'Restaurar respaldo'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
