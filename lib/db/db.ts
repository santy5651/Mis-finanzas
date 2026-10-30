
import Dexie, { type Table } from 'dexie';
import type {
    Account,
    AccountCategory,
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

type LegacyAccount = Partial<Account> & { category?: AccountCategory };
type LegacyDebt = Partial<Debt> & { id: string; dueDate?: string };
export type {
    Period, Entity, Account, AccountSnapshot,
    Income, Expense, Debt, ProjectedIncome, AccountMovement, ProjectedIncomeItem,
    AccountPlan, PlannedCashFlow, FinancialEvent, AccountEntry,
    Obligation, ObligationEntry, ObligationSnapshot
} from '@/lib/types';

export class PersonalEconomyDB extends Dexie {
    periods!: Table<Period>;
    entities!: Table<Entity>;
    accounts!: Table<Account>;
    accountSnapshots!: Table<AccountSnapshot>;
    incomes!: Table<Income>;
    expenses!: Table<Expense>;
    debts!: Table<Debt>;
    projectedIncomes!: Table<ProjectedIncome>;
    accountMovements!: Table<AccountMovement>;
    projectedIncomeItems!: Table<ProjectedIncomeItem>;
    accountPlans!: Table<AccountPlan>;
    plannedCashFlows!: Table<PlannedCashFlow>;
    financialEvents!: Table<FinancialEvent>;
    accountEntries!: Table<AccountEntry>;
    obligations!: Table<Obligation>;
    obligationEntries!: Table<ObligationEntry>;
    obligationSnapshots!: Table<ObligationSnapshot>;

    constructor() {
        super('PersonalEconomyDB');
        this.version(1).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, category, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId'
        });

        this.version(2).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId'
        }).upgrade(async (tx) => {
            const accountTable = tx.table('accounts');
            await accountTable.toCollection().modify((account: LegacyAccount) => {
                if (!account.categories) {
                    const legacyCategory = account.category;
                    account.categories = legacyCategory ? [legacyCategory] : [];
                }
                delete account.category;
            });
        });

        this.version(3).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId'
        }).upgrade(async (tx) => {
            const debtTable = tx.table('debts');
            await debtTable.toCollection().modify((debt: LegacyDebt) => {
                if (debt.amortizationAmount === undefined || debt.amortizationAmount === null) {
                    debt.amortizationAmount = 0;
                }
            });
        });

        this.version(4).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId'
        }).upgrade(async (tx) => {
            const debtTable = tx.table('debts');
            await debtTable.toCollection().modify((debt: LegacyDebt) => {
                if (debt.dueDay === undefined || debt.dueDay === null) {
                    if (debt.dueDate) {
                        const parts = String(debt.dueDate).split('-');
                        const day = Number(parts[2]);
                        if (!Number.isNaN(day)) {
                            debt.dueDay = day;
                        }
                    }
                }
                delete debt.dueDate;
            });
        });

        this.version(5).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId'
        }).upgrade(async (tx) => {
            const debtTable = tx.table('debts');
            await debtTable.toCollection().modify((debt: LegacyDebt) => {
                if (!debt.seriesId) {
                    debt.seriesId = debt.id;
                }
            });
        });

        this.version(6).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring'
        });

        this.version(7).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring'
        }).upgrade(async (tx) => {
            const debtTable = tx.table('debts');
            await debtTable.toCollection().modify((debt: LegacyDebt) => {
                if (!debt.history) {
                    debt.history = [];
                }
            });
        });

        this.version(8).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring'
        }).upgrade(async (tx) => {
            const debtTable = tx.table('debts');
            await debtTable.toCollection().modify((debt: LegacyDebt) => {
                if (debt.increaseAmount === undefined || debt.increaseAmount === null) {
                    debt.increaseAmount = 0;
                }
                if (!debt.history) {
                    debt.history = [];
                }
            });
        });

        this.version(9).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring',
            accountMovements: 'id, periodId, accountId, type, date, transferGroupId, [periodId+accountId]'
        });

        this.version(10).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring',
            accountMovements: 'id, periodId, accountId, type, date, transferGroupId, [periodId+accountId]'
        }).upgrade(async (tx) => {
            const projectedTable = tx.table('projectedIncomes');
            const snapshotTable = tx.table('accountSnapshots');
            const projectedItems = await projectedTable.toArray() as ProjectedIncome[];
            const snapshotMap = new Map<string, AccountSnapshot>();
            const existingSnapshots = await snapshotTable.toArray() as AccountSnapshot[];
            existingSnapshots.forEach((snap) => {
                snapshotMap.set(`${snap.periodId}:${snap.accountId}`, snap);
            });

            const now = new Date().toISOString();
            for (const item of projectedItems) {
                const key = `${item.periodId}:${item.accountId}`;
                const existing = snapshotMap.get(key);
                const snapshot = existing ?? {
                    id: item.id,
                    periodId: item.periodId,
                    accountId: item.accountId,
                    balance: 0,
                    createdAt: now,
                    updatedAt: now
                };

                const next = {
                    ...snapshot,
                    projectedIncomeType: item.type,
                    projectedConcept: item.concept,
                    projectedRateMonthly: item.type === 'VARIABLE_MONTHLY' ? (item.rateMonthly ?? 0) : snapshot.projectedRateMonthly,
                    projectedAmount: (item.type === 'SALARY' || item.type === 'ONE_TIME') ? (item.amount ?? 0) : snapshot.projectedAmount,
                    effectiveAnnualRateProjected: item.type === 'FIXED_EA'
                        ? (item.rateEA ? item.rateEA / 100 : snapshot.effectiveAnnualRateProjected)
                        : snapshot.effectiveAnnualRateProjected,
                    updatedAt: now
                };

                await snapshotTable.put(next);
            }
        });

        this.version(11).stores({
            periods: 'id, year, month',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring',
            accountMovements: 'id, periodId, accountId, type, date, transferGroupId, [periodId+accountId]',
            projectedIncomeItems: 'id, periodId, accountId, type, [periodId+accountId]'
        });

        this.version(12).stores({
            periods: 'id, year, month, status',
            entities: 'id, name, type',
            accounts: 'id, entityId, *categories, isActive',
            accountSnapshots: 'id, periodId, accountId, [periodId+accountId]',
            incomes: 'id, periodId, date, isSalary',
            expenses: 'id, periodId, date, reason',
            debts: 'id, periodId, entityId, seriesId',
            projectedIncomes: 'id, periodId, date, entityId, accountId, type, isRecurring',
            accountMovements: 'id, periodId, accountId, type, date, transferGroupId, [periodId+accountId]',
            projectedIncomeItems: 'id, periodId, accountId, type, [periodId+accountId]',
            accountPlans: 'id, periodId, accountId, [periodId+accountId]',
            plannedCashFlows: 'id, periodId, accountId, type, isRecurring, [periodId+accountId]',
            financialEvents: 'id, periodId, date, type, legacySourceId',
            accountEntries: 'id, eventId, periodId, accountId, [periodId+accountId]',
            obligations: 'id, entityId, direction, type, isActive, legacySeriesId',
            obligationEntries: 'id, eventId, periodId, obligationId, [periodId+obligationId]',
            obligationSnapshots: 'id, periodId, obligationId, [periodId+obligationId]'
        }).upgrade(async (tx) => {
            const now = new Date().toISOString();
            const periods = tx.table<Period>('periods');
            await periods.toCollection().modify(period => {
                period.status ??= 'OPEN';
            });

            const snapshots = await tx.table<AccountSnapshot>('accountSnapshots').toArray();
            const periodRates = new Map((await periods.toArray()).map(period => [period.id, period]));
            const accountCurrencies = new Map((await tx.table<Account>('accounts').toArray()).map(account => [account.id, account.currency]));
            const snapshotsWithRates = snapshots.map(snapshot => {
                const legacyPeriod = periodRates.get(snapshot.periodId);
                if (accountCurrencies.get(snapshot.accountId) !== 'USD' || snapshot.usdCopRate || !legacyPeriod?.usdCopRate) return snapshot;
                return { ...snapshot, usdCopRate: legacyPeriod.usdCopRate, trmDate: legacyPeriod.trmDate ?? `${snapshot.periodId}-01`, trmSource: legacyPeriod.trmSource ?? 'MANUAL' as const };
            });
            if (snapshotsWithRates.some((snapshot, index) => snapshot !== snapshots[index])) {
                await tx.table<AccountSnapshot>('accountSnapshots').bulkPut(snapshotsWithRates);
            }
            const plans: AccountPlan[] = snapshotsWithRates.flatMap(snapshot => {
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
            if (plans.length) await tx.table<AccountPlan>('accountPlans').bulkPut(plans);

            const projectedItems = await tx.table<ProjectedIncomeItem>('projectedIncomeItems').toArray();
            const plannedFlows: PlannedCashFlow[] = projectedItems.map(item => ({
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
            if (plannedFlows.length) await tx.table<PlannedCashFlow>('plannedCashFlows').bulkPut(plannedFlows);

            const debts = await tx.table<Debt>('debts').toArray();
            const entityNames = new Map((await tx.table<Entity>('entities').toArray()).map(entity => [entity.id, entity.name]));
            const obligationBySeries = new Map<string, Obligation>();
            const obligationSnapshots: ObligationSnapshot[] = [];
            for (const debt of debts) {
                const seriesId = debt.seriesId || debt.id;
                const obligationId = `obligation-${seriesId}`;
                if (!obligationBySeries.has(seriesId)) {
                    obligationBySeries.set(seriesId, {
                        id: obligationId,
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
                    obligationId,
                    balance: Math.max(0, debt.amount - (debt.amortizationAmount ?? 0)),
                    notes: debt.notes,
                    createdAt: now,
                    updatedAt: now,
                });
            }
            if (obligationBySeries.size) {
                await tx.table<Obligation>('obligations').bulkPut([...obligationBySeries.values()]);
                await tx.table<ObligationSnapshot>('obligationSnapshots').bulkPut(obligationSnapshots);
            }

            const eventTable = tx.table<FinancialEvent>('financialEvents');
            const entryTable = tx.table<AccountEntry>('accountEntries');
            const movements = await tx.table<AccountMovement>('accountMovements').toArray();
            const grouped = new Map<string, AccountMovement[]>();
            movements.forEach(movement => {
                const key = movement.transferGroupId || `movement-${movement.id}`;
                grouped.set(key, [...(grouped.get(key) ?? []), movement]);
            });
            for (const [key, rows] of grouped) {
                const first = rows[0];
                const eventId = `legacy-${key}`;
                await eventTable.put({
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
                await entryTable.bulkPut(rows.map(row => ({
                    id: `entry-${row.id}`,
                    eventId,
                    periodId: row.periodId,
                    accountId: row.accountId,
                    amount: row.type === 'DEPOSIT' || row.type === 'TRANSFER_IN' ? row.amount : -row.amount,
                    currency: row.currency,
                    createdAt: row.createdAt || now,
                })));
            }

            const incomes = await tx.table<Income>('incomes').toArray();
            const expenses = await tx.table<Expense>('expenses').toArray();
            const legacyEvents: FinancialEvent[] = [
                ...incomes.map(item => ({
                    id: `legacy-income-${item.id}`,
                    periodId: item.periodId,
                    date: item.date || `${item.periodId}-01`,
                    type: 'INCOME' as const,
                    concept: item.concept,
                    entityId: item.entityId,
                    incomeId: item.id,
                    incomeKind: item.isSalary ? 'SALARY' as const : 'OTHER_INCOME' as const,
                    notes: 'Registro histórico sin cuenta conciliada',
                    legacySourceId: item.id,
                    createdAt: now,
                    updatedAt: now,
                })),
                ...expenses.map(item => ({
                    id: `legacy-expense-${item.id}`,
                    periodId: item.periodId,
                    date: item.date,
                    type: 'EXPENSE' as const,
                    concept: item.reason,
                    entityId: item.entityId,
                    expenseId: item.id,
                    installments: item.installments,
                    notes: 'Registro histórico sin cuenta conciliada',
                    legacySourceId: item.id,
                    createdAt: now,
                    updatedAt: now,
                })),
            ];
            if (legacyEvents.length) await eventTable.bulkPut(legacyEvents);
        });
    }
}

export const db = new PersonalEconomyDB();
