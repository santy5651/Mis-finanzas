'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SnapshotForm } from '@/components/forms/snapshot-form';

export default function SnapshotsPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Fotos Mensuales (Snapshots)</h1>
                    <p className="text-muted-foreground">
                        Registra el saldo de tus cuentas al inicio de cada mes para calcular rendimientos.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Registro de Saldos</CardTitle>
                    <CardDescription>
                        Selecciona el periodo y actualiza los saldos de todas tus cuentas activas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <SnapshotForm />
                </CardContent>
            </Card>
        </div>
    );
}
