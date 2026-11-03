'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Check } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { PlannedCashFlow } from '@/lib/types';
import { saveExpenseWithLedger } from '@/lib/finance/ledger';
import { dateInsidePeriod, parseAmountInput } from '@/lib/finance/period';
import { isPlannedExpensePaid } from '@/lib/finance/planning';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

/** Fixed expenses planned for the month, each turned into a real expense with one click when it is paid. */
export function PlannedExpensesCard({ periodId, locked }: { periodId: string; locked: boolean }) {
    const flows = useLiveQuery(() => db.plannedCashFlows.where('periodId').equals(periodId).filter(flow => flow.type === 'EXPENSE').toArray(), [periodId]) ?? [];
    const events = useLiveQuery(() => db.financialEvents.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const expenses = useLiveQuery(() => db.expenses.where('periodId').equals(periodId).toArray(), [periodId]) ?? [];
    const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    if (!flows.length) return null;

    const pay = async (flow: PlannedCashFlow) => {
        const account = accounts.find(item => item.id === flow.accountId);
        const amount = parseAmountInput(amounts[flow.id] ?? '') ?? flow.amount;
        if (!account) { setMessage({ tone: 'error', text: `La cuenta de “${flow.concept}” ya no existe.` }); return; }
        if (amount <= 0) { setMessage({ tone: 'error', text: 'El monto debe ser mayor que cero.' }); return; }
        try {
            await saveExpenseWithLedger(
                { id: uuidv4(), periodId, date: dateInsidePeriod(periodId), reason: flow.concept, amount, currency: account.currency, method: 'DEBIT', installments: 1, paymentAccountId: account.id },
                { kind: 'ACCOUNT', accountId: account.id },
                { plannedCashFlowId: flow.id },
            );
            setMessage({ tone: 'success', text: `${flow.concept} quedó registrado como gasto real desde ${account.name}.` });
        } catch (error) {
            setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible registrar el gasto.' });
        }
    };

    const pending = flows.filter(flow => !isPlannedExpensePaid(flow, events, expenses)).length;
    return (
        <Card>
            <CardHeader>
                <CardTitle>Gastos fijos del mes</CardTitle>
                <CardDescription>Vienen de tu Plan del mes. Mientras no confirmes que los pagaste son solo previstos: no descuentan la cuenta ni cuentan como gasto real. {pending > 0 ? `${pending === 1 ? 'Queda 1' : `Quedan ${pending}`} por confirmar.` : 'Todos están registrados.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {message && <p className={message.tone === 'success' ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800' : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'}>{message.text}</p>}
                {flows.map(flow => {
                    const paid = isPlannedExpensePaid(flow, events, expenses);
                    const account = accounts.find(item => item.id === flow.accountId);
                    return (
                        <div key={flow.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="font-medium">{flow.concept}</p>
                                <p className="text-xs text-slate-500">{account?.name ?? 'Cuenta'} · previsto {formatCurrency(flow.amount, flow.currency)}</p>
                            </div>
                            {paid
                                ? <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><Check className="size-4" /> Pagado</span>
                                : <div className="flex items-center gap-2">
                                    <Input className="h-9 w-36" type="number" min="0" step="any" disabled={locked} value={amounts[flow.id] ?? String(flow.amount)} onChange={event => setAmounts(values => ({ ...values, [flow.id]: event.target.value }))} aria-label={`Monto pagado de ${flow.concept}`} />
                                    <Button size="sm" disabled={locked} onClick={() => pay(flow)}>Ya lo pagué</Button>
                                </div>}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
