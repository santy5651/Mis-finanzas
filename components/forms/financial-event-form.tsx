'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/db';
import { saveFinancialEvent } from '@/lib/finance/ledger';
import { dateInsidePeriod } from '@/lib/finance/period';
import { defaultReturnKind, RETURN_KIND_LABELS, RETURN_KINDS, SIGNED_RETURN_KINDS } from '@/lib/finance/returns';
import type { FinancialEventType, ReturnKind } from '@/lib/types';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FormType = Extract<FinancialEventType, 'INCOME' | 'TRANSFER' | 'PASSIVE_RETURN' | 'ADJUSTMENT'>;

export function FinancialEventForm({ defaultType = 'INCOME', onSuccess }: { defaultType?: FormType; onSuccess?: () => void }) {
    const { periodId } = useActivePeriod();
    const accountsQuery = useLiveQuery(() => db.accounts.filter(item => item.isActive).toArray());
    const accounts = useMemo(() => accountsQuery ?? [], [accountsQuery]);
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const [type, setType] = useState<FormType>(defaultType);
    const [incomeKind, setIncomeKind] = useState<'SALARY' | 'OTHER_INCOME'>('SALARY');
    const [accountId, setAccountId] = useState('');
    const [destinationId, setDestinationId] = useState('');
    const [amount, setAmount] = useState('');
    const [destinationAmount, setDestinationAmount] = useState('');
    const [concept, setConcept] = useState(type === 'INCOME' ? 'Ingreso' : '');
    const [date, setDate] = useState(dateInsidePeriod(periodId));
    const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
    const [chosenReturnKind, setChosenReturnKind] = useState<ReturnKind | null>(null);
    const [isLoss, setIsLoss] = useState(false);
    const source = useMemo(() => accounts.find(item => item.id === accountId), [accounts, accountId]);
    const returnKind = chosenReturnKind ?? defaultReturnKind(source);
    const canBeLoss = SIGNED_RETURN_KINDS.includes(returnKind);
    const destination = useMemo(() => accounts.find(item => item.id === destinationId), [accounts, destinationId]);
    useEffect(() => { setDate(dateInsidePeriod(periodId)); }, [periodId]);

    const submit = async () => {
        setMessage(null);
        if (period?.status === 'CLOSED') {
            setMessage({ tone: 'error', text: 'Reabre el mes antes de registrar movimientos.' });
            return;
        }
        const parsed = Number(amount);
        if (!source || !Number.isFinite(parsed) || parsed <= 0 || !concept.trim()) {
            setMessage({ tone: 'error', text: 'Completa la cuenta, el concepto y un monto mayor que cero.' });
            return;
        }
        try {
            if (type === 'TRANSFER') {
                const crossCurrency = destination !== undefined && destination.currency !== source.currency;
                if (crossCurrency && !destinationAmount.trim()) {
                    setMessage({ tone: 'error', text: `Indica cuánto llegó en ${destination.currency}; las monedas de las cuentas son distintas.` });
                    return;
                }
                const received = Number(destinationAmount || amount);
                if (!destination || destination.id === source.id || !Number.isFinite(received) || received <= 0) {
                    setMessage({ tone: 'error', text: 'Selecciona una cuenta destino distinta e indica el monto recibido.' });
                    return;
                }
                await saveFinancialEvent({
                    id: uuidv4(), periodId, date, type, concept: concept.trim(),
                }, [
                    { accountId: source.id, amount: -parsed, currency: source.currency },
                    { accountId: destination.id, amount: received, currency: destination.currency },
                ]);
            } else {
                const signed = type === 'PASSIVE_RETURN' && canBeLoss && isLoss ? -parsed : parsed;
                await saveFinancialEvent({
                    id: uuidv4(), periodId, date, type, concept: concept.trim(),
                    incomeKind: type === 'INCOME' ? incomeKind : undefined,
                    returnKind: type === 'PASSIVE_RETURN' ? returnKind : undefined,
                }, [{ accountId: source.id, amount: signed, currency: source.currency }]);
            }
            setAmount('');
            setDestinationAmount('');
            setIsLoss(false);
            setConcept(type === 'INCOME' ? 'Ingreso' : '');
            setMessage({ tone: 'success', text: 'Movimiento registrado y enlazado correctamente.' });
            onSuccess?.();
        } catch (error) {
            setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible guardar el movimiento.' });
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={type} onValueChange={value => setType(value as FormType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="INCOME">Ingreso externo</SelectItem>
                            <SelectItem value="TRANSFER">Transferencia entre cuentas</SelectItem>
                            <SelectItem value="PASSIVE_RETURN">Rendimiento o beneficio</SelectItem>
                            <SelectItem value="ADJUSTMENT">Ajuste explicado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
                <Label>{type === 'TRANSFER' ? 'Cuenta origen' : 'Cuenta afectada'}</Label>
                <Select value={accountId} onValueChange={value => { setAccountId(value); setChosenReturnKind(null); }}>
                    <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
                    <SelectContent>{accounts.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.currency}{item.isSalaryAccount ? ' · Nómina' : ''}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            {type === 'INCOME' && <div className="space-y-1.5"><Label>Clase de ingreso</Label><Select value={incomeKind} onValueChange={value => { const next = value as typeof incomeKind; setIncomeKind(next); if (next === 'SALARY' && (!concept.trim() || concept === 'Ingreso')) setConcept('Salario'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SALARY">Salario</SelectItem><SelectItem value="OTHER_INCOME">Otro ingreso externo</SelectItem></SelectContent></Select></div>}
            {type === 'PASSIVE_RETURN' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Naturaleza</Label>
                        <Select value={returnKind} onValueChange={value => setChosenReturnKind(value as ReturnKind)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{RETURN_KINDS.map(kind => <SelectItem key={kind} value={kind}>{RETURN_KIND_LABELS[kind]}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    {canBeLoss && (
                        <label className="flex items-center gap-2 self-end pb-2 text-sm">
                            <input type="checkbox" checked={isLoss} onChange={event => setIsLoss(event.target.checked)} /> Es una pérdida
                        </label>
                    )}
                </div>
            )}
            {type === 'TRANSFER' && (
                <div className="space-y-1.5">
                    <Label>Cuenta destino</Label>
                    <Select value={destinationId} onValueChange={setDestinationId}>
                        <SelectTrigger><SelectValue placeholder="Selecciona destino" /></SelectTrigger>
                        <SelectContent>{accounts.filter(item => item.id !== accountId).map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.currency}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>{type === 'TRANSFER' ? `Monto enviado (${source?.currency ?? ''})` : 'Monto'}</Label><Input type="number" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></div>
                {type === 'TRANSFER' && <div className="space-y-1.5"><Label>Monto recibido ({destination?.currency ?? ''})</Label><Input type="number" min="0" step="any" value={destinationAmount} onChange={event => setDestinationAmount(event.target.value)} placeholder={source?.currency === destination?.currency ? amount : ''} /></div>}
            </div>
            <div className="space-y-1.5"><Label>Concepto</Label><Input value={concept} onChange={event => setConcept(event.target.value)} placeholder="Ej. Salario, aporte a inversión, intereses" /></div>
            {type === 'TRANSFER' && source && destination && source.currency !== destination.currency && Number(amount) > 0 && Number(destinationAmount) > 0 && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Tasa efectiva: {(Number(destinationAmount) / Number(amount)).toLocaleString('es-CO', { maximumFractionDigits: 6 })} {destination.currency}/{source.currency}</p>
            )}
            {message && <div className={message.tone === 'success' ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700' : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'}>{message.text}</div>}
            <Button type="button" className="w-full" onClick={submit}>Guardar movimiento</Button>
        </div>
    );
}
