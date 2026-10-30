'use client';

import { useState } from 'react';
import type { AccountEntry, FinancialEvent } from '@/lib/types';
import { PAIRABLE_TYPES, pairEventsAsTransfer } from '@/lib/finance/ledger';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

export type PairableEvent = { event: FinancialEvent; entry: AccountEntry };

/** One-sided events on a single account: the shape a reconciliation leaves for a missed transfer. */
export function findPairableEvents(events: FinancialEvent[], entries: AccountEntry[], obligationEventIds: Set<string>): PairableEvent[] {
    return events.flatMap(event => {
        if (!PAIRABLE_TYPES.includes(event.type) || event.expenseId || event.incomeId || obligationEventIds.has(event.id)) return [];
        const own = entries.filter(entry => entry.eventId === event.id);
        return own.length === 1 ? [{ event, entry: own[0] }] : [];
    });
}

export function PairTransferDialog({ source, candidates, accountNames, onClose, onPaired }: {
    source: PairableEvent | null;
    candidates: PairableEvent[];
    accountNames: Map<string, string>;
    onClose: () => void;
    onPaired: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    if (!source) return null;
    const matches = candidates.filter(item => item.entry.accountId !== source.entry.accountId
        && item.entry.currency === source.entry.currency
        && Math.sign(item.entry.amount) === -Math.sign(source.entry.amount));
    const outgoingFirst = source.entry.amount < 0;

    const pair = async (other: PairableEvent) => {
        setError(null);
        try {
            const [outgoing, incoming] = outgoingFirst ? [source, other] : [other, source];
            await pairEventsAsTransfer(outgoing.event.id, incoming.event.id);
            onPaired();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No fue posible convertir el movimiento.');
        }
    };

    return (
        <Dialog open onOpenChange={open => { if (!open) { setError(null); onClose(); } }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Convertir en traslado</DialogTitle>
                    <DialogDescription>
                        {source.event.concept}: {accountNames.get(source.entry.accountId) ?? 'Cuenta'} {formatCurrency(source.entry.amount, source.entry.currency)}.
                        Elige el movimiento de la otra cuenta. Se moverá el menor de los dos montos y el resto conservará su clasificación.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    {matches.map(item => (
                        <div key={item.event.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                            <div>
                                <p className="font-medium">{accountNames.get(item.entry.accountId) ?? 'Cuenta'} {formatCurrency(item.entry.amount, item.entry.currency)}</p>
                                <p className="text-xs text-slate-500">{item.event.date} · {item.event.concept}</p>
                            </div>
                            <Button size="sm" onClick={() => pair(item)}>Emparejar</Button>
                        </div>
                    ))}
                    {matches.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No hay un movimiento de signo contrario en otra cuenta de la misma moneda en este periodo.</p>}
                    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
