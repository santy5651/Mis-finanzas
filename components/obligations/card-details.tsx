'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '@/lib/db/db';
import type { Expense, FinancialEvent, Obligation, ObligationEntry } from '@/lib/types';
import { cardCharges, creditUsage, daysUntil, installmentPlan, nextMonthlyDate } from '@/lib/finance/cards';
import { parseAmountInput } from '@/lib/finance/period';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

export function CardDetails({ card, balance, periodId, cardExpenses, events, entries }: {
    card: Obligation;
    balance: number;
    periodId: string;
    cardExpenses: Expense[];
    events: FinancialEvent[];
    entries: ObligationEntry[];
}) {
    const today = new Date();
    const usage = creditUsage(balance, card.creditLimit);
    const plan = installmentPlan(cardExpenses, periodId);
    const charges = cardCharges(card.id, events, entries);
    const due = card.dueDay ? nextMonthlyDate(card.dueDay, today) : null;
    const dueIn = due ? daysUntil(due, today) : null;

    return (
        <div className="space-y-3 text-xs text-slate-600">
            {usage !== null && card.creditLimit ? (
                <div>
                    <div className="flex justify-between"><span>Cupo usado {Math.round(usage * 100)}%</span><span>Disponible {formatCurrency(Math.max(0, card.creditLimit - balance), card.currency)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${usage >= 0.8 ? 'bg-rose-500' : usage >= 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, usage * 100)}%` }} /></div>
                </div>
            ) : <p className="text-slate-400">Sin cupo configurado.</p>}
            <div className="grid grid-cols-2 gap-2">
                <Info label="Corte" value={card.statementDay ? `Día ${card.statementDay}` : '—'} />
                <Info label="Pago" value={due ? `${format(due, "d 'de' MMM", { locale: es })}${dueIn === 0 ? ' · hoy' : ` · en ${dueIn} día(s)`}` : '—'} warn={dueIn !== null && dueIn <= 5 && balance > 0} />
                <Info label="Cuotas del mes (estimado)" value={formatCurrency(plan.dueThisPeriod, card.currency)} />
                <Info label="Intereses y cuota de manejo" value={formatCurrency(charges.interest + charges.fees, card.currency)} warn={charges.interest > 0} />
            </div>
            {plan.active.length > 0 && (
                <div className="space-y-1">
                    <p className="font-medium text-slate-700">Compras a cuotas activas</p>
                    {plan.active.map(item => (
                        <p key={item.expense.id} className="flex justify-between gap-2"><span className="truncate">{item.expense.reason}</span><span className="shrink-0">{formatCurrency(item.monthly, card.currency)} · faltan {item.remaining}/{item.expense.installments}</span></p>
                    ))}
                </div>
            )}
        </div>
    );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
    return <div className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-500">{label}</p><p className={`font-medium ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p></div>;
}

export function CardSettingsDialog({ card, onClose, onSaved }: { card: Obligation | null; onClose: () => void; onSaved: () => void }) {
    if (!card) return null;
    return <CardSettingsForm key={card.id} card={card} onClose={onClose} onSaved={onSaved} />;
}

function CardSettingsForm({ card, onClose, onSaved }: { card: Obligation; onClose: () => void; onSaved: () => void }) {
    const [limit, setLimit] = useState(card.creditLimit ? String(card.creditLimit) : '');
    const [statementDay, setStatementDay] = useState(card.statementDay ? String(card.statementDay) : '');
    const [dueDay, setDueDay] = useState(card.dueDay ? String(card.dueDay) : '');
    const [error, setError] = useState<string | null>(null);

    const day = (raw: string) => {
        const value = parseAmountInput(raw);
        return value === null ? undefined : Number.isInteger(value) && value >= 1 && value <= 31 ? value : NaN;
    };
    const save = async () => {
        const creditLimit = parseAmountInput(limit) ?? undefined;
        const statement = day(statementDay);
        const due = day(dueDay);
        if ((creditLimit !== undefined && creditLimit <= 0) || Number.isNaN(statement) || Number.isNaN(due)) {
            setError('El cupo debe ser mayor que cero y los días deben estar entre 1 y 31.');
            return;
        }
        await db.obligations.update(card.id, { creditLimit, statementDay: statement, dueDay: due, updatedAt: new Date().toISOString() });
        onSaved();
    };

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Configurar {card.name}</DialogTitle>
                    <DialogDescription>Estos datos alimentan el cupo disponible y el aviso de pago. No cambian ningún saldo.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1"><Label>Cupo total ({card.currency})</Label><Input type="number" min="0" value={limit} onChange={event => setLimit(event.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Día de corte</Label><Input type="number" min="1" max="31" value={statementDay} onChange={event => setStatementDay(event.target.value)} /></div>
                        <div className="space-y-1"><Label>Día de pago</Label><Input type="number" min="1" max="31" value={dueDay} onChange={event => setDueDay(event.target.value)} /></div>
                    </div>
                    {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
                    <Button className="w-full" onClick={save}>Guardar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
