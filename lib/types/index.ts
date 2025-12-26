
export type Currency = 'COP' | 'USD';
export type EntityType = 'BANK' | 'FRANCHISE' | 'PERSON' | 'EMPLOYER' | 'BROKER' | 'OTHER';
export type AccountCategory =
  | 'CASH'
  | 'LOW_AMOUNT_ACCOUNT'
  | 'SAVINGS'
  | 'EMERGENCY_FUND'
  | 'INVEST_SHORT'
  | 'INVEST_MEDIUM'
  | 'INVEST_LONG'
  | 'RETIREMENT'
  | 'OTHER';
export type ExpenseMethod = 'DEBIT' | 'CREDIT_CARD' | 'CASH' | 'TRANSFER' | 'OTHER';
export type DebtType = 'CREDIT_CARD' | 'PERSONAL' | 'LOAN' | 'OTHER';

export interface Period {
  id: string; // "YYYY-MM"
  year: number;
  month: number;
  usdCopRate: number | null; // TRM Manual
}

export interface Entity {
  id: string; // UUID
  name: string;
  type?: EntityType;
  notes?: string;
}

export interface Account {
  id: string; // UUID
  name: string;
  entityId: string; // FK Entity
  accountType: string; // "Ahorros", "CDT", etc.
  category: AccountCategory;
  currency: Currency;
  isSalaryAccount?: boolean;
  isActive: boolean;
}

export interface AccountSnapshot {
  id: string; // UUID
  periodId: string; // FK Period "YYYY-MM"
  accountId: string; // FK Account
  balance: number; // Saldo final del mes
  effectiveAnnualRateProjected?: number; // E.A. (ej: 0.12 para 12%)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Income {
  id: string; // UUID
  periodId: string; // FK Period
  date?: string; // ISO Date (opcional)
  entityId?: string | null; // FK Entity (opcional, ej: empleador)
  concept: string;
  amount: number;
  currency: Currency;
  isSalary: boolean;
  method?: string;
  notes?: string;
}

export interface Expense {
  id: string; // UUID
  date: string; // ISO Date
  periodId: string; // Derivado de date
  entityId?: string | null; // FK Entity (a quien se paga)
  reason: string;
  amount: number;
  currency: Currency;
  method: ExpenseMethod;
  installments: number; // Defecto 1
  notes?: string;
}

export interface Debt {
  id: string; // UUID
  periodId: string;
  entityId: string;
  debtType: DebtType;
  amount: number; // Valor de la deuda
  currency: Currency;
  dueDate?: string;
  notes?: string;
}
