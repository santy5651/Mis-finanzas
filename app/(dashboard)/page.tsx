'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Check, CreditCard, ReceiptText, RefreshCw, Sparkles, WalletCards } from 'lucide-react';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { DashboardSummary } from '@/components/dashboard/dashboard-summary';
import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { db } from '@/lib/db/db';
import { dateInsidePeriod } from '@/lib/finance/period';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
    const { periodId } = useActivePeriod();
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-sm font-medium text-emerald-700">Panorama mensual</p>
                    <h1 className="page-title">Tu situación financiera</h1>
                    <p className="page-description">Consulta lo que tienes, lo que debes y cómo cambió tu patrimonio durante el periodo.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <TrmEditor key={`${periodId}-${period?.usdCopRate ?? 'empty'}`} periodId={periodId} initialRate={period?.usdCopRate ?? null} locked={period?.status === 'CLOSED'} />
                    <PeriodSelector />
                </div>
            </div>

            <DashboardSummary />

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-950">Tendencias</h2>
                    <p className="text-sm text-slate-500">La evolución histórica ayuda a separar un cambio puntual de una tendencia.</p>
                </div>
                <DashboardCharts />
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-950">Actualizar este mes</h2>
                    <p className="text-sm text-slate-500">Completa estos pasos para que el resumen sea preciso.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <QuickAction href={`/cierre?period=${periodId}`} title="Completar cierre" description="Saldos, conciliación y TRM en cinco pasos." icon={WalletCards} />
                    <QuickAction href={`/movimientos?period=${periodId}`} title="Registrar movimientos" description="Ingresos, gastos y transferencias enlazados." icon={ReceiptText} />
                    <QuickAction href={`/ingresos-proyectados?period=${periodId}`} title="Revisar planificación" description="Separa salario, gastos y rendimiento esperado." icon={Sparkles} />
                    <QuickAction href={`/obligaciones?period=${periodId}`} title="Revisar obligaciones" description="Tarjetas, deudas y cuentas por cobrar." icon={CreditCard} />
                </div>
            </section>
        </div>
    );
}

function TrmEditor({ periodId, initialRate, locked }: { periodId: string; initialRate: number | null; locked: boolean }) {
    const [rate, setRate] = useState<number | ''>(initialRate ?? '');
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(false);

    const save = async () => {
        const existing = await db.periods.get(periodId);
        const [year, month] = periodId.split('-').map(Number);
        await db.periods.put({ ...(existing ?? { id: periodId, year, month, status: 'OPEN' as const }), usdCopRate: rate === '' ? null : rate, trmDate: dateInsidePeriod(periodId), trmSource: 'MANUAL' });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
    };
    const loadOfficial = async () => {
        setLoading(true);
        try {
            const date = dateInsidePeriod(periodId);
            const response = await fetch(`/api/trm?date=${date}`);
            const data = await response.json();
            if (!response.ok) return;
            setRate(data.value);
            const existing = await db.periods.get(periodId);
            const [year, month] = periodId.split('-').map(Number);
            await db.periods.put({ ...(existing ?? { id: periodId, year, month, status: 'OPEN' as const }), usdCopRate: data.value, trmDate: date, trmValidFrom: data.validFrom, trmValidTo: data.validTo, trmSource: 'SFC' });
            setSaved(true);
        } finally { setLoading(false); }
    };

    return (
        <div className="flex items-center gap-1.5 rounded-xl border bg-white p-1 shadow-sm">
            <label htmlFor="trm" className="pl-2 text-xs font-medium text-slate-500">TRM</label>
            <Input
                id="trm"
                type="number"
                min="0"
                step="0.01"
                placeholder="USD/COP"
                className="h-9 w-28 border-0 bg-slate-50 shadow-none"
                value={rate}
                onChange={event => setRate(Number.isNaN(event.target.valueAsNumber) ? '' : event.target.valueAsNumber)}
                disabled={locked}
            />
            <Button variant="ghost" size="icon" onClick={loadOfficial} disabled={locked || loading} title="Consultar TRM oficial"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
            <Button variant="ghost" size="sm" onClick={save} disabled={locked} className={saved ? 'text-emerald-700' : ''}>
                {saved ? <><Check /> Guardada</> : 'Guardar'}
            </Button>
        </div>
    );
}

function QuickAction({ href, title, description, icon: Icon }: { href: string; title: string; description: string; icon: typeof WalletCards }) {
    return (
        <Link href={href} className="group flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
            <span className="rounded-xl bg-slate-100 p-2.5 text-slate-700 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700"><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-xs leading-relaxed text-slate-500">{description}</span></span>
            <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </Link>
    );
}
