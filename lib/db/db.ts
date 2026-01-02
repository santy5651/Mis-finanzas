
import Dexie, { type Table } from 'dexie';
import type { ProjectedIncome, AccountMovement, ProjectedIncomeItem } from '@/lib/types';
export type {
    Period, Entity, Account, AccountSnapshot,
    Income, Expense, Debt, ProjectedIncome, AccountMovement, ProjectedIncomeItem
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
            await accountTable.toCollection().modify((account: any) => {
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
            await debtTable.toCollection().modify((debt: any) => {
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
            await debtTable.toCollection().modify((debt: any) => {
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
            await debtTable.toCollection().modify((debt: any) => {
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
            await debtTable.toCollection().modify((debt: any) => {
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
            await debtTable.toCollection().modify((debt: any) => {
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
            const projectedItems = await projectedTable.toArray();
            const snapshotMap = new Map<string, any>();
            const existingSnapshots = await snapshotTable.toArray();
            existingSnapshots.forEach((snap: any) => {
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
    }
}

export const db = new PersonalEconomyDB();
