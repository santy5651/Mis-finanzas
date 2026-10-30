
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
export type ProjectedIncomeType = 'FIXED_EA' | 'VARIABLE_MONTHLY' | 'ONE_TIME' | 'SALARY';
export type AccountMovementType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type PeriodStatus = 'OPEN' | 'CLOSED';
export type RateSource = 'SFC' | 'MANUAL';
export type ObligationDirection = 'PAYABLE' | 'RECEIVABLE';
export type ObligationType = DebtType | 'RECEIVABLE';
export type FinancialEventType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'PASSIVE_RETURN'
  | 'OBLIGATION_PAYMENT'
  | 'RECEIVABLE_LOAN'
  | 'RECEIVABLE_COLLECTION'
  | 'ADJUSTMENT'
  | 'LEGACY_MOVEMENT';
export type PlannedCashFlowType = 'SALARY' | 'OTHER_INCOME' | 'EXPENSE';
/** How an account produces returns: credited interest, or market value changes (funds, brokers). */
export type ReturnBehavior = 'INTEREST' | 'MARKET_VALUE';
export type ReturnKind =
  | 'INTEREST'
  | 'DIVIDEND'
  | 'REALIZED_GAIN'
  | 'UNREALIZED_VALUATION'
  | 'CASHBACK'
  | 'OTHER';

export interface Period {
  id: string; // "YYYY-MM"
  year: number;
  month: number;
  usdCopRate: number | null;
  status?: PeriodStatus;
  closedAt?: string;
  trmDate?: string;
  trmValidFrom?: string;
  trmValidTo?: string;
  trmSource?: RateSource;
  acknowledgedUnexplained?: boolean;
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
  categories: AccountCategory[];
  currency: Currency;
  isSalaryAccount?: boolean;
  isActive: boolean;
  returnBehavior?: ReturnBehavior; // Defecto INTEREST
  isRestricted?: boolean; // Patrimonio, pero no disponible para gastos (cesantías, encargos)
  legalHolder?: string; // Titular legal cuando no es el dueño económico
}

export interface AccountSnapshot {
  id: string; // UUID
  periodId: string; // FK Period "YYYY-MM"
  accountId: string; // FK Account
  balance: number; // Saldo final del mes
  effectiveAnnualRateProjected?: number; // E.A. (ej: 0.12 para 12%)
  projectedIncomeType?: ProjectedIncomeType;
  projectedRateMonthly?: number; // Percent (2 = 2% mensual)
  projectedAmount?: number; // Used for salary or one-time
  projectedConcept?: string;
  usdCopRate?: number;
  trmDate?: string;
  trmSource?: RateSource;
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
  accountId?: string;
  financialEventId?: string;
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
  isRecurring?: boolean; // Gasto mensual persistente
  notes?: string;
  paymentAccountId?: string;
  obligationId?: string;
  financialEventId?: string;
}

export interface Debt {
  id: string; // UUID
  seriesId: string; // UUID for same debt across months
  periodId: string;
  entityId: string;
  debtType: DebtType;
  amount: number; // Valor de la deuda
  amortizationAmount?: number; // Aporte a capital en el mes
  increaseAmount?: number; // Incremento del mes
  currency: Currency;
  dueDay?: number; // Dia del mes (1-31)
  notes?: string;
  history?: DebtHistoryEntry[];
}

export interface DebtHistoryEntry {
  id: string; // UUID
  type: 'AMORTIZATION' | 'INCREASE';
  amount: number;
  note?: string;
  createdAt: string;
}

export interface ProjectedIncome {
  id: string; // UUID
  periodId: string;
  date?: string; // ISO Date
  entityId?: string | null;
  accountId: string; // Account used for balance
  concept: string;
  currency: Currency;
  type: ProjectedIncomeType;
  rateEA?: number; // Percent (12 = 12% EA)
  rateMonthly?: number; // Percent (2 = 2% mensual)
  amount?: number; // Used for salary
  isRecurring?: boolean;
  notes?: string;
}

export interface ProjectedIncomeItem {
  id: string; // UUID
  periodId: string;
  accountId: string;
  type: 'SALARY' | 'ONE_TIME';
  concept: string;
  amount: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}

export interface AccountMovement {
  id: string; // UUID
  periodId: string; // "YYYY-MM"
  accountId: string; // FK Account
  date: string; // ISO Date
  type: AccountMovementType;
  amount: number;
  currency: Currency;
  relatedAccountId?: string;
  transferGroupId?: string;
  notes?: string;
  createdAt: string;
}

export interface AccountPlan {
  id: string;
  periodId: string;
  accountId: string;
  concept: string;
  type: 'FIXED_EA' | 'VARIABLE_MONTHLY';
  rateEA?: number;
  rateMonthly?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedCashFlow {
  id: string;
  periodId: string;
  accountId: string;
  type: PlannedCashFlowType;
  concept: string;
  amount: number;
  currency: Currency;
  isRecurring: boolean;
  sourcePlanId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialEvent {
  id: string;
  periodId: string;
  date: string;
  type: FinancialEventType;
  concept: string;
  entityId?: string | null;
  expenseId?: string;
  incomeId?: string;
  incomeKind?: 'SALARY' | 'OTHER_INCOME';
  returnKind?: ReturnKind; // Solo PASSIVE_RETURN; sin valor se infiere del perfil de la cuenta
  plannedCashFlowId?: string;
  obligationId?: string;
  installments?: number;
  effectiveExchangeRate?: number;
  notes?: string;
  legacySourceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Signed amount in the account's native currency. Positive enters; negative leaves. */
export interface AccountEntry {
  id: string;
  eventId: string;
  periodId: string;
  accountId: string;
  amount: number;
  currency: Currency;
  createdAt: string;
}

export interface Obligation {
  id: string;
  entityId: string;
  name: string;
  direction: ObligationDirection;
  type: ObligationType;
  currency: Currency;
  dueDay?: number;
  notes?: string;
  legacySeriesId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Signed amount: positive increases the outstanding balance; negative reduces it. */
export interface ObligationEntry {
  id: string;
  eventId: string;
  periodId: string;
  obligationId: string;
  amount: number;
  currency: Currency;
  createdAt: string;
}

export interface ObligationSnapshot {
  id: string;
  periodId: string;
  obligationId: string;
  balance: number;
  usdCopRate?: number;
  trmDate?: string;
  trmSource?: RateSource;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
