'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { ArrowDownToLine, ArrowUpFromLine, CreditCard, HandCoins, Plus } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Currency, Obligation, ObligationDirection, ObligationType } from '@/lib/types';
import { saveFinancialEvent } from '@/lib/finance/ledger';
import { dateInsidePeriod } from '@/lib/finance/period';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';

type ActionKind = 'INCREASE' | 'DECREASE';

export default function ObligationsPage() {
    const { periodId } = useActivePeriod();
    const obligations = useLiveQuery(() => db.obligations.toArray()) ?? [];
    const entitiesQuery = useLiveQuery(() => db.entities.toArray());
    const entities = useMemo(() => entitiesQuery ?? [], [entitiesQuery]);
    const accounts = useLiveQuery(() => db.accounts.filter(item => item.isActive).toArray()) ?? [];
    const snapshots = useLiveQuery(() => db.obligationSnapshots.toArray()) ?? [];
    const currentEntries = useLiveQuery(() => db.obligationEntries.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const [createOpen, setCreateOpen] = useState(false);
    const [actionTarget, setActionTarget] = useState<Obligation | null>(null);
    const [actionKind, setActionKind] = useState<ActionKind>('DECREASE');
    const [message, setMessage] = useState<string | null>(null);
    const entityMap = useMemo(() => new Map(entities.map(item => [item.id, item.name])), [entities]);

    const getBalance = (obligation: Obligation) => {
        const current = snapshots.find(item => item.periodId === periodId && item.obligationId === obligation.id);
        if (current) return current.balance;
        const previous = snapshots
            .filter(item => item.obligationId === obligation.id && item.periodId < periodId)
            .sort((a, b) => b.periodId.localeCompare(a.periodId))[0];
        const delta = currentEntries.filter(item => item.obligationId === obligation.id).reduce((sum, item) => sum + item.amount, 0);
        return Math.max(0, (previous?.balance ?? 0) + delta);
    };

    const renderList = (direction: ObligationDirection) => {
        const items = obligations.filter(item => item.direction === direction && item.isActive);
        return (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map(item => {
                    const balance = getBalance(item);
                    return (
                        <Card key={item.id}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div><CardTitle className="text-base">{item.name}</CardTitle><CardDescription>{entityMap.get(item.entityId) ?? 'Sin entidad'} · {item.currency}</CardDescription></div>
                                    <span className={direction === 'PAYABLE' ? 'rounded-lg bg-amber-100 p-2 text-amber-700' : 'rounded-lg bg-emerald-100 p-2 text-emerald-700'}>{item.type === 'CREDIT_CARD' ? <CreditCard className="size-4" /> : <HandCoins className="size-4" />}</span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div><p className="text-xs text-slate-500">Saldo del periodo</p><p className="text-2xl font-semibold">{formatCurrency(balance, item.currency)}</p></div>
                                <div className="flex gap-2">
                                    <Button variant="outline" className="flex-1" onClick={() => { setActionTarget(item); setActionKind('INCREASE'); }}><ArrowUpFromLine />{direction === 'PAYABLE' ? 'Cargo' : 'Prestar'}</Button>
                                    <Button className="flex-1" onClick={() => { setActionTarget(item); setActionKind('DECREASE'); }}><ArrowDownToLine />{direction === 'PAYABLE' ? 'Pagar' : 'Cobrar'}</Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {items.length === 0 && <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No hay obligaciones en esta categoría.</div>}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-sm font-medium text-emerald-700">Compromisos</p><h1 className="page-title">Obligaciones</h1><p className="page-description">Separa lo que debes de lo que otras personas te deben y registra cada pago o cobro.</p></div>
                <div className="flex gap-2"><PeriodSelector /><Button onClick={() => setCreateOpen(true)}><Plus /> Nueva obligación</Button></div>
            </div>
            {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
            <Tabs defaultValue="payable">
                <TabsList><TabsTrigger value="payable">Yo debo</TabsTrigger><TabsTrigger value="receivable">Me deben</TabsTrigger></TabsList>
                <TabsContent value="payable" className="mt-5">{renderList('PAYABLE')}</TabsContent>
                <TabsContent value="receivable" className="mt-5">{renderList('RECEIVABLE')}</TabsContent>
            </Tabs>
            <CreateObligationDialog open={createOpen} onOpenChange={setCreateOpen} periodId={periodId} locked={period?.status === 'CLOSED'} entities={entities} onSaved={() => setMessage('Obligación creada. Su saldo inicial quedó registrado sin considerarse ingreso o rendimiento.')} />
            <ObligationActionDialog open={Boolean(actionTarget)} onOpenChange={open => !open && setActionTarget(null)} obligation={actionTarget} actionKind={actionKind} accounts={accounts} periodId={periodId} locked={period?.status === 'CLOSED'} onSaved={() => { setActionTarget(null); setMessage('Movimiento de obligación registrado y enlazado.'); }} />
        </div>
    );
}

function CreateObligationDialog({ open, onOpenChange, periodId, locked, entities, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; periodId: string; locked: boolean; entities: Array<{ id: string; name: string }>; onSaved: () => void }) {
    const [name, setName] = useState(''); const [entityId, setEntityId] = useState(''); const [direction, setDirection] = useState<ObligationDirection>('PAYABLE');
    const [type, setType] = useState<ObligationType>('CREDIT_CARD'); const [currency, setCurrency] = useState<Currency>('COP'); const [balance, setBalance] = useState('0'); const [dueDay, setDueDay] = useState(''); const [error, setError] = useState<string | null>(null);
    const save = async () => {
        if (locked) { setError('Reabre el mes antes de crear una obligación: su saldo inicial se guarda en este periodo.'); return; }
        const parsed = Number(balance);
        if (!name.trim() || !entityId || !Number.isFinite(parsed) || parsed < 0) { setError('Completa nombre, entidad y saldo inicial.'); return; }
        const id = uuidv4(); const now = new Date().toISOString();
        await db.transaction('rw', db.obligations, db.obligationSnapshots, async () => {
            await db.obligations.add({ id, entityId, name: name.trim(), direction, type: direction === 'RECEIVABLE' ? 'RECEIVABLE' : type, currency, dueDay: dueDay ? Number(dueDay) : undefined, isActive: true, createdAt: now, updatedAt: now });
            await db.obligationSnapshots.add({ id: uuidv4(), periodId, obligationId: id, balance: parsed, createdAt: now, updatedAt: now });
        });
        onOpenChange(false); onSaved(); setName(''); setBalance('0'); setError(null);
    };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Nueva obligación</DialogTitle><DialogDescription>El saldo inicial establece el punto de partida y no se trata como ingreso.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Dirección</Label><Select value={direction} onValueChange={value => setDirection(value as ObligationDirection)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PAYABLE">Yo debo</SelectItem><SelectItem value="RECEIVABLE">Me deben</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Nombre</Label><Input value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Tarjeta Rappi o préstamo a Ana" /></div><div className="space-y-1"><Label>Persona o entidad</Label><Select value={entityId} onValueChange={setEntityId}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{entities.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>{direction === 'PAYABLE' && <div className="space-y-1"><Label>Tipo</Label><Select value={type} onValueChange={value => setType(value as ObligationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CREDIT_CARD">Tarjeta de crédito</SelectItem><SelectItem value="PERSONAL">Personal</SelectItem><SelectItem value="LOAN">Préstamo</SelectItem><SelectItem value="OTHER">Otra</SelectItem></SelectContent></Select></div>}<div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Moneda</Label><Select value={currency} onValueChange={value => setCurrency(value as Currency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COP">COP</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Saldo inicial</Label><Input type="number" min="0" value={balance} onChange={event => setBalance(event.target.value)} /></div></div><div className="space-y-1"><Label>Día de vencimiento (opcional)</Label><Input type="number" min="1" max="31" value={dueDay} onChange={event => setDueDay(event.target.value)} /></div>{error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}<Button className="w-full" onClick={save}>Crear obligación</Button></div></DialogContent></Dialog>;
}

function ObligationActionDialog({ open, onOpenChange, obligation, actionKind, accounts, periodId, locked, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; obligation: Obligation | null; actionKind: ActionKind; accounts: Array<{ id: string; name: string; currency: Currency }>; periodId: string; locked: boolean; onSaved: () => void }) {
    const [amount, setAmount] = useState(''); const [accountId, setAccountId] = useState(''); const [concept, setConcept] = useState(''); const [error, setError] = useState<string | null>(null);
    if (!obligation) return null;
    const needsAccount = obligation.direction === 'RECEIVABLE' || actionKind === 'DECREASE';
    const save = async () => {
        if (locked) { setError('Reabre el mes antes de registrar este movimiento.'); return; }
        const parsed = Number(amount); const account = accounts.find(item => item.id === accountId);
        if (!Number.isFinite(parsed) || parsed <= 0 || (needsAccount && (!account || account.currency !== obligation.currency))) { setError('Ingresa un monto válido y una cuenta de la misma moneda.'); return; }
        const increase = actionKind === 'INCREASE';
        const type = obligation.direction === 'PAYABLE' ? (increase ? 'EXPENSE' : 'OBLIGATION_PAYMENT') : (increase ? 'RECEIVABLE_LOAN' : 'RECEIVABLE_COLLECTION');
        const accountAmount = account ? (obligation.direction === 'RECEIVABLE' ? (increase ? -parsed : parsed) : -parsed) : 0;
        await saveFinancialEvent({ id: uuidv4(), periodId, date: dateInsidePeriod(periodId), type, concept: concept.trim() || (increase ? 'Aumento de obligación' : 'Reducción de obligación'), obligationId: obligation.id }, account ? [{ accountId: account.id, amount: accountAmount, currency: account.currency }] : [], [{ obligationId: obligation.id, amount: increase ? parsed : -parsed, currency: obligation.currency }]);
        setAmount(''); setConcept(''); setError(null); onSaved();
    };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{actionKind === 'INCREASE' ? (obligation.direction === 'PAYABLE' ? 'Registrar cargo' : 'Registrar préstamo') : (obligation.direction === 'PAYABLE' ? 'Registrar pago' : 'Registrar cobro')}</DialogTitle><DialogDescription>Se crearán las entradas enlazadas necesarias; no se duplicará como ingreso o gasto al mover el dinero.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Monto ({obligation.currency})</Label><Input type="number" min="0" value={amount} onChange={event => setAmount(event.target.value)} /></div>{needsAccount && <div className="space-y-1"><Label>{actionKind === 'DECREASE' && obligation.direction === 'PAYABLE' ? 'Cuenta desde la que pagas' : 'Cuenta relacionada'}</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger><SelectContent>{accounts.filter(item => item.currency === obligation.currency).map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-1"><Label>Concepto</Label><Input value={concept} onChange={event => setConcept(event.target.value)} /></div>{error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}<Button className="w-full" onClick={save}>Guardar movimiento</Button></div></DialogContent></Dialog>;
}
