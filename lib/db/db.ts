
import Dexie, { type Table } from 'dexie';
export type {
    Period, Entity, Account, AccountSnapshot,
    Income, Expense, Debt
} from '@/lib/types';

export class PersonalEconomyDB extends Dexie {
    periods!: Table<Period>;
    entities!: Table<Entity>;
    accounts!: Table<Account>;
    accountSnapshots!: Table<AccountSnapshot>;
    incomes!: Table<Income>;
    expenses!: Table<Expense>;
    debts!: Table<Debt>;

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
    }
}

export const db = new PersonalEconomyDB();
