'use client';

import { useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { projectTwelveMonths, type ProjectionInput } from '@/lib/finance/projection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

const pct = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const label = (periodId: string) => format(parse(periodId, 'yyyy-MM', new Date()), 'MMM yy', { locale: es });

export function ProjectionPanel({ input, defaultMarketReturn }: { input: ProjectionInput; defaultMarketReturn: number }) {
    const [rateShift, setRateShift] = useState(0);
    const [marketReturn, setMarketReturn] = useState(String(Math.round(defaultMarketReturn * 1000) / 10));
    const [includeFlows, setIncludeFlows] = useState(true);
    const months = useMemo(() => projectTwelveMonths(input, {
        rateShiftPoints: rateShift,
        marketReturn: (Number(marketReturn.replace(',', '.')) || 0) / 100,
        includePlannedFlows: includeFlows,
    }), [input, rateShift, marketReturn, includeFlows]);
    const totalAvailable = months.reduce((sum, month) => sum + month.interestAvailable, 0);
    const totalRestricted = months.reduce((sum, month) => sum + month.interestRestricted, 0);
    const totalMarket = months.reduce((sum, month) => sum + month.marketGain, 0);
    const last = months[months.length - 1];
    const coverage = input.monthlyExpenses > 0 ? totalAvailable / 12 / input.monthlyExpenses : null;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="border-b">
                    <CardTitle>Escenario</CardTitle>
                    <CardDescription>Parte de los saldos reales de {label(input.fromPeriodId)}, las tasas planificadas y los flujos recurrentes previstos. Los intereses se reinvierten en su cuenta; el ahorro nuevo se acumula sin rendimiento.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-4 md:grid-cols-3">
                    <label className="space-y-1 text-sm">
                        <span className="text-slate-600">Cambio en las tasas: <strong>{rateShift > 0 ? '+' : ''}{rateShift.toLocaleString('es-CO')} puntos</strong></span>
                        <input type="range" min="-4" max="4" step="0.25" value={rateShift} onChange={event => setRateShift(Number(event.target.value))} className="w-full accent-emerald-600" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-slate-600">Rentabilidad esperada de inversiones de mercado (% E.A.)</span>
                        <Input inputMode="decimal" value={marketReturn} onChange={event => setMarketReturn(event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={includeFlows} onChange={event => setIncludeFlows(event.target.checked)} />
                        Incluir ingresos y gastos recurrentes previstos ({formatCurrency(input.monthlyIncome - input.monthlyExpenses)} al mes)
                    </label>
                </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat title="Intereses disponibles en 12 meses" value={formatCurrency(totalAvailable)} detail={`${formatCurrency(totalAvailable / 12)} al mes · restringidos ${formatCurrency(totalRestricted)}`} />
                <Stat title="Gastos previstos cubiertos" value={pct(coverage)} detail={input.monthlyExpenses > 0 ? `De ${formatCurrency(input.monthlyExpenses)} al mes, solo con intereses disponibles` : 'Sin gastos recurrentes previstos'} />
                <Stat title="Valorización estimada" value={formatCurrency(totalMarket)} detail="Supuesto, no dinero cobrado" />
                <Stat title={`Patrimonio en ${label(last.periodId)}`} value={formatCurrency(last.netWorth)} detail={last.realNetWorth !== null ? `${formatCurrency(last.realNetWorth)} en pesos de hoy` : 'Ingresa el IPC para ver el valor real'} />
            </div>

            <Card>
                <CardContent className="h-72 pt-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={months.map(month => ({ label: label(month.periodId), nominal: Math.round(month.netWorth), real: month.realNetWorth === null ? undefined : Math.round(month.realNetWorth) }))}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                            <YAxis tickFormatter={value => `${Math.round(Number(value) / 1_000_000)} M`} tickLine={false} axisLine={false} fontSize={12} width={56} domain={['auto', 'auto']} />
                            <Tooltip formatter={value => formatCurrency(Number(value))} />
                            <Area type="monotone" dataKey="nominal" name="Patrimonio" stroke="#059669" fill="#059669" fillOpacity={0.12} />
                            <Area type="monotone" dataKey="real" name="En pesos de hoy" stroke="#64748b" fill="none" strokeDasharray="4 4" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="px-0 pt-2 sm:px-6">
                    <Table>
                        <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead className="text-right">Intereses disponibles</TableHead><TableHead className="text-right">Restringidos</TableHead><TableHead className="text-right">Valorización</TableHead><TableHead className="text-right">Cobertura</TableHead><TableHead className="text-right">Patrimonio</TableHead></TableRow></TableHeader>
                        <TableBody>{months.map(month => (
                            <TableRow key={month.periodId}>
                                <TableCell className="capitalize">{label(month.periodId)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(month.interestAvailable)}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-500">{formatCurrency(month.interestRestricted)}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-500">{formatCurrency(month.marketGain)}</TableCell>
                                <TableCell className="text-right tabular-nums">{pct(month.coverage)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(month.netWorth)}</TableCell>
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
