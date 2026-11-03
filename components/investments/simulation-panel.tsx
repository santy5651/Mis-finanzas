'use client';

import { useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { averagePlannedRate, projectTwelveMonths, scenarioRate, type ProjectionInput, type Scenario } from '@/lib/finance/projection';
import { ratePct } from '@/components/investments/projection-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

const label = (periodId: string) => format(parse(periodId, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: es });
const toFraction = (raw: string) => (Number(raw.replace(',', '.')) || 0) / 100;
const toInput = (fraction: number) => String(Math.round(fraction * 1000) / 10);
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`;

/**
 * "What if" over the same twelve months as the projection: one rate for every savings account and one
 * for every investment that changes value, compared with the current plan.
 */
export function SimulationPanel({ input, defaultMarketReturn }: { input: ProjectionInput; defaultMarketReturn: number }) {
    const [savingsRate, setSavingsRate] = useState(toInput(averagePlannedRate(input.accounts) ?? 0.1));
    const [marketRate, setMarketRate] = useState(toInput(defaultMarketReturn || 0.1));
    const [includeFlows, setIncludeFlows] = useState(true);
    /** Rates typed for single accounts; a blank one follows the general rate of its kind. */
    const [custom, setCustom] = useState<Record<string, string>>({});
    const accountRates = useMemo(() => Object.fromEntries(Object.entries(custom).filter(([, raw]) => raw.trim() !== '').map(([id, raw]) => [id, toFraction(raw)])), [custom]);

    const planScenario: Scenario = useMemo(() => ({ rateShiftPoints: 0, marketReturn: defaultMarketReturn, includePlannedFlows: includeFlows }), [defaultMarketReturn, includeFlows]);
    const simScenario: Scenario = useMemo(() => ({ ...planScenario, marketReturn: toFraction(marketRate), interestRateOverride: toFraction(savingsRate), accountRates }), [planScenario, marketRate, savingsRate, accountRates]);
    const generalScenario: Scenario = useMemo(() => ({ ...simScenario, accountRates: undefined }), [simScenario]);
    const plan = useMemo(() => projectTwelveMonths(input, planScenario), [input, planScenario]);
    const sim = useMemo(() => projectTwelveMonths(input, simScenario), [input, simScenario]);

    const total = (months: typeof sim, key: 'interestAvailable' | 'interestRestricted' | 'marketGain') => months.reduce((sum, month) => sum + month[key], 0);
    const simInterest = total(sim, 'interestAvailable');
    const simMarket = total(sim, 'marketGain');
    const last = sim[sim.length - 1];
    const planLast = plan[plan.length - 1];
    const hasRestricted = input.accounts.some(account => account.behavior === 'INTEREST' && account.restricted);

    // Twelve months of monthly compounding at an effective annual rate give exactly balance × rate.
    const rows = input.accounts.map(account => {
        const simRate = scenarioRate(account, simScenario);
        const planRate = scenarioRate(account, planScenario);
        const gain = account.balance * (simRate ?? 0);
        return { account, simRate, planRate, generalRate: scenarioRate(account, generalScenario), gain, difference: gain - account.balance * (planRate ?? 0) };
    }).sort((a, b) => b.account.balance - a.account.balance);
    const customCount = Object.keys(accountRates).length;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="border-b">
                    <CardTitle>Simulación de tasas</CardTitle>
                    <CardDescription>Prueba una tasa para todas tus cuentas de ahorro y otra para tus inversiones que cambian de valor, y compárala con tu plan actual. Si quieres, ajusta la tasa de una cuenta en particular en la tabla. Parte de los saldos de {label(input.fromPeriodId)} y no guarda nada.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4 md:grid-cols-3">
                    <label className="space-y-1 text-sm">
                        <span className="text-slate-600">Tasa fija para cuentas de ahorro (% E.A.)</span>
                        <Input inputMode="decimal" value={savingsRate} onChange={event => setSavingsRate(event.target.value)} />
                        <span className="block text-xs text-slate-500">{hasRestricted ? 'Las cuentas restringidas (cesantías) conservan su tasa.' : 'Se aplica también a las cuentas sin tasa planificada.'}</span>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-slate-600">Rentabilidad para inversiones variables (% E.A.)</span>
                        <Input inputMode="decimal" value={marketRate} onChange={event => setMarketRate(event.target.value)} />
                        <span className="block text-xs text-slate-500">Cuentas marcadas como “Cambia de valor”. Puede ser negativa.</span>
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={includeFlows} onChange={event => setIncludeFlows(event.target.checked)} />
                        Incluir ingresos y gastos recurrentes previstos
                    </label>
                </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat title="Intereses de ahorro en 12 meses" value={formatCurrency(simInterest)} detail={`${formatCurrency(simInterest / 12)} al mes · ${signed(simInterest - total(plan, 'interestAvailable'))} vs. tu plan`} />
                <Stat title="Ganancia de inversiones en 12 meses" value={formatCurrency(simMarket)} detail={`${signed(simMarket - total(plan, 'marketGain'))} vs. tu plan · supuesto, no dinero cobrado`} />
                <Stat title="Rendimiento total al mes" value={formatCurrency((simInterest + simMarket + total(sim, 'interestRestricted')) / 12)} detail="Promedio de ahorro, inversiones y cuentas restringidas" />
                <Stat title={`Patrimonio en ${label(last.periodId)}`} value={formatCurrency(last.netWorth)} detail={`${signed(last.netWorth - planLast.netWorth)} vs. tu plan`} />
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
                    <div>
                        <CardTitle className="text-base">Por cuenta</CardTitle>
                        <CardDescription>Escribe una tasa en una cuenta para usarla solo ahí; déjala vacía para que siga la tasa general.</CardDescription>
                    </div>
                    {customCount > 0 && <Button size="sm" variant="outline" onClick={() => setCustom({})}>Quitar ajustes ({customCount})</Button>}
                </CardHeader>
                <CardContent className="px-0 pt-2 sm:px-6">
                    <Table>
                        <TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">Tasa del plan</TableHead><TableHead className="text-right">Tasa simulada (% E.A.)</TableHead><TableHead className="text-right">Rendimiento en 12 meses</TableHead><TableHead className="text-right">Vs. plan</TableHead></TableRow></TableHeader>
                        <TableBody>{rows.map(({ account, simRate, planRate, generalRate, gain, difference }) => (
                            <TableRow key={account.id}>
                                <TableCell className="font-medium">{account.name}<span className="ml-2 text-xs font-normal text-slate-500">{account.behavior === 'MARKET_VALUE' ? 'variable' : account.restricted ? 'restringida' : 'ahorro'}</span></TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(account.balance)}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-500">{planRate === null ? 'sin tasa' : ratePct(planRate)}</TableCell>
                                <TableCell className="text-right">
                                    <Input
                                        className={custom[account.id]?.trim() ? 'ml-auto h-8 w-24 border-emerald-500 text-right tabular-nums' : 'ml-auto h-8 w-24 text-right tabular-nums'}
                                        inputMode="decimal"
                                        value={custom[account.id] ?? ''}
                                        placeholder={generalRate === null ? 'sin tasa' : toInput(generalRate)}
                                        onChange={event => setCustom(values => ({ ...values, [account.id]: event.target.value }))}
                                        aria-label={`Tasa simulada de ${account.name}`}
                                        title={simRate === null ? 'Sin tasa' : `Se usa ${ratePct(simRate)} E.A.`}
                                    />
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(gain)}</TableCell>
                                <TableCell className={difference > 0 ? 'text-right tabular-nums text-emerald-700' : difference < 0 ? 'text-right tabular-nums text-rose-700' : 'text-right tabular-nums text-slate-500'}>{signed(difference)}</TableCell>
                            </TableRow>
                        ))}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function Stat({ title, value, detail }: { title: string; value: string; detail: string }) {
    return <Card><CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></CardContent></Card>;
}
