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
import { EntityForm } from '@/components/forms/entity-form';
import { Plus, Building2 } from 'lucide-react';
import { DeleteButton } from '@/components/ui/delete-button';

export default function ConfigPage() {
    const [open, setOpen] = useState(false);

    const entities = useLiveQuery(() => db.entities.toArray()) || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Configuración</h1>
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
                            {entities.map(entity => (
                                <div key={entity.id} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                                    <div>
                                        <p className="font-medium">{entity.name}</p>
                                        <p className="text-xs text-muted-foreground">{entity.type}</p>
                                    </div>
                                    <DeleteButton
                                        onDelete={() => db.entities.delete(entity.id)}
                                        itemName="entidad"
                                        description="Si eliminas esta entidad, las cuentas y transacciones asociadas podrían quedar inconsistentes."
                                    />
                                </div>
                            ))}
                            {entities.length === 0 && (
                                <p className="text-sm text-muted-foreground">No hay entidades registradas.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
