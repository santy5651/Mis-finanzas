
import Dexie, { type Table } from 'dexie';
import type { ProjectedIncome } from '@/lib/types';
export type {
    Period, Entity, Account, AccountSnapshot,
    Income, Expense, Debt, ProjectedIncome
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
    }
}

export const db = new PersonalEconomyDB();
