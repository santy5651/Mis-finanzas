'use client';

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowRight, CircleAlert, Shuffle } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Account, AccountPlan, AccountSnapshot, FinancialEventType, ReturnKind } from '@/lib/types';
import type { calculateAccountReconciliation } from '@/lib/finance/reconciliation';
import { estimateMovement, impliedAnnualRate, isPlausibleInterest, planAnnualRate, suggestTransfers, type TransferSuggestion } from '@/lib/finance/assistant';
import { isSignificant, roundMoney } from '@/lib/finance/currency';
import { saveFinancialEvent } from '@/lib/finance/ledger';
import { dateInsidePeriod, parseAmountInput } from '@/lib/finance/period';
import { RETURN_KIND_LABELS } from '@/lib/finance/returns';
import { FinancialEventForm } from '@/components/forms/financial-event-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

export type ReconciliationRow = ReturnType<typeof calculateAccountReconciliation> & {
    account: Account;
    current: AccountSnapshot;
    previous?: AccountSnapshot;
    plan?: AccountPlan;
    expected: number;
};

type Classification = Extract<FinancialEventType, 'INCOME' | 'EXPENSE' | 'PASSIVE_RETURN' | 'ADJUSTMENT'>;
type Notify = (tone: 'success' | 'error', text: string) => void;

const percent = (value: number) => `${(value * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`;
const suggestionKey = (item: TransferSuggestion) => `${item.fromAccountId}>${item.toAccountId}`;

export function ReconciliationAssistant({ periodId, nextPeriodId, locked, rows, onMessage }: {
    periodId: string;
    nextPeriodId: string;
    locked: boolean;
    rows: ReconciliationRow[];
    onMessage: Notify;
}) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [transferAmounts, setTransferAmounts] = useState<Record<string, string>>({});
    const [interestAmounts, setInterestAmounts] = useState<Record<string, string>>({});
    const [showManualTransfer, setShowManualTransfer] = useState(false);
    const accountById = useMemo(() => new Map(rows.map(row => [row.account.id, row.account])), [rows]);

    const pending = rows.filter(row => isSignificant(row.unexplained, row.account.currency));
    const suggestions = suggestTransfers(pending.map(row => ({
        accountId: row.account.id,
        currency: row.account.currency,
        estimate: estimateMovement(row.unexplained, row.expected, row.account),
    }))).filter(item => !dismissed.has(suggestionKey(item)));

    const run = async (action: () => Promise<void>, success: string) => {
        try {
            await action();
            onMessage('success', success);
        } catch (error) {
            onMessage('error', error instanceof Error ? error.message : 'No fue posible guardar el cambio.');
        }
    };

    const registerTransfer = (item: TransferSuggestion) => {
        const from = accountById.get(item.fromAccountId)!;
        const to = accountById.get(item.toAccountId)!;
        const amount = parseAmountInput(transferAmounts[suggestionKey(item)]) ?? item.amount;
        if (amount <= 0) { onMessage('error', 'El monto del traslado debe ser mayor que cero.'); return; }
        return run(() => saveFinancialEvent(
            { periodId, date: dateInsidePeriod(periodId), type: 'TRANSFER', concept: `Traslado ${from.name} → ${to.name}` },
            [{ accountId: from.id, amount: -amount, currency: from.currency }, { accountId: to.id, amount, currency: to.currency }],
        ).then(() => undefined), `Traslado de ${formatCurrency(amount, from.currency)} registrado. No cuenta como ingreso ni rendimiento.`);
    };

    const classify = (row: ReconciliationRow, type: Classification, amount = row.unexplained, returnKind?: ReturnKind) => run(
        () => saveFinancialEvent(
            {
                periodId,
                date: dateInsidePeriod(periodId),
                type,
                returnKind,
                concept: returnKind ? `${RETURN_KIND_LABELS[returnKind]} (conciliación)` : type === 'INCOME' ? 'Ingreso conciliado' : type === 'EXPENSE' ? 'Gasto conciliado' : 'Ajuste de conciliación',
            },
            [{ accountId: row.account.id, amount, currency: row.account.currency }],
        ).then(() => undefined),
        `Diferencia de ${row.account.name} clasificada. El saldo real no fue modificado.`,
    );

    const registerStatedInterest = (row: ReconciliationRow) => {
        const amount = parseAmountInput(interestAmounts[row.account.id]) ?? roundMoney(row.expected, row.account.currency);
        if (amount <= 0 || amount > row.unexplained) {
            onMessage('error', `Los intereses deben ser mayores que cero y no superar ${formatCurrency(row.unexplained, row.account.currency)}.`);
            return;
        }
        return classify(row, 'PASSIVE_RETURN', amount, 'INTEREST');
    };

    const applyRateNextMonth = (row: ReconciliationRow, annualRate: number) => run(async () => {
        const nextPeriod = await db.periods.get(nextPeriodId);
        if (nextPeriod?.status === 'CLOSED') throw new Error(`El periodo ${nextPeriodId} está cerrado.`);
        const existing = await db.accountPlans.where('[periodId+accountId]').equals([nextPeriodId, row.account.id]).first();
        const base = existing ?? row.plan;
        const now = new Date().toISOString();
        const monthly = base?.type === 'VARIABLE_MONTHLY';
        await db.accountPlans.put({
            id: existing?.id ?? uuidv4(),
            periodId: nextPeriodId,
            accountId: row.account.id,
            concept: base?.concept ?? 'Rendimiento',
            type: monthly ? 'VARIABLE_MONTHLY' : 'FIXED_EA',
            rateEA: monthly ? undefined : annualRate,
            rateMonthly: monthly ? (Math.pow(1 + annualRate, 1 / 12) - 1) * 100 : undefined,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
    }, `Tasa de ${row.account.name} para ${nextPeriodId} actualizada a ${percent(annualRate)} E.A.`);

    return (
        <div className="space-y-4">
            {suggestions.length > 0 && (
                <Card className="border-blue-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Shuffle className="size-4" /> Posibles traslados entre tus cuentas</CardTitle>
                        <CardDescription>Una cuenta perdió y otra ganó un monto parecido. Si fue un movimiento tuyo, regístralo como traslado: no es ingreso, gasto ni rendimiento. Lo que sobre después serán los intereses.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {suggestions.map(item => {
                            const key = suggestionKey(item);
                            const from = accountById.get(item.fromAccountId)!;
                            const to = accountById.get(item.toAccountId)!;
                            return (
                                <div key={key} className="flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="flex items-center gap-2 font-medium">{from.name} <ArrowRight className="size-4" /> {to.name}</p>
                                        <p className="text-xs text-slate-500">Salieron ≈ {formatCurrency(Math.abs(item.fromEstimate), item.currency)} sin explicar · llegaron ≈ {formatCurrency(item.toEstimate, item.currency)} sin explicar (descontando el interés esperado)</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Input className="h-9 w-40" type="number" min="0" step="any" disabled={locked} value={transferAmounts[key] ?? String(item.amount)} onChange={event => setTransferAmounts(values => ({ ...values, [key]: event.target.value }))} aria-label="Monto trasladado" />
                                        <Button size="sm" disabled={locked} onClick={() => registerTransfer(item)}>Sí, fue un traslado</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setDismissed(values => new Set(values).add(key))}>No</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Conciliación por cuenta</CardTitle>
                    <CardDescription>Para cada diferencia, el asistente pregunta qué pasó. Nada se clasifica solo: una diferencia no es rendimiento hasta que lo confirmes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {rows.map(row => (
                        <AccountRow
                            key={row.account.id}
                            row={row}
                            locked={locked}
                            nextPeriodId={nextPeriodId}
                            interestValue={interestAmounts[row.account.id]}
                            onInterestChange={value => setInterestAmounts(values => ({ ...values, [row.account.id]: value }))}
                            onClassify={(type, returnKind) => classify(row, type, row.unexplained, returnKind)}
                            onStatedInterest={() => registerStatedInterest(row)}
                            onUseRate={rate => applyRateNextMonth(row, rate)}
                        />
                    ))}
                    {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Guarda los saldos para comenzar la conciliación.</p>}
                    <div className="rounded-xl border border-dashed p-3">
                        <button type="button" className="text-sm font-medium text-slate-700 hover:underline" onClick={() => setShowManualTransfer(open => !open)}>
                            {showManualTransfer ? 'Ocultar' : '¿Moviste dinero entre cuentas y no aparece arriba? Regístralo aquí'}
                        </button>
                        {showManualTransfer && <div className="mt-3"><FinancialEventForm defaultType="TRANSFER" /></div>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function AccountRow({ row, locked, nextPeriodId, interestValue, onInterestChange, onClassify, onStatedInterest, onUseRate }: {
    row: ReconciliationRow;
    locked: boolean;
    nextPeriodId: string;
    interestValue?: string;
    onInterestChange: (value: string) => void;
    onClassify: (type: Classification, returnKind?: ReturnKind) => void;
    onStatedInterest: () => void;
    onUseRate: (annualRate: number) => void;
}) {
    const { account, unexplained, expected } = row;
    const currency = account.currency;
    const pending = isSignificant(unexplained, currency);
    const market = account.returnBehavior === 'MARKET_VALUE';
    const plausible = !market && isPlausibleInterest(unexplained, expected, row.openingBalance);
    const implied = !market ? impliedAnnualRate(row.passiveReturn, row.openingBalance) : null;
    const planned = planAnnualRate(row.plan);
    const rateDiffers = implied !== null && (planned === null || Math.abs(implied - planned) >= 0.005);

    return (
        <div className="rounded-xl border p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="font-semibold">{account.name}{market && <span className="ml-2 text-xs font-normal text-slate-500">valor de mercado</span>}</p>
                    <p className="text-xs text-slate-500">
                        Inicial {formatCurrency(row.openingBalance, currency)} · Ingresos {formatCurrency(row.externalIncome, currency)} · Traslados {formatCurrency(row.transfers, currency)} · Gastos y ajustes {formatCurrency(row.expenses + row.adjustments, currency)} · Rendimiento registrado {formatCurrency(row.passiveReturn, currency)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">Interés esperado {formatCurrency(expected, currency)}</p>
                    <p className={pending ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{pending ? `Sin explicar ${formatCurrency(unexplained, currency)}` : 'Conciliado'}</p>
                </div>
            </div>

            {pending && market && (
                <Question text="¿Este cambio fue por valorización o moviste dinero? Si fue un aporte o retiro desde otra cuenta tuya, regístralo como traslado.">
                    <Button size="sm" disabled={locked} onClick={() => onClassify('PASSIVE_RETURN', 'UNREALIZED_VALUATION')}>{unexplained >= 0 ? 'Valorización no realizada' : 'Pérdida no realizada'}</Button>
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('PASSIVE_RETURN', 'REALIZED_GAIN')}>Resultado realizado</Button>
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('ADJUSTMENT')}>Ajuste explicado</Button>
                </Question>
            )}

            {pending && !market && plausible && (
                <Question text={expected > 0
                    ? `¿Son los intereses del mes? La diferencia está en línea con lo esperado (${formatCurrency(expected, currency)}).`
                    : `¿Son los intereses del mes? No hay tasa planificada; la diferencia equivale al ${percent(unexplained / row.openingBalance)} del saldo inicial.`}>
                    <Button size="sm" disabled={locked} onClick={() => onClassify('PASSIVE_RETURN', 'INTEREST')}>Sí, son intereses</Button>
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('INCOME')}>Fue un ingreso externo</Button>
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('ADJUSTMENT')}>Ajuste explicado</Button>
                </Question>
            )}

            {pending && !market && !plausible && unexplained > 0 && (
                <div className="mt-3 space-y-3">
                    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0" />Es demasiado para ser solo intereses: probablemente incluye un traslado o un ingreso. Registra primero los intereses que muestra tu banco y clasifica el resto.</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input className="h-9 w-44" type="number" min="0" step="any" disabled={locked} placeholder="Intereses del extracto" value={interestValue ?? String(roundMoney(Math.max(0, expected), currency))} onChange={event => onInterestChange(event.target.value)} aria-label="Intereses según el extracto" />
                        <Button size="sm" disabled={locked} onClick={onStatedInterest}>Registrar intereses</Button>
                        <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('INCOME')}>Todo es ingreso externo</Button>
                        <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('ADJUSTMENT')}>Ajuste explicado</Button>
                    </div>
                </div>
            )}

            {pending && !market && unexplained < 0 && (
                <Question text="Salió dinero que no está registrado. Si fue a otra cuenta tuya, regístralo como traslado; si no, clasifícalo.">
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('EXPENSE')}>Fue un gasto</Button>
                    <Button size="sm" variant="outline" disabled={locked} onClick={() => onClassify('ADJUSTMENT')}>Ajuste explicado</Button>
                </Question>
            )}

            {rateDiffers && implied !== null && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Tasa implícita del mes ≈ {percent(implied)} E.A.{planned !== null ? ` · plan ${percent(planned)}` : ' · sin tasa planificada'}</span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => onUseRate(implied)}>Usar desde {nextPeriodId}</Button>
                </div>
            )}
        </div>
    );
}

function Question({ text, children }: { text: string; children: React.ReactNode }) {
    return (
        <div className="mt-3 space-y-2">
            <p className="text-sm text-slate-700">{text}</p>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
}
