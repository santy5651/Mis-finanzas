'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, CircleDollarSign, Plus, WalletCards } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Account, AccountCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { AccountForm } from '@/components/forms/account-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { EditButton } from '@/components/ui/edit-button';

type AccountWithEntity = Account & { entityName: string };

const categoryLabels: Record<AccountCategory, string> = {
    CASH: 'Efectivo',
    LOW_AMOUNT_ACCOUNT: 'Bajo monto',
    SAVINGS: 'Ahorro',
    EMERGENCY_FUND: 'Emergencias',
    INVEST_SHORT: 'Corto plazo',
    INVEST_MEDIUM: 'Mediano plazo',
    INVEST_LONG: 'Largo plazo',
    RETIREMENT: 'Retiro',
    OTHER: 'Otra',
};

function getCategories(account: Account): AccountCategory[] {
    return account.categories?.length ? account.categories : ['OTHER'];
}

export default function AccountsPage() {
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AccountWithEntity | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const accounts = useLiveQuery(async () => {
        const [items, entities] = await Promise.all([db.accounts.toArray(), db.entities.toArray()]);
        const entityMap = new Map(entities.map(entity => [entity.id, entity.name]));
        return items
            .map(account => ({ ...account, entityName: entityMap.get(account.entityId) ?? 'Sin entidad' }))
            .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'es'));
    }) ?? [];

    const activeCount = accounts.filter(account => account.isActive).length;
    const usdCount = accounts.filter(account => account.currency === 'USD' && account.isActive).length;

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null);
    };

    const deleteAccount = async (account: Account) => {
        const [snapshots, movements, projected, entries, plans] = await Promise.all([
            db.accountSnapshots.where('accountId').equals(account.id).count(),
            db.accountMovements.where('accountId').equals(account.id).count(),
            db.projectedIncomeItems.where('accountId').equals(account.id).count(),
            db.accountEntries.where('accountId').equals(account.id).count(),
            db.accountPlans.where('accountId').equals(account.id).count(),
        ]);
        const references = snapshots + movements + projected + entries + plans;
        if (references > 0) {
            setMessage(`Esta cuenta tiene ${references} registros históricos. Desactívala en lugar de eliminarla para conservarlos.`);
            return;
        }
        await db.accounts.delete(account.id);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-emerald-700">Organización</p>
                    <h1 className="page-title">Cuentas e inversiones</h1>
                    <p className="page-description">Cada producto aparece una sola vez; las etiquetas indican cómo participa en tus cálculos.</p>
                </div>
                <Dialog open={open} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild><Button onClick={() => setEditingItem(null)}><Plus /> Nueva cuenta</Button></DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingItem ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
                            <DialogDescription>Define la entidad, moneda y las categorías que describen el producto.</DialogDescription>
                        </DialogHeader>
                        <AccountForm onSuccess={() => setOpen(false)} defaultValues={editingItem ?? undefined} />
                    </DialogContent>
                </Dialog>
            </div>
            {message && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

            <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat icon={WalletCards} label="Cuentas registradas" value={accounts.length} />
                <MiniStat icon={Building2} label="Activas" value={activeCount} />
                <MiniStat icon={CircleDollarSign} label="Activas en USD" value={usdCount} />
            </div>

            <Card>
                <CardHeader className="border-b">
                    <CardTitle>Todos los productos</CardTitle>
                    <CardDescription>Desactivar una cuenta la oculta de los totales sin borrar su historia.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                    <Table className="financial-table">
                        <TableHeader><TableRow>
                            <TableHead>Cuenta</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead>Clasificación</TableHead>
                            <TableHead>Moneda</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {accounts.length === 0 && <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">Aún no has creado ninguna cuenta.</TableCell></TableRow>}
                            {accounts.map(account => (
                                <TableRow key={account.id} className={!account.isActive ? 'opacity-60' : ''}>
                                    <TableCell><span className="font-medium text-slate-900">{account.name}</span><span className="block text-xs text-slate-500">{account.entityName}</span></TableCell>
                                    <TableCell className="max-w-52 whitespace-normal text-slate-600">{account.accountType}</TableCell>
                                    <TableCell><div className="flex max-w-72 flex-wrap gap-1">{getCategories(account).map(category => <Badge key={category} variant="secondary">{categoryLabels[category]}</Badge>)}{account.returnBehavior === 'MARKET_VALUE' && <Badge variant="outline">Valor de mercado</Badge>}{account.isRestricted && <Badge variant="outline" className="border-amber-300 text-amber-800">Restringida</Badge>}{account.legalHolder && <Badge variant="outline">Titular: {account.legalHolder}</Badge>}</div></TableCell>
                                    <TableCell><Badge variant="outline">{account.currency}</Badge></TableCell>
                                    <TableCell><button type="button" onClick={() => db.accounts.update(account.id, { isActive: !account.isActive })} className={account.isActive ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'}>{account.isActive ? 'Activa' : 'Inactiva'}</button></TableCell>
                                    <TableCell><div className="flex justify-end gap-1"><EditButton onClick={() => { setEditingItem(account); setOpen(true); }} /><DeleteButton onDelete={() => deleteAccount(account)} itemName="cuenta" description="Solo puede eliminarse si todavía no tiene registros históricos." /></div></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: number }) {
    return <Card className="gap-3 py-4"><CardContent className="flex items-center gap-3"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Icon className="size-4" /></span><span><span className="block text-xs text-slate-500">{label}</span><span className="text-xl font-semibold text-slate-950">{value}</span></span></CardContent></Card>;
}
