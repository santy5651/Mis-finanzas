'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert, Download } from 'lucide-react';
import { db } from '@/lib/db/db';
import { saveSetting } from '@/lib/db/settings';
import { computeTaxReport, filingChecks, inflationaryComponent, type TaxReport } from '@/lib/finance/tax';
import { parseAmountInput } from '@/lib/finance/period';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

/** UVT values the user can overwrite; only years whose official value is well established are prefilled. */
const KNOWN_UVT: Record<number, number> = { 2024: 47_065, 2025: 49_799 };
type TaxSettings = { uvt?: number; inflationaryPercent?: number };

export default function TaxPage() {
    const data = useLiveQuery(async () => {
        const [accounts, obligations, periods, snapshots, obligationSnapshots, entries, obligationEntries, events, incomes, settings] = await Promise.all([
            db.accounts.toArray(), db.obligations.toArray(), db.periods.toArray(), db.accountSnapshots.toArray(), db.obligationSnapshots.toArray(),
            db.accountEntries.toArray(), db.obligationEntries.toArray(), db.financialEvents.toArray(), db.incomes.toArray(),
            db.settings.filter(item => item.id.startsWith('tax-')).toArray(),
        ]);
        const years = [...new Set(snapshots.map(item => Number(item.periodId.slice(0, 4))))].sort((a, b) => b - a);
        return { input: { accounts, obligations, periods, snapshots, obligationSnapshots, entries, obligationEntries, events, incomes }, years, settings };
    });
    const [chosenYear, setChosenYear] = useState<number | null>(null);
    const currentYear = new Date().getFullYear();
    const year = chosenYear ?? data?.years.find(item => item < currentYear) ?? data?.years[0] ?? currentYear - 1;
    const report = useMemo(() => data ? computeTaxReport({ ...data.input, year }) : null, [data, year]);
    const stored = (data?.settings.find(item => item.id === `tax-${year}`)?.value ?? {}) as TaxSettings;

    if (!data || !report) return <div className="h-48 animate-pulse rounded-xl bg-slate-100" />;
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-emerald-700">Impuestos</p>
                    <h1 className="page-title">Declaración de renta</h1>
                    <p className="page-description">Los datos de tu año gravable que pide el formulario 210, tomados de lo que ya registraste. Es una hoja de trabajo: no reemplaza la revisión de un contador.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select className="h-9 rounded-lg border bg-white px-3 text-sm" value={year} onChange={event => setChosenYear(Number(event.target.value))} aria-label="Año gravable">
                        {[...new Set([...data.years, year])].sort((a, b) => b - a).map(item => <option key={item} value={item}>Año gravable {item}</option>)}
                    </select>
                    <Button variant="outline" onClick={() => exportCsv(report, stored)}><Download /> CSV</Button>
                </div>
            </div>
            <Notices report={report} />
            <WealthCard report={report} />
            <IncomeCard key={`income-${year}`} report={report} stored={stored} />
            <FilingCard key={`filing-${year}`} report={report} stored={stored} />
        </div>
    );
}

function Notices({ report }: { report: TaxReport }) {
    const notices = [
        !report.closingPeriodId.endsWith('-12') && `El año ${report.year} aún no termina: el patrimonio corresponde al último cierre disponible (${report.closingPeriodId}).`,
        report.closingPeriodId.endsWith('-12') && !report.closingIsClosed && `Diciembre de ${report.year} no está cerrado: el patrimonio puede cambiar.`,
        report.assets.some(item => item.estimated) && `Sin saldo real de ${report.closingPeriodId} en ${report.assets.filter(item => item.estimated).map(item => item.name).join(', ')}: se estimó con el saldo del mes anterior más los movimientos.`,
        report.missingRate.length > 0 && `Falta la TRM de ${report.closingPeriodId}: ${report.missingRate.join(', ')} no se suma.`,
    ].filter(Boolean) as string[];
    if (!notices.length) return null;
    return <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notices.map(text => <p key={text} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" />{text}</p>)}</div>;
}

function WealthCard({ report }: { report: TaxReport }) {
    return (
        <Card>
            <CardHeader className="border-b"><CardTitle>{report.closingPeriodId.endsWith('-12') ? `Patrimonio al 31 de diciembre de ${report.year}` : `Patrimonio a ${report.closingPeriodId} (año en curso)`}</CardTitle><CardDescription>Saldos del cierre de {report.closingPeriodId}. Las cuentas en USD se valoran con la TRM de ese cierre.</CardDescription></CardHeader>
            <CardContent className="px-0 sm:px-6">
                <Table>
                    <TableHeader><TableRow><TableHead>Cuenta</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">En COP</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {report.assets.map(item => (
                            <TableRow key={item.name}>
                                <TableCell>{item.name}<span className="ml-2 text-xs text-slate-500">{[item.currency === 'USD' && 'en USD', item.restricted && 'restringida', item.estimated && 'estimado'].filter(Boolean).join(' · ')}</span></TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(item.native, item.currency)}</TableCell>
                                <TableCell className="text-right tabular-nums">{item.cop === null ? 'Sin TRM' : formatCurrency(item.cop)}</TableCell>
                            </TableRow>
                        ))}
                        <Total label="Cuentas por cobrar" value={report.receivables} />
                        <Total label="Patrimonio bruto" value={report.grossWealth} strong />
                        <Total label="Deudas" value={-report.debts} />
                        <Total label="Patrimonio líquido" value={report.netWealth} strong />
                        <Total label="De ello, saldos en USD (revisa si aplica el formulario 160 de activos en el exterior)" value={report.foreignCurrencyAssets} />
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
    return <TableRow className={strong ? 'bg-slate-50 font-semibold' : ''}><TableCell colSpan={2}>{label}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(value)}</TableCell></TableRow>;
}

function IncomeCard({ report, stored }: { report: TaxReport; stored: TaxSettings }) {
    const [percent, setPercent] = useState(stored.inflationaryPercent !== undefined ? String(stored.inflationaryPercent) : '');
    const parsed = parseAmountInput(percent.replace(',', '.'));
    const nonTaxable = parsed === null ? null : inflationaryComponent(report.interest, parsed);
    const rows: Array<[string, number, string?]> = [
        ['Ingresos laborales (salario)', report.laborIncome],
        ['Otros ingresos', report.otherIncome],
        ['Rendimientos financieros (intereses)', report.interest],
        ['Dividendos y distribuciones', report.dividends],
        ['Resultado realizado de inversiones', report.realizedGains, 'Puede ser renta o ganancia ocasional según el caso'],
        ['Rendimientos en cuentas restringidas (cesantías)', report.restrictedReturns, 'Tratamiento propio: revísalo aparte'],
        ['Valorización no realizada', report.unrealized, 'No es ingreso del año; ya está en el patrimonio'],
    ];
    return (
        <Card>
            <CardHeader className="border-b"><CardTitle>Ingresos y rendimientos de {report.year}</CardTitle><CardDescription>Suma de los doce meses, en COP con la TRM de cada mes.</CardDescription></CardHeader>
            <CardContent className="space-y-4 px-0 pt-2 sm:px-6">
                <Table><TableBody>{rows.map(([label, value, hint]) => (
                    <TableRow key={label}><TableCell>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(value)}</TableCell></TableRow>
                ))}</TableBody></Table>
                <div className="flex flex-wrap items-center gap-2 px-4 text-sm sm:px-0">
                    <span className="text-slate-700">Componente inflacionario (% que publica la DIAN para {report.year}):</span>
                    <Input className="h-8 w-24" inputMode="decimal" value={percent} onChange={event => setPercent(event.target.value)} />
                    <Button size="sm" variant="ghost" disabled={parsed === null} onClick={() => saveSetting(`tax-${report.year}`, { ...stored, inflationaryPercent: parsed })}>Guardar</Button>
                    {nonTaxable !== null && <span className="text-slate-600">No gravado {formatCurrency(nonTaxable)} · gravado {formatCurrency(report.interest - nonTaxable)}</span>}
                </div>
            </CardContent>
        </Card>
    );
}

function FilingCard({ report, stored }: { report: TaxReport; stored: TaxSettings }) {
    const [uvt, setUvt] = useState(String(stored.uvt ?? KNOWN_UVT[report.year] ?? ''));
    const value = parseAmountInput(uvt);
    const checks = value ? filingChecks(report, value) : [];
    return (
        <Card>
            <CardHeader className="border-b"><CardTitle>¿Debes declarar por {report.year}?</CardTitle><CardDescription>Basta con superar uno de los topes. Verifica la UVT del año en dian.gov.co; las consignaciones son aproximadas (todo lo que entró a tus cuentas).</CardDescription></CardHeader>
            <CardContent className="space-y-3 px-0 pt-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 px-4 text-sm sm:px-0">
                    <span className="text-slate-700">UVT {report.year}:</span>
                    <Input className="h-8 w-28" type="number" min="0" value={uvt} onChange={event => setUvt(event.target.value)} />
                    <Button size="sm" variant="ghost" disabled={!value} onClick={() => saveSetting(`tax-${report.year}`, { ...stored, uvt: value })}>Guardar</Button>
                </div>
                {checks.length > 0 && (
                    <Table>
                        <TableHeader><TableRow><TableHead>Tope</TableHead><TableHead className="text-right">Tu valor</TableHead><TableHead className="text-right">Límite</TableHead><TableHead className="text-right">Resultado</TableHead></TableRow></TableHeader>
                        <TableBody>{checks.map(check => (
                            <TableRow key={check.label}>
                                <TableCell>{check.label}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(check.value)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(check.limit)} <span className="text-xs text-slate-500">({check.limitUvt.toLocaleString('es-CO')} UVT)</span></TableCell>
                                <TableCell className={`text-right font-medium ${check.exceeded ? 'text-amber-700' : 'text-emerald-700'}`}>{check.exceeded ? 'Lo superas' : 'Por debajo'}</TableCell>
                            </TableRow>
                        ))}</TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

function exportCsv(report: TaxReport, stored: TaxSettings) {
    const rows: Array<[string, number | string]> = [
        ['Año gravable', report.year],
        ...report.assets.map(item => [`Saldo ${item.name} (${item.currency})`, item.native] as [string, number]),
        ['Cuentas por cobrar', report.receivables],
        ['Patrimonio bruto', report.grossWealth],
        ['Deudas', report.debts],
        ['Patrimonio líquido', report.netWealth],
        ['Saldos en USD (COP)', report.foreignCurrencyAssets],
        ['Ingresos laborales', report.laborIncome],
        ['Otros ingresos', report.otherIncome],
        ['Rendimientos financieros', report.interest],
        ['Componente inflacionario (%)', stored.inflationaryPercent ?? ''],
        ['Dividendos', report.dividends],
        ['Resultado realizado', report.realizedGains],
        ['Rendimientos cuentas restringidas', report.restrictedReturns],
        ['Consumos con tarjeta', report.cardPurchases],
        ['Entradas a cuentas (aprox. consignaciones)', report.deposits],
    ];
    const csv = ['Concepto;Valor', ...rows.map(([label, value]) => `"${label.replace(/"/g, '""')}";${typeof value === 'number' ? Math.round(value * 100) / 100 : value}`)].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `renta-${report.year}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}
