'use client';

import { format, parse, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { planAnnualRate } from '@/lib/finance/assistant';
import { convertToCop, convertToCopOrNull } from '@/lib/finance/currency';
import { obligationBalance } from '@/lib/finance/networth';
import type { ProjectionInput } from '@/lib/finance/projection';
import { buildPerformance, PerformanceTable } from '@/components/investments/performance-table';
import { ProjectionPanel } from '@/components/investments/projection-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function InvestmentsPage() {
    const data = useLiveQuery(async () => {
        const [accounts, periods, snapshots, entries, returnEvents, plans, flows, obligations, obligationSnapshots, obligationEntries] = await Promise.all([
            db.accounts.toArray(),
            db.periods.toArray(),
            db.accountSnapshots.toArray(),
            db.accountEntries.toArray(),
            db.financialEvents.where('type').equals('PASSIVE_RETURN').toArray(),
            db.accountPlans.toArray(),
            db.plannedCashFlows.toArray(),
            db.obligations.toArray(),
            db.obligationSnapshots.toArray(),
            db.obligationEntries.toArray(),
        ]);
        const performance = buildPerformance(accounts, periods, snapshots, entries, returnEvents);
        const ipcPeriod = periods.filter(period => period.ipcAnnual !== undefined).sort((a, b) => b.id.localeCompare(a.id))[0];
        const inflation = ipcPeriod ? { value: ipcPeriod.ipcAnnual!, periodId: ipcPeriod.id } : null;

        const fromPeriodId = snapshots.map(item => item.periodId).sort().at(-1);
        if (!fromPeriodId) return { performance, inflation, projection: null, missingRate: [] as string[] };
        const previousPeriodId = format(subMonths(parse(fromPeriodId, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
        const period = periods.find(item => item.id === fromPeriodId);
        const missingRate: string[] = [];
        const projectionAccounts: ProjectionInput['accounts'] = accounts.filter(account => account.isActive).flatMap(account => {
            const snapshot = snapshots.find(item => item.accountId === account.id && item.periodId === fromPeriodId);
            const previous = snapshots.find(item => item.accountId === account.id && item.periodId === previousPeriodId);
            // Same estimate as the dashboard: a forgotten balance is last month's plus this month's entries.
            const native = snapshot?.balance ?? (previous ? previous.balance + entries.filter(item => item.accountId === account.id && item.periodId === fromPeriodId).reduce((sum, item) => sum + item.amount, 0) : null);
            if (native === null) return [];
            const balance = convertToCopOrNull(native, account.currency, period, snapshot);
            if (balance === null) { missingRate.push(account.name); return []; }
            const plan = plans.filter(item => item.accountId === account.id && item.periodId <= fromPeriodId).sort((a, b) => b.periodId.localeCompare(a.periodId))[0];
            return [{
                id: account.id,
                name: account.name,
                balance,
                behavior: account.returnBehavior === 'MARKET_VALUE' ? 'MARKET_VALUE' as const : 'INTEREST' as const,
                restricted: Boolean(account.isRestricted),
                annualRate: planAnnualRate(plan),
            }];
        });
        const recurring = flows.filter(flow => flow.periodId === fromPeriodId && flow.isRecurring);
        const monthly = (type: 'income' | 'expense') => recurring
            .filter(flow => (flow.type === 'EXPENSE') === (type === 'expense'))
            .reduce((sum, flow) => sum + convertToCop(flow.amount, flow.currency, period), 0);
        const netLiabilities = obligations.reduce((sum, obligation) => {
            const balance = obligationBalance(
                obligation.id,
                obligationSnapshots.filter(item => item.periodId === fromPeriodId),
                obligationSnapshots.filter(item => item.periodId === previousPeriodId),
                obligationEntries.filter(item => item.periodId === fromPeriodId),
            );
            const value = convertToCop(balance, obligation.currency, period);
            return sum + (obligation.direction === 'PAYABLE' ? value : -value);
        }, 0);
        const projection: ProjectionInput = {
            fromPeriodId,
            accounts: projectionAccounts,
            monthlyIncome: monthly('income'),
            monthlyExpenses: monthly('expense'),
            netLiabilities,
            inflation: inflation?.value ?? null,
        };
        return { performance, inflation, projection, missingRate };
    });

    const market = data?.performance.market.trailing;
    const defaultMarketReturn = market && market.months >= 3 && market.annualized !== null ? market.annualized : 0;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm font-medium text-emerald-700">Inversiones</p>
                <h1 className="page-title">Rentabilidad y proyección</h1>
                <p className="page-description">Cuánto rinden realmente tus cuentas y cuánto podrías recibir en los próximos 12 meses.</p>
            </div>
            {!data ? <div className="h-48 animate-pulse rounded-xl bg-slate-100" /> : (
                <Tabs defaultValue="rentabilidad">
                    <TabsList><TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger><TabsTrigger value="proyeccion">Proyección a 12 meses</TabsTrigger></TabsList>
                    <TabsContent value="rentabilidad" className="mt-5"><PerformanceTable data={data.performance} inflation={data.inflation} /></TabsContent>
                    <TabsContent value="proyeccion" className="mt-5 space-y-3">
                        {data.missingRate.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Sin TRM en {data.projection?.fromPeriodId}: {data.missingRate.join(', ')} no se incluye{data.missingRate.length > 1 ? 'n' : ''} en la proyección.</p>}
                        {data.projection
                            ? <ProjectionPanel key={data.projection.fromPeriodId} input={data.projection} defaultMarketReturn={defaultMarketReturn} />
                            : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">Registra los saldos de un cierre para proyectar.</p>}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
