'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parse, subMonths } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/db';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { formatMoney } from '@/lib/utils';
import { toCOP } from '@/lib/calculations/financials';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DeleteButton } from '@/components/ui/delete-button';
import type { AccountSnapshot, ProjectedIncomeItem, ProjectedIncomeType } from '@/lib/types';

type ProjectionInput = {
    concept: string;
    type: ProjectedIncomeType;
    rateEA: string;
    rateMonthly: string;
    amount: string;
};

function normalizeDecimal(value: string) {
    return value.replace('.', ',');
}

function parseDecimal(value: string) {
    const normalized = value.replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDecimal(value: number | undefined) {
    if (value === undefined || Number.isNaN(value)) return '';
    return value.toString().replace('.', ',');
}

function calculateProjectedValues(balance: number, input: ProjectionInput) {
    const type = input.type;
    if (type === 'SALARY' || type === 'ONE_TIME') {
        const amount = parseDecimal(input.amount);
        return {
            amount,
            projectedBalance: balance + amount
        };
    }
    if (type === 'FIXED_EA') {
        const ea = parseDecimal(input.rateEA) / 100;
        const monthlyRate = Math.pow(1 + ea, 1 / 12) - 1;
        const amount = balance * monthlyRate;
        return {
            amount,
            projectedBalance: balance + amount
        };
    }
    const monthlyRate = parseDecimal(input.rateMonthly) / 100;
    const amount = balance * monthlyRate;
    return {
        amount,
        projectedBalance: balance + amount
    };
}

export default function ProjectedIncomesPage() {
    const { periodId } = useActivePeriod();
    const prevPeriodId = useMemo(() => {
        const currentDate = parse(periodId, 'yyyy-MM', new Date());
        return format(subMonths(currentDate, 1), 'yyyy-MM');
    }, [periodId]);
    const accounts = useLiveQuery(() => db.accounts.filter(a => a.isActive).toArray()) || [];
    const entities = useLiveQuery(() => db.entities.toArray()) || [];
    const period = useLiveQuery(() => db.periods.get(periodId), [periodId]);
    const safePeriod = period || { id: periodId, year: 0, month: 0, usdCopRate: null };
    const snapshots = useLiveQuery(
        () => db.accountSnapshots.where('periodId').equals(periodId).toArray(),
        [periodId]
    ) || [];
    const projectedItems = useLiveQuery(
        () => db.projectedIncomeItems.where('periodId').equals(periodId).toArray(),
        [periodId]
    ) || [];

    const snapshotMap = useMemo(() => new Map(snapshots.map(s => [s.accountId, s])), [snapshots]);
    const entityMap = useMemo(() => new Map(entities.map(e => [e.id, e.name])), [entities]);

    const [inputs, setInputs] = useState<Record<string, ProjectionInput>>({});
    const lastSignatureRef = useRef('');
    const [itemDialogOpen, setItemDialogOpen] = useState(false);
    const [itemType, setItemType] = useState<'SALARY' | 'ONE_TIME'>('SALARY');
    const [itemAccountId, setItemAccountId] = useState<string>('');
    const [itemConcept, setItemConcept] = useState('Salario');
    const [itemAmount, setItemAmount] = useState('');

    useEffect(() => {
        const signature = accounts
            .map(account => {
                const snapshot = snapshotMap.get(account.id);
                return `${account.id}:${snapshot?.updatedAt ?? ''}`;
            })
            .join('|');
        if (signature === lastSignatureRef.current) {
            return;
        }

        const nextInputs: Record<string, ProjectionInput> = {};
        accounts.forEach(account => {
            const snapshot = snapshotMap.get(account.id);
            const type = snapshot?.projectedIncomeType
                ?? (snapshot?.effectiveAnnualRateProjected ? 'FIXED_EA' : 'ONE_TIME');
            nextInputs[account.id] = {
                concept: type === 'SALARY' ? 'Salario' : (snapshot?.projectedConcept ?? ''),
                type,
                rateEA: formatDecimal((snapshot?.effectiveAnnualRateProjected ?? 0) * 100),
                rateMonthly: formatDecimal(snapshot?.projectedRateMonthly ?? 0),
                amount: formatDecimal(snapshot?.projectedAmount ?? 0)
            };
        });
        lastSignatureRef.current = signature;
        setInputs(nextInputs);
    }, [accounts, snapshotMap]);

    const upsertSnapshot = async (accountId: string, patch: Partial<AccountSnapshot>) => {
        const existing = await db.accountSnapshots
            .where({ periodId, accountId })
            .first();
        const now = new Date().toISOString();
        const base: AccountSnapshot = existing ?? {
            id: uuidv4(),
            periodId,
            accountId,
            balance: 0,
            createdAt: now,
            updatedAt: now
        };

        await db.accountSnapshots.put({
            ...base,
            ...patch,
            updatedAt: now
        });
    };

    const handleCopyFromPrevious = async () => {
        if (!prevPeriodId) return;
        if (!confirm(`Copiar tasas y conceptos del periodo ${prevPeriodId} al periodo ${periodId}?`)) return;
        const prevSnapshots = await db.accountSnapshots.where('periodId').equals(prevPeriodId).toArray();
        const currentSnapshots = await db.accountSnapshots.where('periodId').equals(periodId).toArray();
        const currentMap = new Map(currentSnapshots.map(s => [s.accountId, s]));
        const now = new Date().toISOString();

        await db.transaction('rw', db.accountSnapshots, async () => {
            for (const prevSnap of prevSnapshots) {
                const existing = currentMap.get(prevSnap.accountId);
                if (!existing) continue;
                await db.accountSnapshots.put({
                    ...existing,
                    projectedIncomeType: prevSnap.projectedIncomeType ?? existing.projectedIncomeType,
                    projectedConcept: prevSnap.projectedConcept ?? existing.projectedConcept,
                    projectedRateMonthly: prevSnap.projectedRateMonthly ?? existing.projectedRateMonthly,
                    projectedAmount: prevSnap.projectedAmount ?? existing.projectedAmount,
                    effectiveAnnualRateProjected: prevSnap.effectiveAnnualRateProjected ?? existing.effectiveAnnualRateProjected,
                    updatedAt: now
                });
            }
        });
    };

    const updateInput = (accountId: string, patch: Partial<ProjectionInput>) => {
        setInputs(prev => ({
            ...prev,
            [accountId]: {
                ...prev[accountId],
                ...patch
            }
        }));
    };

    const resetItemForm = () => {
        setItemType('SALARY');
        setItemAccountId('');
        setItemConcept('Salario');
        setItemAmount('');
    };

    const handleCreateItem = async () => {
        if (!itemAccountId) {
            alert('Selecciona una cuenta.');
            return;
        }
        const account = accounts.find(acc => acc.id === itemAccountId);
        if (!account) return;
        const amount = parseDecimal(itemAmount);
        if (amount <= 0) {
            alert('Ingresa un monto valido.');
            return;
        }
        const concept = itemType === 'SALARY' ? 'Salario' : (itemConcept || 'Ingreso unico');
        const now = new Date().toISOString();
        const item: ProjectedIncomeItem = {
            id: uuidv4(),
            periodId,
            accountId: account.id,
            type: itemType,
            concept,
            amount,
            currency: account.currency,
            createdAt: now,
            updatedAt: now
        };
        await db.projectedIncomeItems.add(item);
        setItemDialogOpen(false);
        resetItemForm();
    };

    const additionalByAccount = useMemo(() => {
        const map = new Map<string, number>();
        projectedItems.forEach(item => {
            const prev = map.get(item.accountId) ?? 0;
            map.set(item.accountId, prev + item.amount);
        });
        return map;
    }, [projectedItems]);

    const rows = accounts.map(account => {
        const snapshot = snapshotMap.get(account.id);
        const input = inputs[account.id];
        const balance = snapshot?.balance ?? 0;
        if (!input) return null;
        const projected = calculateProjectedValues(balance, input);
        const additionalAmount = additionalByAccount.get(account.id) ?? 0;
        return {
            account,
            snapshot,
            input,
            balance,
            projectedAmount: projected.amount,
            projectedBalance: balance + projected.amount + additionalAmount,
            entityName: entityMap.get(account.entityId) || 'Sin Entidad'
        };
    }).filter(Boolean) as Array<{
        account: typeof accounts[number];
        snapshot?: AccountSnapshot;
        input: ProjectionInput;
        balance: number;
        projectedAmount: number;
        projectedBalance: number;
        entityName: string;
    }>;

    const salaryRows = rows.filter(row => row.input.type === 'SALARY');
    const nonSalaryRows = rows.filter(row => row.input.type !== 'SALARY');
    const salaryItems = projectedItems.filter(item => item.type === 'SALARY');
    const oneTimeItems = projectedItems.filter(item => item.type === 'ONE_TIME');
    const totalSalary = salaryRows.reduce((sum, row) => {
        return sum + toCOP(row.projectedAmount, row.account.currency, safePeriod);
    }, 0) + salaryItems.reduce((sum, item) => sum + toCOP(item.amount, item.currency, safePeriod), 0);
    const totalNonSalary = nonSalaryRows.reduce((sum, row) => {
        return sum + toCOP(row.projectedAmount, row.account.currency, safePeriod);
    }, 0) + oneTimeItems.reduce((sum, item) => sum + toCOP(item.amount, item.currency, safePeriod), 0);
    const totalProjected = totalSalary + totalNonSalary;

    const renderTable = (title: string, data: typeof rows) => (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Entidad</TableHead>
                            <TableHead>Cuenta</TableHead>
                            <TableHead>Concepto</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Tasa esperada</TableHead>
                            <TableHead>Saldo actual</TableHead>
                            <TableHead>Saldo esperado</TableHead>
                            <TableHead>Ingreso esperado</TableHead>
                            <TableHead>Moneda</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center text-muted-foreground">
                                    No hay ingresos proyectados en este periodo.
                                </TableCell>
                            </TableRow>
                        )}
                        {data.map(row => {
                            const { account, input, balance, projectedBalance, projectedAmount } = row;
                            const isAmountType = input.type === 'SALARY' || input.type === 'ONE_TIME';
                            const rateValue = input.type === 'FIXED_EA' ? input.rateEA : input.rateMonthly;
                            const rateLabel = input.type === 'FIXED_EA' ? '% EA' : '% mes';
                            return (
                                <TableRow key={account.id}>
                                    <TableCell>{row.entityName}</TableCell>
                                    <TableCell>{account.name}</TableCell>
                                    <TableCell className="min-w-[180px]">
                                        <Input
                                            type="text"
                                            value={input.concept}
                                            onChange={(event) => updateInput(account.id, { concept: event.target.value })}
                                            onBlur={async () => {
                                                await upsertSnapshot(account.id, { projectedConcept: input.concept });
                                            }}
                                            disabled={input.type === 'SALARY'}
                                        />
                                    </TableCell>
                                    <TableCell className="min-w-[170px]">
                                        <Select
                                            value={input.type}
                                            onValueChange={async (val) => {
                                                const type = val as ProjectedIncomeType;
                                                updateInput(account.id, {
                                                    type,
                                                    concept: type === 'SALARY' ? 'Salario' : input.concept
                                                });
                                                await upsertSnapshot(account.id, {
                                                    projectedIncomeType: type,
                                                    projectedConcept: type === 'SALARY' ? 'Salario' : input.concept
                                                });
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="FIXED_EA">Tasa fija (EA)</SelectItem>
                                                <SelectItem value="VARIABLE_MONTHLY">Tasa variable (mes)</SelectItem>
                                                <SelectItem value="SALARY">Salario</SelectItem>
                                                <SelectItem value="ONE_TIME">Ingreso unico</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="min-w-[140px]">
                                        {isAmountType ? (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={rateValue}
                                                    onChange={(event) => {
                                                        const value = normalizeDecimal(event.target.value);
                                                        if (input.type === 'FIXED_EA') {
                                                            updateInput(account.id, { rateEA: value });
                                                        } else {
                                                            updateInput(account.id, { rateMonthly: value });
                                                        }
                                                    }}
                                                    onBlur={async () => {
                                                        if (input.type === 'FIXED_EA') {
                                                            await upsertSnapshot(account.id, { effectiveAnnualRateProjected: parseDecimal(input.rateEA) / 100 });
                                                        } else {
                                                            await upsertSnapshot(account.id, { projectedRateMonthly: parseDecimal(input.rateMonthly) });
                                                        }
                                                    }}
                                                />
                                                <span className="text-xs text-muted-foreground">{rateLabel}</span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>${formatMoney(balance, account.currency)}</TableCell>
                                    <TableCell>${formatMoney(projectedBalance, account.currency)}</TableCell>
                                    <TableCell className="min-w-[160px]">
                                        {isAmountType ? (
                                            <Input
                                                type="text"
                                                inputMode="decimal"
                                                value={input.amount}
                                                onChange={(event) => updateInput(account.id, { amount: normalizeDecimal(event.target.value) })}
                                                onBlur={async () => {
                                                    await upsertSnapshot(account.id, { projectedAmount: parseDecimal(input.amount) });
                                                }}
                                            />
                                        ) : (
                                            `$${formatMoney(projectedAmount, account.currency)}`
                                        )}
                                    </TableCell>
                                    <TableCell>{account.currency}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Ingresos Proyectados ({periodId})</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleCopyFromPrevious}>
                        Copiar del mes anterior
                    </Button>
                    <PeriodSelector />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Proyectado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${formatMoney(totalProjected)} COP
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Salariales: ${formatMoney(totalSalary)} | No salariales: ${formatMoney(totalNonSalary)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Ingresos Proyectados Adicionales</CardTitle>
                    <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => resetItemForm()}>
                                Agregar ingreso
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Nuevo ingreso proyectado</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Cuenta</label>
                                    <Select value={itemAccountId} onValueChange={setItemAccountId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona una cuenta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {accounts.map(account => (
                                                <SelectItem key={account.id} value={account.id}>
                                                    {account.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Tipo</label>
                                    <Select
                                        value={itemType}
                                        onValueChange={(val) => {
                                            const type = val as 'SALARY' | 'ONE_TIME';
                                            setItemType(type);
                                            if (type === 'SALARY') {
                                                setItemConcept('Salario');
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SALARY">Salario</SelectItem>
                                            <SelectItem value="ONE_TIME">Ingreso unico</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Concepto</label>
                                    <Input
                                        type="text"
                                        value={itemConcept}
                                        onChange={(event) => setItemConcept(event.target.value)}
                                        disabled={itemType === 'SALARY'}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Ingreso esperado</label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={itemAmount}
                                        onChange={(event) => setItemAmount(normalizeDecimal(event.target.value))}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button type="button" onClick={handleCreateItem}>
                                        Guardar ingreso
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cuenta</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Ingreso esperado</TableHead>
                                <TableHead>Moneda</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projectedItems.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        No hay ingresos adicionales registrados.
                                    </TableCell>
                                </TableRow>
                            )}
                            {projectedItems.map(item => {
                                const account = accounts.find(acc => acc.id === item.accountId);
                                const isSalary = item.type === 'SALARY';
                                return (
                                    <TableRow key={item.id}>
                                        <TableCell>{account?.name || 'Cuenta'}</TableCell>
                                        <TableCell className="min-w-[180px]">
                                            <Input
                                                type="text"
                                                value={item.concept}
                                                disabled={isSalary}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    db.projectedIncomeItems.update(item.id, {
                                                        concept: value,
                                                        updatedAt: new Date().toISOString()
                                                    });
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell className="min-w-[150px]">
                                            <Select
                                                value={item.type}
                                                onValueChange={(val) => {
                                                    const type = val as 'SALARY' | 'ONE_TIME';
                                                    db.projectedIncomeItems.update(item.id, {
                                                        type,
                                                        concept: type === 'SALARY' ? 'Salario' : item.concept,
                                                        updatedAt: new Date().toISOString()
                                                    });
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SALARY">Salario</SelectItem>
                                                    <SelectItem value="ONE_TIME">Ingreso unico</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className="min-w-[160px]">
                                            <Input
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDecimal(item.amount)}
                                                onChange={(event) => {
                                                    const value = parseDecimal(event.target.value);
                                                    db.projectedIncomeItems.update(item.id, {
                                                        amount: value,
                                                        updatedAt: new Date().toISOString()
                                                    });
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>{item.currency}</TableCell>
                                        <TableCell>
                                            <DeleteButton
                                                onDelete={() => db.projectedIncomeItems.delete(item.id)}
                                                itemName="ingreso proyectado"
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="space-y-6">
                {renderTable('Ingresos Proyectados Salariales', salaryRows)}
                {renderTable('Ingresos Proyectados No Salariales', nonSalaryRows)}
            </div>
        </div>
    );
}
