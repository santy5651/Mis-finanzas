'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Zap } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/lib/finance/categories';
import { deleteExpenseWithLedger, saveExpenseWithLedger } from '@/lib/finance/ledger';
import { parseQuickExpense, type PaymentSource } from '@/lib/finance/quick-expense';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

const LAST_SOURCE_KEY = 'quick-expense:last-source';

function readLastSource(): string | null {
    try { return window.localStorage.getItem(LAST_SOURCE_KEY); } catch { return null; }
}

function rememberSource(id: string) {
    try { window.localStorage.setItem(LAST_SOURCE_KEY, id); } catch { /* storage unavailable: nothing to remember */ }
}

/**
 * One-line expense capture for daily use: "comida 50000", "uber 12k nu". Always dated today,
 * whatever period the page shows, and written through the ledger like any other expense.
 */
export function QuickExpenseBar() {
    const sourcesQuery = useLiveQuery(async (): Promise<PaymentSource[]> => {
        const [accounts, cards] = await Promise.all([
            db.accounts.filter(item => item.isActive).toArray(),
            db.obligations.filter(item => item.isActive && item.direction === 'PAYABLE' && item.type === 'CREDIT_CARD').toArray(),
        ]);
        const salary = accounts.find(item => item.isSalaryAccount);
        return [
            ...accounts.map(item => ({ id: item.id, kind: 'ACCOUNT' as const, name: item.name, currency: item.currency })),
            ...cards.map(item => ({ id: item.id, kind: 'CARD' as const, name: item.name, currency: item.currency })),
        ].sort((a, b) => Number(b.id === salary?.id) - Number(a.id === salary?.id));
    });
    const sources = useMemo(() => sourcesQuery ?? [], [sourcesQuery]);
    const [text, setText] = useState('');
    const [categoryOverride, setCategoryOverride] = useState<ExpenseCategory | null>(null);
    const [sourceOverride, setSourceOverride] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; saved?: Expense } | null>(null);

    const parsed = useMemo(() => text.trim() ? parseQuickExpense(text, sources) : null, [text, sources]);
    const defaultSourceId = sources.some(item => item.id === readLastSource()) ? readLastSource() : sources[0]?.id ?? null;
    const sourceId = sourceOverride ?? parsed?.sourceId ?? defaultSourceId;
    const source = sources.find(item => item.id === sourceId);
    const category = categoryOverride ?? parsed?.category ?? 'OTHER';

    const reset = () => { setText(''); setCategoryOverride(null); setSourceOverride(null); };

    const save = async () => {
        if (!parsed?.amount || !source) {
            setResult({ tone: 'error', text: !source ? 'Crea primero una cuenta para registrar gastos.' : 'Escribe el monto, por ejemplo: comida 50000.' });
            return;
        }
        setBusy(true);
        const date = format(new Date(), 'yyyy-MM-dd');
        const expense: Expense = {
            id: uuidv4(),
            date,
            periodId: date.slice(0, 7),
            reason: parsed.description,
            amount: parsed.amount,
            currency: source.currency,
            method: source.kind === 'CARD' ? 'CREDIT_CARD' : 'DEBIT',
            installments: 1,
            category,
        };
        try {
            await saveExpenseWithLedger(expense, source.kind === 'CARD' ? { kind: 'CREDIT_CARD', obligationId: source.id } : { kind: 'ACCOUNT', accountId: source.id });
            rememberSource(source.id);
            const saved = await db.expenses.get(expense.id);
            setResult({ tone: 'success', text: `${EXPENSE_CATEGORY_LABELS[category]} · ${parsed.description} · ${formatCurrency(parsed.amount, source.currency)} desde ${source.name}`, saved });
            reset();
        } catch (error) {
            setResult({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible guardar el gasto.' });
        } finally {
            setBusy(false);
        }
    };

    const undo = async (expense: Expense) => {
        try {
            await deleteExpenseWithLedger(expense);
            setResult({ tone: 'success', text: 'Gasto deshecho.' });
        } catch (error) {
            setResult({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible deshacer el gasto.' });
        }
    };

    const selectClass = 'h-8 rounded-lg border bg-white px-2 text-xs';
    return (
        <div className="rounded-xl border bg-white p-3 shadow-sm">
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); save(); }}>
                <div className="relative flex-1">
                    <Zap className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-emerald-600" />
                    <Input
                        className="pl-9"
                        value={text}
                        onChange={event => { setText(event.target.value); setResult(null); }}
                        placeholder="Gasto rápido: comida 50000 · uber 12k nu · mercado 80 mil tarjeta rappi"
                        aria-label="Gasto rápido"
                    />
                </div>
                <Button type="submit" disabled={busy || !parsed?.amount}>Guardar</Button>
            </form>
            {parsed && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-900">{parsed.amount ? formatCurrency(parsed.amount, source?.currency ?? 'COP') : 'Falta el monto'}</span>
                    <span>·</span>
                    <span>{parsed.description}</span>
                    <select className={selectClass} value={category} onChange={event => setCategoryOverride(event.target.value as ExpenseCategory)} aria-label="Categoría">
                        {EXPENSE_CATEGORIES.map(item => <option key={item} value={item}>{EXPENSE_CATEGORY_LABELS[item]}</option>)}
                    </select>
                    <select className={selectClass} value={sourceId ?? ''} onChange={event => setSourceOverride(event.target.value)} aria-label="Pagado con">
                        {sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    {parsed.candidates.length > 0 && !sourceOverride && (
                        <span className="text-amber-700">¿Cuál? {parsed.candidates.map(id => (
                            <button key={id} type="button" className="ml-1 underline" onClick={() => setSourceOverride(id)}>{sources.find(item => item.id === id)?.name}</button>
                        ))}</span>
                    )}
                    <span className="text-slate-400">hoy</span>
                </div>
            )}
            {result && (
                <p className={`mt-2 text-xs ${result.tone === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {result.tone === 'success' && result.saved ? 'Guardado: ' : ''}{result.text}
                    {result.saved && <button type="button" className="ml-2 font-medium underline" onClick={() => undo(result.saved!)}>Deshacer</button>}
                </p>
            )}
        </div>
    );
}
