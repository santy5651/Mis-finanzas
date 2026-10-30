import { db } from '@/lib/db/db';
import type {
    Account,
    AccountEntry,
    AccountMovement,
    AccountPlan,
    AccountSnapshot,
    Debt,
    Entity,
    Expense,
    FinancialEvent,
    Income,
    Obligation,
    ObligationEntry,
    ObligationSnapshot,
    Period,
    PlannedCashFlow,
    ProjectedIncome,
    ProjectedIncomeItem,
} from '@/lib/types';

export const BACKUP_VERSION = 2;

export const BACKUP_TABLE_NAMES = [
    'periods',
    'entities',
    'accounts',
    'accountSnapshots',
    'incomes',
    'expenses',
    'debts',
    'projectedIncomeItems',
    'projectedIncomes',
    'accountMovements',
    'accountPlans',
    'plannedCashFlows',
    'financialEvents',
    'accountEntries',
    'obligations',
    'obligationEntries',
    'obligationSnapshots',
] as const;

export interface BackupTables {
    periods: Period[];
    entities: Entity[];
    accounts: Account[];
    accountSnapshots: AccountSnapshot[];
    incomes: Income[];
    expenses: Expense[];
    debts: Debt[];
    projectedIncomeItems: ProjectedIncomeItem[];
    projectedIncomes: ProjectedIncome[];
    accountMovements: AccountMovement[];
    accountPlans: AccountPlan[];
    plannedCashFlows: PlannedCashFlow[];
    financialEvents: FinancialEvent[];
    accountEntries: AccountEntry[];
    obligations: Obligation[];
    obligationEntries: ObligationEntry[];
    obligationSnapshots: ObligationSnapshot[];
}

export interface BackupPayload {
    version: number;
    exportedAt: string;
    tables: BackupTables;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTable(tables: UnknownRecord, name: keyof BackupTables, required = false): unknown[] {
    const value = tables[name];
    if (value === undefined && !required) return [];
    if (!Array.isArray(value)) {
        throw new Error(`La tabla "${name}" no existe o no es una lista.`);
    }
    return value;
}

function assertRecords(tableName: string, rows: unknown[]): UnknownRecord[] {
    if (rows.some(row => !isRecord(row))) {
        throw new Error(`La tabla "${tableName}" contiene registros invalidos.`);
    }
    return rows as UnknownRecord[];
}

function assertIds(tableName: string, rows: UnknownRecord[]): void {
    if (rows.some(row => typeof row.id !== 'string' || row.id.length === 0)) {
        throw new Error(`La tabla "${tableName}" contiene registros sin identificador.`);
    }
}

function normalizeAccounts(rows: UnknownRecord[]): Account[] {
    return rows.map(row => {
        const legacyCategory = typeof row.category === 'string' ? row.category : null;
        const categories = Array.isArray(row.categories)
            ? row.categories.filter((value): value is Account['categories'][number] => typeof value === 'string')
            : legacyCategory
                ? [legacyCategory as Account['categories'][number]]
                : [];

        const { category: _legacyCategory, ...account } = row;
        void _legacyCategory;
        return { ...account, categories } as unknown as Account;
    });
}

function normalizeDebts(rows: UnknownRecord[]): Debt[] {
    return rows.map(row => ({
        ...row,
        seriesId: typeof row.seriesId === 'string' ? row.seriesId : row.id,
        amortizationAmount: typeof row.amortizationAmount === 'number' ? row.amortizationAmount : 0,
        increaseAmount: typeof row.increaseAmount === 'number' ? row.increaseAmount : 0,
        history: Array.isArray(row.history) ? row.history : [],
    })) as unknown as Debt[];
}

export function parseBackup(raw: unknown): BackupPayload {
    if (!isRecord(raw) || !isRecord(raw.tables)) {
        throw new Error('El archivo no tiene el formato de respaldo esperado.');
    }

    const requiredTables: Array<keyof BackupTables> = [
        'periods',
        'entities',
        'accounts',
        'accountSnapshots',
        'incomes',
        'expenses',
        'debts',
    ];
    const tableRows = Object.fromEntries(
        BACKUP_TABLE_NAMES.map(name => [
            name,
            assertRecords(name, readTable(raw.tables as UnknownRecord, name, requiredTables.includes(name))),
        ]),
    ) as Record<keyof BackupTables, UnknownRecord[]>;

    for (const tableName of BACKUP_TABLE_NAMES) {
        assertIds(tableName, tableRows[tableName]);
    }

    return {
        version: typeof raw.version === 'number' ? raw.version : BACKUP_VERSION,
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
        tables: {
            periods: tableRows.periods as unknown as Period[],
            entities: tableRows.entities as unknown as Entity[],
            accounts: normalizeAccounts(tableRows.accounts),
            accountSnapshots: tableRows.accountSnapshots as unknown as AccountSnapshot[],
            incomes: tableRows.incomes as unknown as Income[],
            expenses: tableRows.expenses as unknown as Expense[],
            debts: normalizeDebts(tableRows.debts),
            projectedIncomeItems: tableRows.projectedIncomeItems as unknown as ProjectedIncomeItem[],
            projectedIncomes: tableRows.projectedIncomes as unknown as ProjectedIncome[],
            accountMovements: tableRows.accountMovements as unknown as AccountMovement[],
            accountPlans: tableRows.accountPlans as unknown as AccountPlan[],
            plannedCashFlows: tableRows.plannedCashFlows as unknown as PlannedCashFlow[],
            financialEvents: tableRows.financialEvents as unknown as FinancialEvent[],
            accountEntries: tableRows.accountEntries as unknown as AccountEntry[],
            obligations: tableRows.obligations as unknown as Obligation[],
            obligationEntries: tableRows.obligationEntries as unknown as ObligationEntry[],
            obligationSnapshots: tableRows.obligationSnapshots as unknown as ObligationSnapshot[],
        },
    };
}

export async function createBackup(): Promise<BackupPayload> {
    const [
        periods,
        entities,
        accounts,
        accountSnapshots,
        incomes,
        expenses,
        debts,
        projectedIncomeItems,
        projectedIncomes,
        accountMovements,
        accountPlans,
        plannedCashFlows,
        financialEvents,
        accountEntries,
        obligations,
        obligationEntries,
        obligationSnapshots,
    ] = await Promise.all([
        db.periods.toArray(),
        db.entities.toArray(),
        db.accounts.toArray(),
        db.accountSnapshots.toArray(),
        db.incomes.toArray(),
        db.expenses.toArray(),
        db.debts.toArray(),
        db.projectedIncomeItems.toArray(),
        db.projectedIncomes.toArray(),
        db.accountMovements.toArray(),
        db.accountPlans.toArray(),
        db.plannedCashFlows.toArray(),
        db.financialEvents.toArray(),
        db.accountEntries.toArray(),
        db.obligations.toArray(),
        db.obligationEntries.toArray(),
        db.obligationSnapshots.toArray(),
    ]);

    return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tables: {
            periods,
            entities,
            accounts,
            accountSnapshots,
            incomes,
            expenses,
            debts,
            projectedIncomeItems,
            projectedIncomes,
            accountMovements,
            accountPlans,
            plannedCashFlows,
            financialEvents,
            accountEntries,
            obligations,
            obligationEntries,
            obligationSnapshots,
        },
    };
}

export function migrateLegacyBackup(backup: BackupPayload): BackupPayload {
    const hasV2Data = backup.tables.accountPlans.length
        || backup.tables.financialEvents.length
        || backup.tables.obligations.length;
    if (backup.version >= 2 || hasV2Data) return backup;

    const now = new Date().toISOString();
    const periodRates = new Map(backup.tables.periods.map(period => [period.id, period]));
    const accountCurrencies = new Map(backup.tables.accounts.map(account => [account.id, account.currency]));
    const migratedSnapshots = backup.tables.accountSnapshots.map(snapshot => {
        const legacyPeriod = periodRates.get(snapshot.periodId);
        if (accountCurrencies.get(snapshot.accountId) !== 'USD' || snapshot.usdCopRate || !legacyPeriod?.usdCopRate) return snapshot;
        return { ...snapshot, usdCopRate: legacyPeriod.usdCopRate, trmDate: legacyPeriod.trmDate ?? `${snapshot.periodId}-01`, trmSource: legacyPeriod.trmSource ?? 'MANUAL' as const };
    });
    const accountPlans: AccountPlan[] = migratedSnapshots.flatMap(snapshot => {
        const type = snapshot.projectedIncomeType
            ?? (snapshot.effectiveAnnualRateProjected ? 'FIXED_EA' : undefined);
        if (type !== 'FIXED_EA' && type !== 'VARIABLE_MONTHLY') return [];
        return [{
            id: `plan-${snapshot.id}`,
            periodId: snapshot.periodId,
            accountId: snapshot.accountId,
            concept: snapshot.projectedConcept || 'Rendimiento',
            type,
            rateEA: snapshot.effectiveAnnualRateProjected,
            rateMonthly: snapshot.projectedRateMonthly,
            createdAt: snapshot.createdAt || now,
            updatedAt: snapshot.updatedAt || now,
        }];
    });
    const plannedCashFlows: PlannedCashFlow[] = backup.tables.projectedIncomeItems.map(item => ({
        id: `flow-${item.id}`,
        periodId: item.periodId,
        accountId: item.accountId,
        type: item.type === 'SALARY' ? 'SALARY' : 'OTHER_INCOME',
        concept: item.concept,
        amount: item.amount,
        currency: item.currency,
        isRecurring: item.type === 'SALARY',
        sourcePlanId: item.id,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
    }));

    const obligationMap = new Map<string, Obligation>();
    const entityNames = new Map(backup.tables.entities.map(entity => [entity.id, entity.name]));
    const obligationSnapshots: ObligationSnapshot[] = [];
    backup.tables.debts.forEach(debt => {
        const seriesId = debt.seriesId || debt.id;
        const id = `obligation-${seriesId}`;
        if (!obligationMap.has(seriesId)) {
            obligationMap.set(seriesId, {
                id,
                entityId: debt.entityId,
                name: debt.debtType === 'CREDIT_CARD'
                    ? `Tarjeta ${entityNames.get(debt.entityId) ?? ''}`.trim()
                    : `Deuda ${entityNames.get(debt.entityId) ?? ''}`.trim(),
                direction: 'PAYABLE',
                type: debt.debtType,
                currency: debt.currency,
                dueDay: debt.dueDay,
                notes: debt.notes,
                legacySeriesId: seriesId,
                isActive: true,
                createdAt: now,
                updatedAt: now,
            });
        }
        obligationSnapshots.push({
            id: `obligation-snapshot-${debt.id}`,
            periodId: debt.periodId,
            obligationId: id,
            balance: Math.max(0, debt.amount - (debt.amortizationAmount ?? 0)),
            notes: debt.notes,
            createdAt: now,
            updatedAt: now,
        });
    });

    const financialEvents: FinancialEvent[] = [];
    const accountEntries: AccountEntry[] = [];
    const movementGroups = new Map<string, AccountMovement[]>();
    backup.tables.accountMovements.forEach(movement => {
        const key = movement.transferGroupId || `movement-${movement.id}`;
        movementGroups.set(key, [...(movementGroups.get(key) ?? []), movement]);
    });
    movementGroups.forEach((rows, key) => {
        const first = rows[0];
        const eventId = `legacy-${key}`;
        financialEvents.push({
            id: eventId,
            periodId: first.periodId,
            date: first.date,
            type: first.transferGroupId ? 'TRANSFER' : 'LEGACY_MOVEMENT',
            concept: first.notes || (first.transferGroupId ? 'Transferencia migrada' : 'Movimiento migrado'),
            notes: first.notes,
            legacySourceId: key,
            createdAt: first.createdAt || now,
            updatedAt: now,
        });
        rows.forEach(row => accountEntries.push({
            id: `entry-${row.id}`,
            eventId,
            periodId: row.periodId,
            accountId: row.accountId,
            amount: row.type === 'DEPOSIT' || row.type === 'TRANSFER_IN' ? row.amount : -row.amount,
            currency: row.currency,
            createdAt: row.createdAt || now,
        }));
    });
    backup.tables.incomes.forEach(item => financialEvents.push({
        id: `legacy-income-${item.id}`,
        periodId: item.periodId,
        date: item.date || `${item.periodId}-01`,
        type: 'INCOME',
        concept: item.concept,
        entityId: item.entityId,
        incomeId: item.id,
        incomeKind: item.isSalary ? 'SALARY' : 'OTHER_INCOME',
        notes: 'Registro histórico sin cuenta conciliada',
        legacySourceId: item.id,
        createdAt: now,
        updatedAt: now,
    }));
    backup.tables.expenses.forEach(item => financialEvents.push({
        id: `legacy-expense-${item.id}`,
        periodId: item.periodId,
        date: item.date,
        type: 'EXPENSE',
        concept: item.reason,
        entityId: item.entityId,
        expenseId: item.id,
        installments: item.installments,
        notes: 'Registro histórico sin cuenta conciliada',
        legacySourceId: item.id,
        createdAt: now,
        updatedAt: now,
    }));

    return {
        ...backup,
        version: BACKUP_VERSION,
        tables: {
            ...backup.tables,
            periods: backup.tables.periods.map(period => ({ ...period, status: period.status ?? 'OPEN' })),
            accountSnapshots: migratedSnapshots,
            accountPlans,
            plannedCashFlows,
            financialEvents,
            accountEntries,
            obligations: [...obligationMap.values()],
            obligationEntries: [],
            obligationSnapshots,
        },
    };
}

export async function restoreBackup(backup: BackupPayload): Promise<void> {
    const prepared = migrateLegacyBackup(backup);
    const tables = [
        db.periods,
        db.entities,
        db.accounts,
        db.accountSnapshots,
        db.incomes,
        db.expenses,
        db.debts,
        db.accountMovements,
        db.projectedIncomeItems,
        db.projectedIncomes,
        db.accountPlans,
        db.plannedCashFlows,
        db.financialEvents,
        db.accountEntries,
        db.obligations,
        db.obligationEntries,
        db.obligationSnapshots,
    ];

    await db.transaction('rw', tables, async () => {
        await Promise.all(tables.map(table => table.clear()));
        await Promise.all([
            db.periods.bulkAdd(prepared.tables.periods),
            db.entities.bulkAdd(prepared.tables.entities),
            db.accounts.bulkAdd(prepared.tables.accounts),
            db.accountSnapshots.bulkAdd(prepared.tables.accountSnapshots),
            db.incomes.bulkAdd(prepared.tables.incomes),
            db.expenses.bulkAdd(prepared.tables.expenses),
            db.debts.bulkAdd(prepared.tables.debts),
            db.accountMovements.bulkAdd(prepared.tables.accountMovements),
            db.projectedIncomeItems.bulkAdd(prepared.tables.projectedIncomeItems),
            db.projectedIncomes.bulkAdd(prepared.tables.projectedIncomes),
            db.accountPlans.bulkAdd(prepared.tables.accountPlans),
            db.plannedCashFlows.bulkAdd(prepared.tables.plannedCashFlows),
            db.financialEvents.bulkAdd(prepared.tables.financialEvents),
            db.accountEntries.bulkAdd(prepared.tables.accountEntries),
            db.obligations.bulkAdd(prepared.tables.obligations),
            db.obligationEntries.bulkAdd(prepared.tables.obligationEntries),
            db.obligationSnapshots.bulkAdd(prepared.tables.obligationSnapshots),
        ]);
    });
}

export function getBackupRecordCount(backup: BackupPayload): number {
    return BACKUP_TABLE_NAMES.reduce((total, name) => total + backup.tables[name].length, 0);
}
