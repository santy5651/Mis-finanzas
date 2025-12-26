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
import { Plus, PiggyBank, Briefcase, Building } from 'lucide-react';
import { DeleteButton } from '@/components/ui/delete-button';

export default function AccountsPage() {
    const [open, setOpen] = useState(false);

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
        const cat = curr.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(curr);
        return acc;
    }, {} as Record<string, typeof accounts>);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Cuentas e Inversiones</h1>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Cuenta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Registrar Nueva Cuenta</DialogTitle>
                            <DialogDescription>
                                Agrega una cuenta bancaria, inversión o efectivo para seguimiento.
                            </DialogDescription>
                        </DialogHeader>
                        <AccountForm onSuccess={() => setOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Agrupación por Categoría */}
            {Object.entries(accountsByCategory).map(([category, items]) => (
                <div key={category} className="space-y-4">
                    <h2 className="text-xl font-semibold capitalize text-muted-foreground">
                        {category.replace(/_/g, ' ').toLowerCase()}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {items.map(account => (
                            <Card key={account.id} className={`${!account.isActive ? 'opacity-60' : ''}`}>
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
                                            Cuenta de Nómina
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            ))}

            {accounts.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    No hay cuentas registradas. Comienza agregando una.
                </div>
            )}
        </div>
    );
}
