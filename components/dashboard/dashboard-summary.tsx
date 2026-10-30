'use client';

import { useMemo, useState } from 'react';
import { format, parse, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Landmark, ReceiptText, Sparkles, WalletCards } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { Currency } from '@/lib/types';
import { calculateAccountReconciliation, calculateFxEffect, expectedPassiveReturn } from '@/lib/finance/reconciliation';
import { convertToCop, resolveUsdCopRate } from '@/lib/finance/currency';
import { RETURN_KIND_LABELS, summarizeReturns, type ReturnsSummary } from '@/lib/finance/returns';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

export function DashboardSummary() {
    const { periodId } = useActivePeriod();
    const previousPeriodId = useMemo(() => format(subMonths(parse(periodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM'), [periodId]);
    const data = useLiveQuery(async () => {
        const [accounts, entities, snapshots, previousSnapshots, entries, events, plans, plannedFlows, expenses, period, previousPeriod, obligations, obligationSnapshots, previousObligationSnapshots, obligationEntries] = await Promise.all([
            db.accounts.toArray(), db.entities.toArray(),
            db.accountSnapshots.where('periodId').equals(periodId).toArray(), db.accountSnapshots.where('periodId').equals(previousPeriodId).toArray(),
            db.accountEntries.where('periodId').equals(periodId).toArray(), db.financialEvents.where('periodId').equals(periodId).toArray(),
            db.accountPlans.where('periodId').equals(periodId).toArray(), db.plannedCashFlows.where('periodId').equals(periodId).toArray(),
            db.expenses.where('periodId').equals(periodId).toArray(), db.periods.get(periodId), db.periods.get(previousPeriodId),
            db.obligations.toArray(), db.obligationSnapshots.where('periodId').equals(periodId).toArray(), db.obligationSnapshots.where('periodId').equals(previousPeriodId).toArray(), db.obligationEntries.where('periodId').equals(periodId).toArray(),
        ]);
        const accountMap = new Map(accounts.map(item => [item.id, item]));
        const entityMap = new Map(entities.map(item => [item.id, item.name]));
        const eventMap = new Map(events.map(item => [item.id, item]));
        const previousMap = new Map(previousSnapshots.map(item => [item.accountId, item]));
        const rows = snapshots.flatMap(snapshot => {
            const account = accountMap.get(snapshot.accountId); if (!account) return [];
            const previous = previousMap.get(account.id);
            const calculation = calculateAccountReconciliation(snapshot, previous, entries.filter(item => item.accountId === account.id), events);
            const plan = plans.find(item => item.accountId === account.id);
            const valuationSnapshot = account.currency === 'USD'
                ? { ...snapshot, usdCopRate: resolveUsdCopRate(period, snapshot) ?? undefined }
                : snapshot;
            return [{ account, entity: entityMap.get(account.entityId) ?? 'Sin entidad', snapshot, previous, expected: expectedPassiveReturn(previous?.balance ?? snapshot.balance, plan), fxEffect: account.currency === 'USD' ? calculateFxEffect(previous, valuationSnapshot) : 0, ...calculation }];
        });
        const assets = rows.reduce((sum, row) => sum + convertToCop(row.snapshot.balance, row.account.currency, period, row.snapshot), 0);
        const previousAssets = previousSnapshots.reduce((sum, snapshot) => { const account = accountMap.get(snapshot.accountId); return account ? sum + convertToCop(snapshot.balance, account.currency, previousPeriod, snapshot) : sum; }, 0);
        const obligationBalance = (id: string) => {
            const current = obligationSnapshots.find(item => item.obligationId === id);
            if (current) return current.balance;
            const previous = previousObligationSnapshots.find(item => item.obligationId === id)?.balance ?? 0;
            return Math.max(0, previous + obligationEntries.filter(item => item.obligationId === id).reduce((sum, item) => sum + item.amount, 0));
        };
        const payables = obligations.filter(item => item.direction === 'PAYABLE').reduce((sum, item) => sum + convertToCop(obligationBalance(item.id), item.currency, period), 0);
        const receivables = obligations.filter(item => item.direction === 'RECEIVABLE').reduce((sum, item) => sum + convertToCop(obligationBalance(item.id), item.currency, period), 0);
        const previousPayables = obligations.filter(item => item.direction === 'PAYABLE').reduce((sum, item) => sum + convertToCop(previousObligationSnapshots.find(snapshot => snapshot.obligationId === item.id)?.balance ?? 0, item.currency, previousPeriod), 0);
        const previousReceivables = obligations.filter(item => item.direction === 'RECEIVABLE').reduce((sum, item) => sum + convertToCop(previousObligationSnapshots.find(snapshot => snapshot.obligationId === item.id)?.balance ?? 0, item.currency, previousPeriod), 0);
        const convertEntry = (entry: typeof entries[number]) => convertToCop(entry.amount, entry.currency, period, snapshots.find(item => item.accountId === entry.accountId));
        const incomeEntries = entries.filter(entry => eventMap.get(entry.eventId)?.type === 'INCOME');
        const isSalaryEvent = (eventId: string) => {
            const event = eventMap.get(eventId);
            if (event?.incomeKind) return event.incomeKind === 'SALARY';
            const planned = plannedFlows.find(item => item.id === event?.plannedCashFlowId);
            return planned?.type === 'SALARY' || /salario|n[oó]mina/i.test(event?.concept ?? '');
        };
        const actualSalary = incomeEntries.filter(entry => isSalaryEvent(entry.eventId)).reduce((sum, entry) => sum + convertEntry(entry), 0);
        const actualOtherIncome = incomeEntries.filter(entry => !isSalaryEvent(entry.eventId)).reduce((sum, entry) => sum + convertEntry(entry), 0);
        const actualExternalIncome = actualSalary + actualOtherIncome;
        const returns = summarizeReturns(entries, events, accounts, convertEntry);
        // Valuation changes move net worth but are not money in or out.
        const cashFlow = entries.filter(entry => eventMap.get(entry.eventId)?.type !== 'TRANSFER').reduce((sum, entry) => sum + convertEntry(entry), 0) - returns.byKind.UNREALIZED_VALUATION;
        const recordedExpenses = expenses.reduce((sum, item) => sum + convertToCop(item.amount, item.currency, period), 0);
        const obligationOnlyExpenses = events.filter(event => event.type === 'EXPENSE' && !event.expenseId).reduce((sum, event) => {
            const accountImpact = entries.filter(entry => entry.eventId === event.id && entry.amount < 0).reduce((entrySum, entry) => entrySum + Math.abs(convertToCop(entry.amount, entry.currency, period)), 0);
            const obligationImpact = obligationEntries.filter(entry => entry.eventId === event.id && entry.amount > 0).reduce((entrySum, entry) => entrySum + convertToCop(entry.amount, entry.currency, period), 0);
            const impact = accountImpact + obligationImpact;
            return sum + impact;
        }, 0);
        const actualExpenses = recordedExpenses + obligationOnlyExpenses;
        const expectedExternalIncome = plannedFlows.filter(item => item.type !== 'EXPENSE').reduce((sum, item) => sum + convertToCop(item.amount, item.currency, period), 0);
        const expectedExpenses = plannedFlows.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + convertToCop(item.amount, item.currency, period), 0);
        const expectedReturn = rows.reduce((sum, row) => sum + convertToCop(row.expected, row.account.currency, period, row.snapshot), 0);
        const expectedInterest = rows.filter(row => row.account.returnBehavior !== 'MARKET_VALUE').reduce((sum, row) => sum + convertToCop(row.expected, row.account.currency, period, row.snapshot), 0);
        const fxEffect = rows.reduce((sum, row) => sum + row.fxEffect, 0);
        const netWorth = assets + receivables - payables;
        const previousNetWorth = previousAssets + previousReceivables - previousPayables;
        return { rows, netWorth, variation: netWorth - previousNetWorth, assets, payables, receivables, actualExternalIncome, actualSalary, actualOtherIncome, expectedExternalIncome, returns, expectedReturn, expectedInterest, actualExpenses, expectedExpenses, cashFlow, fxEffect, projectedNext: netWorth + expectedExternalIncome + expectedReturn - expectedExpenses };
    }, [periodId, previousPeriodId]);
    const [sort, setSort] = useState<'balance' | 'unexplained' | 'name'>('balance');
    if (!data) return <div className="h-48 animate-pulse rounded-xl bg-slate-100" />;
    const rows = [...data.rows].sort((a, b) => sort === 'name' ? a.account.name.localeCompare(b.account.name, 'es') : sort === 'unexplained' ? Math.abs(b.unexplained) - Math.abs(a.unexplained) : b.snapshot.balance - a.snapshot.balance);
    const variationPositive = data.variation >= 0;

    return <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Patrimonio neto" value={data.netWorth} description="Activos + por cobrar − por pagar" icon={Landmark} featured /><Metric title="Variación patrimonial" value={data.variation} description="Frente al cierre anterior" icon={variationPositive ? ArrowUpRight : ArrowDownRight} tone={variationPositive ? 'positive' : 'negative'} /><Metric title="Cuentas por cobrar" value={data.receivables} description="Dinero que otras personas te deben" icon={CircleDollarSign} /><Metric title="Deuda pendiente" value={data.payables} description="Tarjetas y demás obligaciones" icon={WalletCards} tone="warning" /></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CompareMetric title="Ingresos externos" expected={data.expectedExternalIncome} actual={data.actualExternalIncome} description={`Salario ${formatCurrency(data.actualSalary)} · Otros ${formatCurrency(data.actualOtherIncome)}`} icon={CircleDollarSign} /><CompareMetric title="Rendimiento cobrado" expected={data.expectedInterest} actual={data.returns.collected} description={`Intereses y dividendos · ${formatCurrency(data.returns.availableForSpending)} disponibles para gastos`} icon={Sparkles} /><CompareMetric title="Gastos" expected={data.expectedExpenses} actual={data.actualExpenses} description="Compras y consumos" icon={ReceiptText} negative /><CompareMetric title="Flujo de caja" expected={0} actual={data.cashFlow} description="Entradas y salidas; sin traslados" icon={WalletCards} /></div>
        <ReturnsBreakdown returns={data.returns} fxEffect={data.fxEffect} expectedReturn={data.expectedReturn} />
        <Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle>Conciliación por cuenta</CardTitle><CardDescription>El saldo cambia por flujos explicados; lo pendiente nunca se considera rendimiento.</CardDescription></div><label className="text-xs text-slate-500">Ordenar por <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="ml-2 rounded-lg border bg-white px-2 py-1.5 text-sm"><option value="balance">Mayor saldo</option><option value="unexplained">Mayor diferencia</option><option value="name">Nombre</option></select></label></div></CardHeader><CardContent className="px-0 sm:px-6"><Table><TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead className="text-right">Inicial</TableHead><TableHead className="text-right">Ingresos externos</TableHead><TableHead className="text-right">Transferencias</TableHead><TableHead className="text-right" title="Gastos, pagos, cobros y ajustes registrados en la cuenta">Gastos y ajustes</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Real confirmado</TableHead><TableHead className="text-right">Sin explicar</TableHead><TableHead className="text-right">Final</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.account.id}><TableCell><span className="font-medium">{row.account.name}</span><span className="block text-xs text-slate-500">{row.entity}{row.fxEffect ? ` · efecto TRM ${formatCurrency(row.fxEffect)}` : ''}</span></TableCell><Money value={row.openingBalance} currency={row.account.currency} /><Money value={row.externalIncome} currency={row.account.currency} /><Money value={row.transfers} currency={row.account.currency} /><Money value={row.expenses + row.adjustments} currency={row.account.currency} /><Money value={row.expected} currency={row.account.currency} /><Money value={row.passiveReturn} currency={row.account.currency} colored /><Money value={row.unexplained} currency={row.account.currency} warning /><Money value={row.snapshot.balance} currency={row.account.currency} /></TableRow>)}{rows.length === 0 && <TableRow><TableCell colSpan={9} className="h-28 text-center text-slate-500">Completa el cierre mensual para ver la conciliación.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-700"><strong>Próximo cierre proyectado: {formatCurrency(data.projectedNext)}</strong><span className="ml-2 text-slate-500">Patrimonio + ingresos externos + rendimiento pasivo − gastos previstos. Las transferencias no cambian el resultado.</span></div>
    </div>;
}

type ReturnStatus = 'confirmed' | 'unrealized' | 'restricted' | 'estimate' | 'presentation';
const statusStyles: Record<ReturnStatus, { label: string; className: string }> = {
    confirmed: { label: 'Cobrado', className: 'bg-emerald-50 text-emerald-700' },
    unrealized: { label: 'No realizado', className: 'bg-sky-50 text-sky-700' },
    restricted: { label: 'Restringido', className: 'bg-amber-50 text-amber-800' },
    estimate: { label: 'Estimado', className: 'bg-slate-100 text-slate-600' },
    presentation: { label: 'No es dinero recibido', className: 'bg-slate-100 text-slate-600' },
};

function ReturnsBreakdown({ returns, fxEffect, expectedReturn }: { returns: ReturnsSummary; fxEffect: number; expectedReturn: number }) {
    const items: Array<{ label: string; value: number; status: ReturnStatus; hint: string }> = [
        { label: 'Disponible para gastos', value: returns.availableForSpending, status: 'confirmed', hint: 'Intereses, dividendos y cashback fuera de cuentas restringidas' },
        { label: RETURN_KIND_LABELS.INTEREST, value: returns.byKind.INTEREST, status: 'confirmed', hint: 'Abonados por cuentas y CDT' },
        { label: RETURN_KIND_LABELS.DIVIDEND, value: returns.byKind.DIVIDEND, status: 'confirmed', hint: 'Pagados por inversiones' },
        { label: RETURN_KIND_LABELS.CASHBACK, value: returns.byKind.CASHBACK, status: 'confirmed', hint: 'Acreditados; no son interés' },
        { label: 'Resultado realizado de inversiones', value: returns.byKind.REALIZED_GAIN, status: 'confirmed', hint: 'Operaciones cerradas' },
        { label: RETURN_KIND_LABELS.UNREALIZED_VALUATION, value: returns.byKind.UNREALIZED_VALUATION, status: 'unrealized', hint: 'Fondos y brókeres; puede revertirse' },
        { label: 'En cuentas restringidas', value: returns.restricted, status: 'restricted', hint: 'Cuenta en el patrimonio, no para gastos' },
        { label: 'Efecto TRM', value: fxEffect, status: 'presentation', hint: 'Cambio por convertir saldos USD a COP' },
        { label: 'Rendimiento esperado', value: expectedReturn, status: 'estimate', hint: 'Según las tasas planificadas del mes' },
    ];
    if (returns.byKind.OTHER) items.splice(6, 0, { label: RETURN_KIND_LABELS.OTHER, value: returns.byKind.OTHER, status: 'confirmed', hint: 'Sin categoría específica' });
    return <Card><CardHeader className="border-b"><CardTitle>Desglose de rendimientos</CardTitle><CardDescription>Separa lo que entró como dinero de lo que solo cambió de valor. La variación patrimonial ya incluye todo; aquí no se suma de nuevo.</CardDescription></CardHeader><CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <div key={item.label} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-700">{item.label}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[item.status].className}`}>{statusStyles[item.status].label}</span></div><p className={`mt-1 text-lg font-semibold ${item.value < 0 ? 'text-rose-700' : 'text-slate-950'}`}>{formatCurrency(item.value)}</p><p className="text-xs text-slate-500">{item.hint}</p></div>)}</CardContent></Card>;
}

function Metric({ title, value, description, icon: Icon, tone = 'neutral', featured }: { title: string; value: number; description: string; icon: typeof Landmark; tone?: 'neutral' | 'positive' | 'negative' | 'warning'; featured?: boolean }) { const color = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-950'; return <Card className={featured ? 'border-slate-950 bg-slate-950 text-white' : ''}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className={featured ? 'text-sm text-slate-300' : 'text-sm'}>{title}</CardTitle><Icon className="size-4" /></CardHeader><CardContent><p className={featured ? 'text-2xl font-semibold text-white' : `text-2xl font-semibold ${color}`}>{formatCurrency(value)}</p><p className={featured ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs text-slate-500'}>{description}</p></CardContent></Card>; }
function CompareMetric({ title, expected, actual, description, icon: Icon, negative }: { title: string; expected: number; actual: number; description: string; icon: typeof Landmark; negative?: boolean }) { return <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">{title}</CardTitle><Icon className="size-4 text-slate-500" /></CardHeader><CardContent><p className={negative ? 'text-xl font-semibold text-rose-700' : 'text-xl font-semibold'}>{formatCurrency(actual)} real</p><p className="mt-1 text-xs text-slate-500">{formatCurrency(expected)} esperado · {description}</p></CardContent></Card>; }
function Money({ value, currency, colored, warning }: { value: number; currency: Currency; colored?: boolean; warning?: boolean }) { const className = warning && Math.abs(value) >= (currency === 'COP' ? 1 : 0.01) ? 'text-right font-medium text-amber-700' : colored ? `text-right ${value >= 0 ? 'text-emerald-700' : 'text-rose-700'}` : 'text-right'; return <TableCell className={className}>{formatCurrency(value, currency)}</TableCell>; }
