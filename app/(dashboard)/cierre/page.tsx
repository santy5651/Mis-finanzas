'use client';

import { useEffect, useMemo, useState } from 'react';
import { addMonths, format, parse, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { CircleAlert, CircleCheck, LockKeyhole, RefreshCw, UnlockKeyhole } from 'lucide-react';
import { db } from '@/lib/db/db';
import type { AccountSnapshot, ObligationSnapshot, Period, PlannedCashFlow } from '@/lib/types';
import { calculateAccountReconciliation, calculateObligationReconciliation, expectedPassiveReturn } from '@/lib/finance/reconciliation';
import { saveFinancialEvent } from '@/lib/finance/ledger';
import { dateInsidePeriod, parseAmountInput } from '@/lib/finance/period';
import { isSignificant } from '@/lib/finance/currency';
import { ReconciliationAssistant, type ReconciliationRow } from '@/components/close/reconciliation-assistant';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { FinancialEventForm } from '@/components/forms/financial-event-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';

const steps = [
    ['1', 'Preparar'], ['2', 'Movimientos'], ['3', 'Saldos'], ['4', 'Conciliar'], ['5', 'Cerrar'],
] as const;

export default function MonthlyClosePage() {
    const { periodId } = useActivePeriod();
    const previousPeriodId = useMemo(() => format(subMonths(parse(periodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM'), [periodId]);
    const nextPeriodId = useMemo(() => format(addMonths(parse(periodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM'), [periodId]);
    const accountsQuery = useLiveQuery(() => db.accounts.filter(item => item.isActive).toArray());
    const obligationsQuery = useLiveQuery(() => db.obligations.filter(item => item.isActive).toArray());
    const snapshotsQuery = useLiveQuery(() => db.accountSnapshots.where('periodId').equals(periodId).toArray(), [periodId]);
    const previousSnapshotsQuery = useLiveQuery(() => db.accountSnapshots.where('periodId').equals(previousPeriodId).toArray(), [previousPeriodId]);
    const obligationSnapshotsQuery = useLiveQuery(() => db.obligationSnapshots.where('periodId').equals(periodId).toArray(), [periodId]);
    const previousObligationSnapshotsQuery = useLiveQuery(() => db.obligationSnapshots.where('periodId').equals(previousPeriodId).toArray(), [previousPeriodId]);
    const obligationEntriesQuery = useLiveQuery(() => db.obligationEntries.where('periodId').equals(periodId).toArray(), [periodId]);
    const accountEntriesQuery = useLiveQuery(() => db.accountEntries.where('periodId').equals(periodId).toArray(), [periodId]);
    const eventsQuery = useLiveQuery(() => db.financialEvents.where('periodId').equals(periodId).toArray(), [periodId]);
    const plansQuery = useLiveQuery(() => db.accountPlans.where('periodId').equals(periodId).toArray(), [periodId]);
    const plannedFlowsQuery = useLiveQuery(() => db.plannedCashFlows.where('periodId').equals(periodId).toArray(), [periodId]);
    const accounts = useMemo(() => accountsQuery ?? [], [accountsQuery]);
    const obligations = useMemo(() => obligationsQuery ?? [], [obligationsQuery]);
    const snapshots = useMemo(() => snapshotsQuery ?? [], [snapshotsQuery]);
    const previousSnapshots = useMemo(() => previousSnapshotsQuery ?? [], [previousSnapshotsQuery]);
    const obligationSnapshots = useMemo(() => obligationSnapshotsQuery ?? [], [obligationSnapshotsQuery]);
    const previousObligationSnapshots = useMemo(() => previousObligationSnapshotsQuery ?? [], [previousObligationSnapshotsQuery]);
    const obligationEntries = useMemo(() => obligationEntriesQuery ?? [], [obligationEntriesQuery]);
    const accountEntries = useMemo(() => accountEntriesQuery ?? [], [accountEntriesQuery]);
    const events = useMemo(() => eventsQuery ?? [], [eventsQuery]);
    const plans = useMemo(() => plansQuery ?? [], [plansQuery]);
    const plannedFlows = useMemo(() => plannedFlowsQuery ?? [], [plannedFlowsQuery]);
    const period = useLiveQuery(async () => (await db.periods.get(periodId)) ?? null, [periodId]);
    const [step, setStep] = useState('1');
    const [accountValues, setAccountValues] = useState<Record<string, string>>({});
    const [obligationValues, setObligationValues] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
    const [manualTrm, setManualTrm] = useState('');
    const locked = period?.status === 'CLOSED';

    useEffect(() => {
        // `undefined` means Dexie is still loading; only `null` means the row is absent.
        // Treating both alike used to overwrite CLOSED periods with OPEN on every visit.
        if (period !== null) return;
        const [year, month] = periodId.split('-').map(Number);
        db.periods.put({ id: periodId, year, month, usdCopRate: null, status: 'OPEN' });
    }, [period, periodId]);
    useEffect(() => {
        if (period === undefined) return;
        setStep(period?.status === 'CLOSED' ? '5' : '1');
    }, [periodId, period]);
    useEffect(() => { setManualTrm(period?.usdCopRate ? String(period.usdCopRate) : ''); }, [period?.usdCopRate]);
    useEffect(() => {
        setAccountValues(Object.fromEntries(accounts.map(account => [account.id, String(snapshots.find(item => item.accountId === account.id)?.balance ?? '')])));
    }, [accounts, snapshots]);
    useEffect(() => {
        setObligationValues(Object.fromEntries(obligations.map(item => [item.id, String(obligationSnapshots.find(snapshot => snapshot.obligationId === item.id)?.balance ?? '')])));
    }, [obligations, obligationSnapshots]);

    const reconciliationRows = useMemo(() => (accounts.map(account => {
        const current = snapshots.find(item => item.accountId === account.id);
        const previous = previousSnapshots.find(item => item.accountId === account.id);
        if (!current) return null;
        const entries = accountEntries.filter(item => item.accountId === account.id);
        const calculation = calculateAccountReconciliation(current, previous, entries, events);
        const plan = plans.find(item => item.accountId === account.id);
        return { account, current, previous, plan, expected: expectedPassiveReturn(previous?.balance ?? current.balance, plan), ...calculation };
    }).filter(Boolean) as ReconciliationRow[]), [accounts, snapshots, previousSnapshots, accountEntries, events, plans]);
    const unexplainedRows = reconciliationRows.filter(row => isSignificant(row.unexplained, row.account.currency));
    const obligationReconciliationRows = obligations.flatMap(obligation => {
        const current = obligationSnapshots.find(item => item.obligationId === obligation.id);
        if (!current) return [];
        const previous = previousObligationSnapshots.find(item => item.obligationId === obligation.id);
        const calculation = calculateObligationReconciliation(current, previous, obligationEntries.filter(item => item.obligationId === obligation.id));
        return [{ obligation, current, previous, ...calculation }];
    });
    const unexplainedObligations = obligationReconciliationRows.filter(row => isSignificant(row.unexplained, row.obligation.currency));
    const totalUnexplained = unexplainedRows.length + unexplainedObligations.length;
    const plannedIncomeFlows = plannedFlows.filter(flow => flow.type !== 'EXPENSE');
    const plannedIncomeReceived = (flow: PlannedCashFlow) => events.some(event => {
        if (event.type !== 'INCOME') return false;
        if (event.plannedCashFlowId === flow.id) return true;
        const expectedKind = flow.type === 'SALARY' ? 'SALARY' : 'OTHER_INCOME';
        const kindMatches = event.incomeKind === expectedKind
            || (!event.incomeKind && flow.type === 'SALARY' && /salario|n[oó]mina/i.test(event.concept));
        return kindMatches && accountEntries.some(entry => entry.eventId === event.id
            && entry.accountId === flow.accountId && Math.abs(entry.amount - flow.amount) < 0.01);
    });

    const prepareMonth = async () => {
        if (locked) return;
        setMessage(null);
        const [previousPlans, previousFlows, previousExpenses] = await Promise.all([
            db.accountPlans.where('periodId').equals(previousPeriodId).toArray(),
            db.plannedCashFlows.where('periodId').equals(previousPeriodId).toArray(),
            db.expenses.where('periodId').equals(previousPeriodId).filter(item => Boolean(item.isRecurring)).toArray(),
        ]);
        const currentPlans = await db.accountPlans.where('periodId').equals(periodId).toArray();
        const currentFlows = await db.plannedCashFlows.where('periodId').equals(periodId).toArray();
        const now = new Date().toISOString();
        const plansToAdd = previousPlans.filter(previous => !currentPlans.some(current => current.accountId === previous.accountId)).map(previous => ({ ...previous, id: uuidv4(), periodId, createdAt: now, updatedAt: now }));
        const recurring = previousFlows.filter(item => item.isRecurring);
        const legacyRecurring: PlannedCashFlow[] = previousExpenses.map(expense => ({ id: uuidv4(), periodId, accountId: expense.paymentAccountId || '', type: 'EXPENSE', concept: expense.reason, amount: expense.amount, currency: expense.currency, isRecurring: true, sourcePlanId: expense.id, createdAt: now, updatedAt: now }));
        const flowCandidates = [...recurring.map(item => ({ ...item, id: uuidv4(), periodId, sourcePlanId: item.id, createdAt: now, updatedAt: now })), ...legacyRecurring.filter(item => item.accountId)];
        const flowsToAdd = flowCandidates.filter(candidate => !currentFlows.some(current => current.type === candidate.type && current.accountId === candidate.accountId && current.concept.toLocaleLowerCase() === candidate.concept.toLocaleLowerCase()));
        await db.transaction('rw', db.accountPlans, db.plannedCashFlows, async () => {
            if (plansToAdd.length) await db.accountPlans.bulkAdd(plansToAdd);
            if (flowsToAdd.length) await db.plannedCashFlows.bulkAdd(flowsToAdd);
        });
        setMessage({ tone: 'success', text: `Mes preparado: ${plansToAdd.length} tasa(s) y ${flowsToAdd.length} flujo(s) recurrente(s) copiados. Los elementos siguen previstos, no realizados.` });
    };

    const fetchTrm = async () => {
        setMessage({ tone: 'info', text: 'Consultando la TRM oficial…' });
        try {
            const date = dateInsidePeriod(periodId);
            const response = await fetch(`/api/trm?date=${date}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            const [year, month] = periodId.split('-').map(Number);
            await db.periods.put({ ...(period ?? { id: periodId, year, month }), usdCopRate: data.value, trmDate: date, trmValidFrom: data.validFrom, trmValidTo: data.validTo, trmSource: 'SFC', status: period?.status ?? 'OPEN' } as Period);
            setMessage({ tone: 'success', text: `TRM oficial cargada: ${formatCurrency(data.value)} por USD.` });
        } catch (error) {
            setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible consultar la TRM.' });
        }
    };

    const saveManualTrm = async () => {
        const value = Number(manualTrm);
        if (!Number.isFinite(value) || value <= 0 || locked) { setMessage({ tone: 'error', text: 'Ingresa una TRM manual válida.' }); return; }
        const [year, month] = periodId.split('-').map(Number);
        await db.periods.put({ ...(period ?? { id: periodId, year, month, status: 'OPEN' as const }), usdCopRate: value, trmDate: dateInsidePeriod(periodId), trmSource: 'MANUAL' });
        setMessage({ tone: 'success', text: 'TRM manual guardada como candidata. Se congelará al cerrar el periodo.' });
    };

    const registerPlannedIncome = async (flow: PlannedCashFlow) => {
        if (locked || plannedIncomeReceived(flow)) return;
        const account = accounts.find(item => item.id === flow.accountId);
        if (!account) {
            setMessage({ tone: 'error', text: `La cuenta asociada a “${flow.concept}” ya no está disponible.` });
            return;
        }
        await saveFinancialEvent({
            id: uuidv4(),
            periodId,
            date: `${periodId}-${String(new Date(Number(periodId.slice(0, 4)), Number(periodId.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
            type: 'INCOME',
            concept: flow.concept,
            incomeKind: flow.type === 'SALARY' ? 'SALARY' : 'OTHER_INCOME',
            plannedCashFlowId: flow.id,
        }, [{ accountId: account.id, amount: flow.amount, currency: account.currency }]);
        setMessage({ tone: 'success', text: `${flow.concept} quedó registrado como ingreso real en ${account.name}.` });
    };

    const saveBalances = async () => {
        if (locked) return;
        const now = new Date().toISOString();
        const accountRows: AccountSnapshot[] = accounts.flatMap(account => {
            const value = parseAmountInput(accountValues[account.id]);
            if (value === null) return [];
            const existing = snapshots.find(item => item.accountId === account.id);
            return [{ ...(existing ?? { id: uuidv4(), periodId, accountId: account.id, createdAt: now }), balance: value, updatedAt: now }];
        });
        const obligationRows: ObligationSnapshot[] = obligations.flatMap(item => {
            const value = parseAmountInput(obligationValues[item.id]);
            if (value === null) return [];
            const existing = obligationSnapshots.find(snapshot => snapshot.obligationId === item.id);
            return [{ ...(existing ?? { id: uuidv4(), periodId, obligationId: item.id, createdAt: now }), balance: Math.max(0, value), updatedAt: now }];
        });
        await db.transaction('rw', db.accountSnapshots, db.obligationSnapshots, async () => {
            if (accountRows.length) await db.accountSnapshots.bulkPut(accountRows);
            if (obligationRows.length) await db.obligationSnapshots.bulkPut(obligationRows);
        });
        setMessage({ tone: 'success', text: `${accountRows.length} saldo(s) de cuenta y ${obligationRows.length} obligación(es) guardados como valores reales.` });
        setStep('4');
    };

    const classifyObligation = async (row: typeof obligationReconciliationRows[number]) => {
        if (locked || Math.abs(row.unexplained) < 0.000001) return;
        await saveFinancialEvent({ id: uuidv4(), periodId, date: dateInsidePeriod(periodId), type: 'ADJUSTMENT', concept: 'Ajuste de obligación conciliado', obligationId: row.obligation.id }, [], [{ obligationId: row.obligation.id, amount: row.unexplained, currency: row.obligation.currency }]);
        setMessage({ tone: 'success', text: `Diferencia de ${row.obligation.name} clasificada como ajuste explicado.` });
    };

    const closePeriod = async () => {
        if (!period?.usdCopRate && (accounts.some(item => item.currency === 'USD') || obligations.some(item => item.currency === 'USD'))) {
            setMessage({ tone: 'error', text: 'Falta una TRM válida para congelar los saldos en USD.' }); setCloseConfirmOpen(false); return;
        }
        const now = new Date().toISOString();
        await db.transaction('rw', db.periods, db.accountSnapshots, db.obligationSnapshots, async () => {
            const usdSnapshots = snapshots.filter(snapshot => accounts.find(account => account.id === snapshot.accountId)?.currency === 'USD');
            if (usdSnapshots.length) await db.accountSnapshots.bulkPut(usdSnapshots.map(snapshot => ({ ...snapshot, usdCopRate: period?.usdCopRate ?? undefined, trmDate: period?.trmDate ?? now.slice(0, 10), trmSource: period?.trmSource ?? 'MANUAL', updatedAt: now })));
            const usdObligationSnapshots = obligationSnapshots.filter(snapshot => obligations.find(item => item.id === snapshot.obligationId)?.currency === 'USD');
            if (usdObligationSnapshots.length) await db.obligationSnapshots.bulkPut(usdObligationSnapshots.map(snapshot => ({ ...snapshot, usdCopRate: period?.usdCopRate ?? undefined, trmDate: period?.trmDate ?? now.slice(0, 10), trmSource: period?.trmSource ?? 'MANUAL', updatedAt: now })));
            const [year, month] = periodId.split('-').map(Number);
            await db.periods.put({ ...(period ?? { id: periodId, year, month, usdCopRate: null }), status: 'CLOSED', closedAt: now, acknowledgedUnexplained: totalUnexplained > 0 });
        });
        setCloseConfirmOpen(false); setMessage({ tone: 'success', text: `Cierre ${periodId} completado. Saldos y TRM quedaron protegidos.` });
    };

    const reopen = async () => {
        if (!period) return;
        await db.periods.put({ ...period, status: 'OPEN', closedAt: undefined, acknowledgedUnexplained: false });
        setMessage({ tone: 'info', text: 'Mes reabierto. Deberás cerrarlo de nuevo después de corregirlo.' });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-medium text-emerald-700">Proceso mensual</p><h1 className="page-title">Cierre mensual</h1><p className="page-description">Registra la realidad, explica cada diferencia y congela un historial confiable.</p></div><div className="flex items-center gap-2"><Badge variant={locked ? 'secondary' : 'outline'}>{locked ? <><LockKeyhole /> Cerrado</> : <><UnlockKeyhole /> Abierto</>}</Badge><PeriodSelector /></div></div>
            {message && <div className={message.tone === 'success' ? 'rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : message.tone === 'error' ? 'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800'}>{message.text}</div>}
            <Tabs value={step} onValueChange={setStep}><TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">{steps.map(([value, label]) => <TabsTrigger key={value} value={value} className="gap-2 py-2"><span className="grid size-5 place-items-center rounded-full bg-slate-200 text-[11px]">{value}</span>{label}</TabsTrigger>)}</TabsList>
                <TabsContent value="1" className="mt-5"><Card><CardHeader><CardTitle>Preparar el periodo</CardTitle><CardDescription>Copia únicamente lo recurrente como previsto y consulta la TRM oficial. Nada se marcará como realizado.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><InfoBox label="Tasas configuradas" value={String(plans.length)} /><InfoBox label="Flujos previstos" value={String(plannedFlows.length)} /><InfoBox label="TRM candidata" value={period?.usdCopRate ? formatCurrency(period.usdCopRate) : 'Pendiente'} /></div><div className="flex flex-wrap gap-2"><Button onClick={prepareMonth} disabled={locked}><RefreshCw /> Copiar recurrentes</Button><Button variant="outline" onClick={fetchTrm} disabled={locked}><RefreshCw /> Consultar TRM oficial</Button><div className="flex items-center gap-1 rounded-lg border p-1"><Input className="h-8 w-28 border-0" type="number" step="0.01" placeholder="TRM manual" value={manualTrm} onChange={event => setManualTrm(event.target.value)} disabled={locked} /><Button size="sm" variant="ghost" onClick={saveManualTrm} disabled={locked}>Guardar manual</Button></div><Button variant="ghost" onClick={() => setStep('2')}>Continuar</Button></div></CardContent></Card></TabsContent>
                <TabsContent value="2" className="mt-5"><div className="space-y-4"><Card><CardHeader><CardTitle>Ingresos previstos del mes</CardTitle><CardDescription>Confirma lo que realmente recibiste. La cuenta se conserva por su identificador; crear otro bolsillo en el mismo banco no cambia este vínculo.</CardDescription></CardHeader><CardContent className="space-y-2">{plannedIncomeFlows.map(flow => { const account = accounts.find(item => item.id === flow.accountId); const received = plannedIncomeReceived(flow); return <div key={flow.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{flow.concept} · {formatCurrency(flow.amount, flow.currency)}</p><p className="text-xs text-slate-500">{flow.type === 'SALARY' ? 'Salario' : 'Otro ingreso'} → {account?.name ?? 'Cuenta no disponible'}</p></div><Button size="sm" variant={received ? 'outline' : 'default'} disabled={locked || received || !account} onClick={() => registerPlannedIncome(flow)}>{received ? <><CircleCheck /> Recibido</> : 'Registrar como recibido'}</Button></div>; })}{plannedIncomeFlows.length === 0 && <p className="py-3 text-sm text-slate-500">No hay ingresos previstos. Puedes registrar uno manualmente abajo.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Otros movimientos reales</CardTitle><CardDescription>Ingresos y transferencias quedan ligados a las cuentas. Los gastos se registran desde Movimientos con su cuenta o tarjeta.</CardDescription></CardHeader><CardContent><FinancialEventForm onSuccess={() => setMessage({ tone: 'success', text: 'Movimiento guardado. Puedes continuar registrando o pasar a saldos.' })} /><div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => setStep('3')}>Continuar a saldos</Button></div></CardContent></Card></div></TabsContent>
                <TabsContent value="3" className="mt-5"><div className="space-y-4"><BalanceGrid title="Saldos reales de cuentas" description="Escribe lo que realmente muestra cada banco o plataforma. Estos valores no se alteran al agregar movimientos." items={accounts.map(item => ({ id: item.id, name: item.name, suffix: item.currency }))} values={accountValues} setValues={setAccountValues} disabled={locked} /><BalanceGrid title="Saldos reales de obligaciones" description="Incluye tarjetas, deudas y dinero que otras personas deben." items={obligations.map(item => ({ id: item.id, name: item.name, suffix: `${item.direction === 'PAYABLE' ? 'Por pagar' : 'Por cobrar'} · ${item.currency}` }))} values={obligationValues} setValues={setObligationValues} disabled={locked} /><Button onClick={saveBalances} disabled={locked}>Guardar saldos y conciliar</Button></div></TabsContent>
                <TabsContent value="4" className="mt-5"><div className="space-y-4"><ReconciliationAssistant periodId={periodId} nextPeriodId={nextPeriodId} locked={locked} rows={reconciliationRows} onMessage={(tone, text) => setMessage({ tone, text })} /><Card><CardHeader><CardTitle>Conciliación de obligaciones</CardTitle><CardDescription>Compras, pagos, préstamos y cobros deben explicar el cambio de cada saldo.</CardDescription></CardHeader><CardContent className="space-y-3">{obligationReconciliationRows.map(row => <div key={row.obligation.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{row.obligation.name}</p><p className="text-xs text-slate-500">Inicial {formatCurrency(row.previous?.balance ?? row.current.balance, row.obligation.currency)} · Movimientos {formatCurrency(row.explained, row.obligation.currency)} · Final {formatCurrency(row.current.balance, row.obligation.currency)}</p></div><div className="flex items-center gap-2"><span className={Math.abs(row.unexplained) < 1 ? 'text-sm font-medium text-emerald-700' : 'text-sm font-medium text-amber-700'}>{Math.abs(row.unexplained) < 1 ? 'Conciliada' : `Sin explicar ${formatCurrency(row.unexplained, row.obligation.currency)}`}</span>{Math.abs(row.unexplained) >= 1 && <Button size="sm" variant="outline" disabled={locked} onClick={() => classifyObligation(row)}>Ajuste explicado</Button>}</div></div>)}</CardContent></Card><div className="flex justify-end"><Button variant="outline" onClick={() => setStep('5')}>Revisar cierre</Button></div></div></TabsContent>
                <TabsContent value="5" className="mt-5"><Card><CardHeader><CardTitle>{locked ? 'Periodo cerrado' : 'Revisión final'}</CardTitle><CardDescription>{locked ? 'Los saldos y la TRM histórica están protegidos.' : 'Puedes cerrar con diferencias pendientes, pero nunca se contarán como rendimiento.'}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><InfoBox label="Cuentas conciliadas" value={`${reconciliationRows.length - unexplainedRows.length}/${reconciliationRows.length}`} /><InfoBox label="Diferencias pendientes" value={String(totalUnexplained)} /><InfoBox label="TRM a congelar" value={period?.usdCopRate ? formatCurrency(period.usdCopRate) : 'Pendiente'} /></div>{totalUnexplained > 0 && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>Hay {totalUnexplained} saldo(s) con diferencias. Si cierras, quedarán marcadas como “Sin explicar” y excluidas del rendimiento real.</p></div>}{locked ? <Button variant="outline" onClick={reopen}><UnlockKeyhole /> Reabrir mes</Button> : <Button onClick={() => setCloseConfirmOpen(true)}><CircleCheck /> Cerrar y congelar periodo</Button>}</CardContent></Card></TabsContent>
            </Tabs>
            <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Cerrar el periodo {periodId}?</AlertDialogTitle><AlertDialogDescription>La TRM y los snapshots quedarán congelados. Para corregirlos tendrás que reabrir el mes.{totalUnexplained ? ` Confirmas además ${totalUnexplained} diferencia(s) sin explicar.` : ''}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); closePeriod(); }}>Cerrar periodo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
    );
}

function InfoBox({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>; }
function BalanceGrid({ title, description, items, values, setValues, disabled }: { title: string; description: string; items: Array<{ id: string; name: string; suffix: string }>; values: Record<string, string>; setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>; disabled: boolean }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <label key={item.id} className="rounded-xl border p-3"><span className="mb-2 flex items-center justify-between gap-2 text-sm font-medium"><span>{item.name}</span><span className="text-xs font-normal text-slate-500">{item.suffix}</span></span><Input type="number" step="any" value={values[item.id] ?? ''} onChange={event => setValues(previous => ({ ...previous, [item.id]: event.target.value }))} disabled={disabled} /></label>)}</CardContent></Card>; }
