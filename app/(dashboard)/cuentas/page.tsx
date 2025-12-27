'use client';

import { useState } from 'react';
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
import { AccountForm } from '@/components/forms/account-form';
import { Plus, PiggyBank } from 'lucide-react';
import { DeleteButton } from '@/components/ui/delete-button';
import { EditButton } from '@/components/ui/edit-button';
import { accountCategorySchema } from '@/lib/validators';
import { LIQUID_CATEGORIES } from '@/lib/calculations/financials';
import { Account } from '@/lib/types';

type AccountWithEntity = Account & { entityName: string };

export default function AccountsPage() {
    const [open, setOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AccountWithEntity | null>(null);

    // Fetch accounts with their entities
    const accounts = useLiveQuery(async () => {
        const accs = await db.accounts.toArray();
        const ents = await db.entities.toArray();
        const entMap = new Map(ents.map(e => [e.id, e]));

        return accs.map(acc => ({
            ...acc,
            entityName: entMap.get(acc.entityId)?.name || 'Sin Entidad'
        }));
    }) || [];

    const accountsByCategory = accounts.reduce((acc, curr) => {
        const categories = curr.categories?.length ? curr.categories : ['OTHER'];
        categories.forEach(cat => {
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(curr);
        });
        return acc;
    }, {} as Record<string, AccountWithEntity[]>);

    const categoryOrder = accountCategorySchema.options;
    const orderedCategories = [
        ...categoryOrder.filter(cat => accountsByCategory[cat]),
        ...Object.keys(accountsByCategory).filter(cat => !categoryOrder.includes(cat as any))
    ];
    const getCategoryLabel = (cat: string) => {
        if (cat === 'CASH') return 'Efectivo';
        if (cat === 'LOW_AMOUNT_ACCOUNT') return 'Cuenta de Bajo Monto';
        if (cat === 'SAVINGS') return 'Ahorros';
        if (cat === 'EMERGENCY_FUND') return 'Fondo de Emergencia';
        if (cat === 'INVEST_SHORT') return 'Bajo Riesgo';
        if (cat === 'INVEST_MEDIUM') return 'Riesgo Moderado';
        if (cat === 'INVEST_LONG') return 'Alto Riesgo';
        if (cat === 'RETIREMENT') return 'Retiro';
        if (cat === 'OTHER') return 'Otro';
        return cat.replace(/_/g, ' ').toLowerCase();
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setEditingItem(null);
    };

    const handleEdit = (account: AccountWithEntity) => {
        setEditingItem(account);
        setOpen(true);
    };

    const isLiquidAccount = (account: AccountWithEntity) => {
        const categories = account.categories?.length ? account.categories : ['OTHER'];
        return categories.some(category => LIQUID_CATEGORIES.includes(category));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Cuentas e Inversiones</h1>
                <Dialog open={open} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setEditingItem(null)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Cuenta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>{editingItem ? 'Editar Cuenta' : 'Registrar Nueva Cuenta'}</DialogTitle>
                            <DialogDescription>
                                Agrega una cuenta bancaria, inversion o efectivo para seguimiento.
                            </DialogDescription>
                        </DialogHeader>
                        <AccountForm
                            onSuccess={() => setOpen(false)}
                            defaultValues={editingItem ? {
                                id: editingItem.id,
                                name: editingItem.name,
                                entityId: editingItem.entityId,
                                accountType: editingItem.accountType,
                                categories: editingItem.categories,
                                currency: editingItem.currency,
                                isSalaryAccount: editingItem.isSalaryAccount ?? false,
                                isActive: editingItem.isActive ?? true
                            } : undefined}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <p className="text-sm text-muted-foreground">
                Las cuentas con fondo azul representan liquidez: dinero de acceso rapido y uso inmediato.
            </p>

            {orderedCategories.map((category) => {
                const items = accountsByCategory[category] || [];
                return (
                    <div key={category} className="space-y-4">
                        <h2 className="text-xl font-semibold capitalize text-muted-foreground">
                            {getCategoryLabel(category)}
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {items.map(account => (
                                <Card
                                    key={account.id}
                                    className={`${!account.isActive ? 'opacity-60' : ''} ${isLiquidAccount(account) ? 'border-blue-200/60 bg-blue-50/60 dark:border-blue-900/30 dark:bg-blue-900/10' : ''}`}
                                >
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <div className="flex items-center space-x-2">
                                            <div className="p-2 bg-primary/10 rounded-full">
                                                <PiggyBank className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="space-y-1">
                                                <CardTitle className="text-base font-medium leading-none">
                                                    {account.name}
                                                </CardTitle>
                                                <p className="text-sm text-muted-foreground">{account.entityName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-1 rounded-full ${account.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {account.currency}
                                            </span>
                                            <EditButton onClick={() => handleEdit(account)} />
                                            <DeleteButton
                                                onDelete={() => db.accounts.delete(account.id)}
                                                itemName="cuenta"
                                            />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xs text-muted-foreground mt-2">
                                            {account.accountType}
                                        </div>
                                        {account.isSalaryAccount && (
                                            <div className="mt-2 text-xs font-semibold text-blue-600">
                                                Cuenta de Nomina
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                );
            })}

            {accounts.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    No hay cuentas registradas. Comienza agregando una.
                </div>
            )}
        </div>
    );
}
