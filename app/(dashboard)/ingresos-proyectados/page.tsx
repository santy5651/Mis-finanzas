'use client';

import { useMemo, useState } from 'react';
import { format, parse, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { AccountPlan, Currency, PlannedCashFlow, PlannedCashFlowType } from '@/lib/types';
import { expectedPassiveReturn } from '@/lib/finance/reconciliation';
import { convertToCop } from '@/lib/finance/currency';
import { copyRecurringPlan } from '@/lib/finance/recurring';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DeleteButton } from '@/components/ui/delete-button';
import { EditButton } from '@/components/ui/edit-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

export default function PlanningPage() {
    const { periodId } = useActivePeriod();
    const previousPeriodId = useMemo(() => format(subMonths(parse(periodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM'), [periodId]);
    const accounts = useLiveQuery(() => db.accounts.filter(item => item.isActive).toArray()) ?? [];
    const plans = useLiveQuery(() => db.accountPlans.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const flows = useLiveQuery(() => db.plannedCashFlows.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const snapshots = useLiveQuery(() => db.accountSnapshots.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const previousSnapshots = useLiveQuery(() => db.accountSnapshots.where('periodId').equals(previousPeriodId).toArray(), [previousPeriodId]) ?? [];
    const period = useLiveQuery(async () => (await db.periods.get(periodId)) ?? null, [periodId]);
    const [flowOpen, setFlowOpen] = useState(false);
    const [editingFlow, setEditingFlow] = useState<PlannedCashFlow | null>(null);
    const [copyOpen, setCopyOpen] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const locked = period?.status === 'CLOSED';

    const balanceFor = (accountId: string) => snapshots.find(item => item.accountId === accountId)?.balance ?? previousSnapshots.find(item => item.accountId === accountId)?.balance ?? 0;
    const expectedReturn = plans.reduce((sum, plan) => {
        const account = accounts.find(item => item.id === plan.accountId);
        const snapshot = snapshots.find(item => item.accountId === plan.accountId);
        return sum + convertToCop(expectedPassiveReturn(balanceFor(plan.accountId), plan), account?.currency ?? 'COP', period ?? undefined, snapshot);
    }, 0);
    const expectedIncome = flows.filter(item => item.type !== 'EXPENSE').reduce((sum, item) => sum + convertToCop(item.amount, item.currency, period ?? undefined), 0);
    const expectedExpenses = flows.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + convertToCop(item.amount, item.currency, period ?? undefined), 0);

    const upsertPlan = async (accountId: string, patch: Partial<AccountPlan>) => {
        if (locked) return;
        const existing = plans.find(item => item.accountId === accountId); const now = new Date().toISOString();
        await db.accountPlans.put({ id: existing?.id ?? uuidv4(), periodId, accountId, concept: existing?.concept ?? 'Rendimiento', type: existing?.type ?? 'FIXED_EA', createdAt: existing?.createdAt ?? now, updatedAt: now, ...existing, ...patch });
    };
    const copyPrevious = async () => {
        if (locked) return;
        try {
            const copied = await copyRecurringPlan(periodId, previousPeriodId);
            setMessage(`Se copiaron ${copied.plans} tasa(s) y ${copied.flows} flujo(s) recurrente(s). Los ingresos únicos no se repitieron.`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No fue posible copiar la planificación recurrente.');
        } finally {
            setCopyOpen(false);
        }
    };

    return <div className="space-y-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-medium text-emerald-700">Planificación</p><h1 className="page-title">Plan del mes</h1><p className="page-description">Compara por separado ingresos externos, rendimiento pasivo y gastos previstos.</p></div><div className="flex gap-2"><Button variant="outline" disabled={locked} onClick={() => setCopyOpen(true)}>Copiar recurrentes</Button><PeriodSelector /></div></div>{locked && <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">El periodo está cerrado. Reábrelo desde Cierre mensual para modificar su planificación.</div>}{message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}<div className="grid gap-4 md:grid-cols-3"><Metric title="Ingresos externos esperados" value={expectedIncome} /><Metric title="Rendimiento pasivo esperado" value={expectedReturn} /><Metric title="Gastos esperados" value={expectedExpenses} negative /></div>
        <Card><CardHeader><CardTitle>Tasas esperadas por cuenta</CardTitle><CardDescription>Solo estas tasas alimentan el rendimiento pasivo esperado; el salario se muestra aparte.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead>Modelo</TableHead><TableHead>Tasa</TableHead><TableHead>Saldo base</TableHead><TableHead>Rendimiento esperado</TableHead></TableRow></TableHeader><TableBody>{accounts.map(account => { const plan = plans.find(item => item.accountId === account.id); const balance = balanceFor(account.id); return <TableRow key={account.id}><TableCell className="font-medium">{account.name}</TableCell><TableCell><Select disabled={locked} value={plan?.type ?? 'FIXED_EA'} onValueChange={value => upsertPlan(account.id, { type: value as AccountPlan['type'] })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED_EA">Tasa EA</SelectItem><SelectItem value="VARIABLE_MONTHLY">Tasa mensual</SelectItem></SelectContent></Select></TableCell><TableCell><div className="flex items-center gap-2"><Input disabled={locked} className="w-28" type="number" step="any" value={plan?.type === 'VARIABLE_MONTHLY' ? plan.rateMonthly ?? 0 : (plan?.rateEA ?? 0) * 100} onChange={event => { const value = Number(event.target.value); upsertPlan(account.id, plan?.type === 'VARIABLE_MONTHLY' ? { rateMonthly: value } : { rateEA: value / 100 }); }} /><span className="text-xs text-slate-500">%</span></div></TableCell><TableCell>{formatCurrency(balance, account.currency)}</TableCell><TableCell>{formatCurrency(expectedPassiveReturn(balance, plan), account.currency)}</TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Ingresos y gastos previstos</CardTitle><CardDescription>Usa “Copiar recurrentes” (o Preparar en el cierre) para traer salarios y gastos recurrentes del mes anterior; los únicos no se repiten.</CardDescription></div><Button disabled={locked} onClick={() => { setEditingFlow(null); setFlowOpen(true); }}><Plus /> Agregar previsto</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Recurrente</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="w-24" /></TableRow></TableHeader><TableBody>{flows.map(flow => <TableRow key={flow.id}><TableCell>{accounts.find(item => item.id === flow.accountId)?.name ?? 'Cuenta'}</TableCell><TableCell>{flow.type === 'SALARY' ? 'Salario' : flow.type === 'OTHER_INCOME' ? 'Otro ingreso' : 'Gasto'}</TableCell><TableCell>{flow.concept}</TableCell><TableCell>{flow.isRecurring ? 'Sí' : 'No'}</TableCell><TableCell className="text-right">{formatCurrency(flow.amount, flow.currency)}</TableCell><TableCell>{!locked && <div className="flex justify-end gap-1"><EditButton onClick={() => { setEditingFlow(flow); setFlowOpen(true); }} /><DeleteButton itemName="flujo previsto" onDelete={() => db.plannedCashFlows.delete(flow.id)} /></div>}</TableCell></TableRow>)}{flows.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">No hay flujos previstos.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        <PlannedFlowDialog open={flowOpen} onOpenChange={setFlowOpen} periodId={periodId} accounts={accounts} flow={editingFlow} onSaved={edited => setMessage(edited ? 'Flujo previsto actualizado.' : 'Flujo previsto guardado. No se contará como real hasta registrar el movimiento.')} />
        <AlertDialog open={copyOpen} onOpenChange={setCopyOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Copiar recurrentes de {previousPeriodId}</AlertDialogTitle><AlertDialogDescription>Se copiarán tasas, salarios y gastos marcados como recurrentes. Los ingresos únicos se omitirán y no se crearán movimientos reales.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); copyPrevious(); }}>Copiar recurrentes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>;
}

function Metric({ title, value, negative }: { title: string; value: number; negative?: boolean }) { return <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent><p className={negative ? 'text-2xl font-semibold text-rose-700' : 'text-2xl font-semibold text-slate-950'}>{formatCurrency(value)}</p></CardContent></Card>; }

function PlannedFlowDialog({ open, onOpenChange, ...props }: { open: boolean; onOpenChange: (value: boolean) => void } & PlannedFlowFormProps) {
    // The key remounts the form on every opening, so it always starts from the flow being edited (or blank).
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{props.flow ? 'Editar flujo previsto' : 'Nuevo flujo previsto'}</DialogTitle><DialogDescription>Planificar no modifica ningún saldo real.</DialogDescription></DialogHeader><PlannedFlowForm key={open ? props.flow?.id ?? 'new' : 'closed'} {...props} onSaved={edited => { onOpenChange(false); props.onSaved(edited); }} /></DialogContent></Dialog>;
}

interface PlannedFlowFormProps { periodId: string; accounts: Array<{ id: string; name: string; currency: Currency }>; flow: PlannedCashFlow | null; onSaved: (edited: boolean) => void }

function PlannedFlowForm({ periodId, accounts, flow, onSaved }: PlannedFlowFormProps) {
    const [accountId, setAccountId] = useState(flow?.accountId ?? ''); const [type, setType] = useState<PlannedCashFlowType>(flow?.type ?? 'SALARY'); const [concept, setConcept] = useState(flow?.concept ?? 'Salario'); const [amount, setAmount] = useState(flow ? String(flow.amount) : ''); const [recurring, setRecurring] = useState(flow?.isRecurring ?? true); const [error, setError] = useState<string | null>(null);
    const save = async () => {
        const account = accounts.find(item => item.id === accountId); const parsed = Number(amount);
        if (!account || !Number.isFinite(parsed) || parsed <= 0 || !concept.trim()) { setError('Completa cuenta, concepto y monto.'); return; }
        const now = new Date().toISOString(); const values = { accountId, type, concept: concept.trim(), amount: parsed, currency: account.currency, isRecurring: recurring, updatedAt: now };
        if (flow) await db.plannedCashFlows.update(flow.id, values);
        else await db.plannedCashFlows.add({ id: uuidv4(), periodId, createdAt: now, ...values });
        onSaved(Boolean(flow));
    };
    return <div className="space-y-3"><div className="space-y-1"><Label>Cuenta</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{accounts.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Tipo</Label><Select value={type} onValueChange={value => { const next = value as PlannedCashFlowType; setType(next); if (next === 'SALARY' && !flow) setConcept('Salario'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SALARY">Salario</SelectItem><SelectItem value="OTHER_INCOME">Otro ingreso</SelectItem><SelectItem value="EXPENSE">Gasto</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Concepto</Label><Input value={concept} onChange={event => setConcept(event.target.value)} /></div><div className="space-y-1"><Label>Monto</Label><Input type="number" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></div><label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={recurring} onCheckedChange={value => setRecurring(Boolean(value))} /> Repetir en meses siguientes</label>{error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}<Button className="w-full" onClick={save}>{flow ? 'Guardar cambios' : 'Guardar previsto'}</Button></div>;
}
