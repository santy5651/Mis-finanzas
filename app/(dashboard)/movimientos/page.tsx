'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Shuffle } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Expense } from '@/lib/types';
import { deleteExpenseWithLedger, deleteFinancialEvent } from '@/lib/finance/ledger';
import { RETURN_KIND_LABELS, resolveReturnKind } from '@/lib/finance/returns';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { ExpenseForm } from '@/components/forms/expense-form';
import { findPairableEvents, PairTransferDialog, type PairableEvent } from '@/components/forms/pair-transfer-dialog';
import { FinancialEventForm } from '@/components/forms/financial-event-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeleteButton } from '@/components/ui/delete-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

const eventLabels: Record<string, string> = {
    INCOME: 'Ingreso externo', EXPENSE: 'Gasto', TRANSFER: 'Transferencia', PASSIVE_RETURN: 'Rendimiento',
    OBLIGATION_PAYMENT: 'Pago de obligación', RECEIVABLE_LOAN: 'Préstamo', RECEIVABLE_COLLECTION: 'Cobro',
    ADJUSTMENT: 'Ajuste', LEGACY_MOVEMENT: 'Movimiento histórico',
};

export default function MovementsPage() {
    const { periodId } = useActivePeriod();
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') === 'gastos' ? 'gastos' : searchParams.get('tab') === 'historial' ? 'historial' : 'registrar';
    const [tab, setTab] = useState(initialTab);
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const events = useLiveQuery(() => db.financialEvents.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const entries = useLiveQuery(() => db.accountEntries.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const expenses = useLiveQuery(() => db.expenses.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
    const obligations = useLiveQuery(() => db.obligations.toArray()) ?? [];
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const obligationEventIds = new Set((useLiveQuery(() => db.obligationEntries.where('periodId').equals(periodId).toArray(), [periodId]) ?? []).map(entry => entry.eventId));
    const pairable = findPairableEvents(events, entries, obligationEventIds);
    const [pairingSource, setPairingSource] = useState<PairableEvent | null>(null);
    const locked = period?.status === 'CLOSED';
    const accountMap = new Map(accounts.map(item => [item.id, item.name]));
    const obligationMap = new Map(obligations.map(item => [item.id, item.name]));
    const transferSignatures = events.filter(event => event.type === 'TRANSFER' && event.legacySourceId).map(event => {
        const signature = entries.filter(entry => entry.eventId === event.id).sort((a, b) => a.accountId.localeCompare(b.accountId)).map(entry => `${entry.accountId}:${entry.amount}`).join('|');
        return `${event.date}:${signature}`;
    });
    const suspectedDuplicates = transferSignatures.length - new Set(transferSignatures).size;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-emerald-700">Libro enlazado</p><h1 className="page-title">Movimientos</h1><p className="page-description">Cada ingreso, gasto o traslado explica una variación sin crear ni desaparecer dinero.</p></div><PeriodSelector /></div>
            {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
            {locked && <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">Este mes está cerrado: puedes consultar los movimientos, pero para borrarlos o registrar nuevos debes reabrirlo desde Cierre mensual.</div>}
            {suspectedDuplicates > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Se detectaron {suspectedDuplicates} posible(s) transferencia(s) histórica(s) duplicada(s). Se conservaron para no borrar operaciones legítimas; revísalas en el historial.</div>}
            <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="registrar">Ingresos y transferencias</TabsTrigger><TabsTrigger value="gastos">Gastos</TabsTrigger><TabsTrigger value="historial">Historial enlazado</TabsTrigger></TabsList>
                <TabsContent value="registrar" className="mt-5"><Card><CardHeader><CardTitle>Registrar movimiento</CardTitle><CardDescription>Los movimientos entre cuentas son neutros para ingreso y patrimonio.</CardDescription></CardHeader><CardContent><FinancialEventForm onSuccess={() => setMessage('Movimiento guardado correctamente.')} /></CardContent></Card></TabsContent>
                <TabsContent value="gastos" className="mt-5"><Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Gastos del mes</CardTitle><CardDescription>La cuenta o tarjeta utilizada es obligatoria.</CardDescription></div><Button onClick={() => { setEditingExpense(null); setExpenseOpen(true); }}><Plus /> Nuevo gasto</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map(expense => <TableRow key={expense.id}><TableCell>{expense.date}</TableCell><TableCell><button className="font-medium hover:underline" onClick={() => { setEditingExpense(expense); setExpenseOpen(true); }}>{expense.reason}</button></TableCell><TableCell>{expense.obligationId ? obligationMap.get(expense.obligationId) ?? 'Tarjeta' : expense.paymentAccountId ? accountMap.get(expense.paymentAccountId) ?? 'Cuenta' : 'Histórico sin conciliar'}</TableCell><TableCell className="text-right">{formatCurrency(expense.amount, expense.currency)}</TableCell><TableCell>{!locked && <DeleteButton itemName="gasto" onDelete={() => deleteExpenseWithLedger(expense)} />}</TableCell></TableRow>)}{expenses.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No hay gastos registrados.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
                <TabsContent value="historial" className="mt-5"><Card><CardHeader><CardTitle>Eventos financieros</CardTitle><CardDescription>Un evento puede contener dos entradas, pero representa un solo hecho económico.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Impacto en cuentas</TableHead><TableHead className="w-20" /></TableRow></TableHeader><TableBody>{[...events].sort((a, b) => b.date.localeCompare(a.date)).map(event => { const eventEntries = entries.filter(item => item.eventId === event.id); return <TableRow key={event.id}><TableCell>{event.date}</TableCell><TableCell>{event.type === 'PASSIVE_RETURN' ? RETURN_KIND_LABELS[resolveReturnKind(event, accounts.find(item => item.id === eventEntries[0]?.accountId))] : eventLabels[event.type] ?? event.type}</TableCell><TableCell>{event.concept}{event.notes?.includes('sin cuenta') && <span className="block text-xs text-amber-700">Legado sin conciliar</span>}</TableCell><TableCell>{eventEntries.length ? eventEntries.map(entry => `${accountMap.get(entry.accountId) ?? 'Cuenta'} ${entry.amount >= 0 ? '+' : ''}${formatCurrency(entry.amount, entry.currency)}`).join(' · ') : 'Sin cuenta enlazada'}</TableCell><TableCell className="whitespace-nowrap">{!locked && pairable.some(item => item.event.id === event.id) && <Button variant="ghost" size="icon" className="h-8 w-8" title="Convertir en traslado" onClick={() => setPairingSource(pairable.find(item => item.event.id === event.id) ?? null)}><Shuffle className="h-4 w-4" /></Button>}{!event.legacySourceId && !locked && <DeleteButton itemName="movimiento" onDelete={() => deleteFinancialEvent(event.id)} />}</TableCell></TableRow>; })}{events.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No hay eventos en el periodo.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
            </Tabs>
            <PairTransferDialog source={pairingSource} candidates={pairable} accountNames={accountMap} onClose={() => setPairingSource(null)} onPaired={() => { setPairingSource(null); setMessage('Movimientos convertidos en un traslado entre tus cuentas.'); }} />
            <Dialog open={expenseOpen} onOpenChange={open => { setExpenseOpen(open); if (!open) setEditingExpense(null); }}><DialogContent><DialogHeader><DialogTitle>{editingExpense ? 'Editar gasto' : 'Registrar gasto'}</DialogTitle></DialogHeader><ExpenseForm defaultValues={editingExpense ? { ...editingExpense, entityId: editingExpense.entityId ?? undefined } : undefined} onSuccess={() => { setExpenseOpen(false); setEditingExpense(null); setMessage('Gasto y su impacto financiero quedaron registrados.'); }} /></DialogContent></Dialog>
        </div>
    );
}
