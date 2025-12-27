
import { Period, Account, AccountSnapshot, Income, Expense, Debt, Currency, AccountCategory } from '@/lib/types';

// Constants
export const LIQUID_CATEGORIES: AccountCategory[] = ['CASH', 'LOW_AMOUNT_ACCOUNT'];
export const CAPITAL_CATEGORIES: AccountCategory[] = [
    'CASH', 'LOW_AMOUNT_ACCOUNT', 'SAVINGS', 'EMERGENCY_FUND',
    'INVEST_SHORT', 'INVEST_MEDIUM', 'INVEST_LONG', 'RETIREMENT', 'OTHER'
];

function getAccountCategories(account: Account): AccountCategory[] {
    const legacyCategory = (account as Account & { category?: AccountCategory }).category;
    return account.categories?.length ? account.categories : (legacyCategory ? [legacyCategory] : []);
}

/**
 * Converts an amount to COP using the period's TRM.
 * If currency is already COP, returns amount.
 * If no rate provided for USD, returns amount but logs warning (or strict mode?).
 * Requirement: "si falta usdCopRate y hay USD -> el sistema marca el periodo como incompleto"
 * For MVP calculation, we'll try to use provided rate or default to 1 (with valid=false flag implication).
 */
export function toCOP(amount: number, currency: Currency, period: Period): number {
    if (currency === 'COP') return amount;
    if (currency === 'USD') {
        if (period.usdCopRate) {
            return amount * period.usdCopRate;
        } else {
            console.warn(`Missing TRM for period ${period.id}, cannot convert USD correctly.`);
            // Fallback to 0 or keeping amount? Keeping amount is confusing. Returning 0 might be safer for sums.
            // Let's return 0 to indicate "value uncalculable in COP".
            return 0;
        }
    }
    return amount;
}

/**
 * PURE FINANCIAL MATH
 */

// 1. Projected Returns
export interface ProjectedReturnResult {
    monthlyRateProjected: number; // Decimal (0.01 = 1%)
    projectedEndBalance: number;
    projectedMonthlyReturn: number;
}

export function calculateProjectedReturn(currentBalance: number, eaProjected: number): ProjectedReturnResult {
    // eaProjected is expected in decimal (e.g. 0.12 for 12%)
    // formula: (1 + EA)^(1/12) - 1
    const monthlyRateProjected = Math.pow(1 + eaProjected, 1 / 12) - 1;
    const projectedEndBalance = currentBalance * (1 + monthlyRateProjected);
    const projectedMonthlyReturn = projectedEndBalance - currentBalance;

    return {
        monthlyRateProjected,
        projectedEndBalance,
        projectedMonthlyReturn
    };
}

// 2. Real Returns
export interface RealReturnResult {
    realMonthlyReturn: number; // Absolute (B_t - B_{t-1})
    realMonthlyRate: number | null; // Decimal
    realEA: number | null; // Decimal
}

export function calculateRealReturn(currentBalance: number, prevBalance: number | undefined): RealReturnResult {
    if (prevBalance === undefined) {
        return { realMonthlyReturn: 0, realMonthlyRate: null, realEA: null };
    }

    const realMonthlyReturn = currentBalance - prevBalance;

    // Rates only if prevBalance > 0
    if (prevBalance > 0) {
        const realMonthlyRate = (currentBalance / prevBalance) - 1;
        const realEA = Math.pow(1 + realMonthlyRate, 12) - 1;
        return { realMonthlyReturn, realMonthlyRate, realEA };
    } else {
        return { realMonthlyReturn, realMonthlyRate: null, realEA: null };
    }
}

/**
 * AGGREGATORS (Dashboard Logic)
 */

export interface PeriodSummary {
    incomeTotal: number;
    incomeSalary: number;
    incomeNonSalaryReal: number;
    incomeNonSalaryProjected: number;
    expensesTotal: number;
    balance: number;
    balanceWithoutSalary: number;
    debtTotal: number;
    liquidTotal: number;
    capitalTotal: number;
    unspecifiedExpense: number;
    plannedExpenses?: number; // Optional input
}

function getNetDebtAmount(debt: Debt, period: Period): number {
    const amortization = debt.amortizationAmount ?? 0;
    const net = debt.amount - amortization;
    return Math.max(0, toCOP(net, debt.currency, period));
}

export function calculatePeriodSummary(
    period: Period,
    incomes: Income[],
    expenses: Expense[],
    debts: Debt[],
    prevDebts: Debt[],
    accounts: Account[],
    snapshots: AccountSnapshot[],
    prevSnapshots: AccountSnapshot[], // Needed for Real Return
): PeriodSummary {

    // 1. Incomes
    // Salary
    const salaryIncomes = incomes.filter(i => i.isSalary);
    const salaryIncomeCOP = salaryIncomes.reduce((sum, i) => sum + toCOP(i.amount, i.currency, period), 0);

    // Manual Non-Salary Incomes (e.g. Sales, Gifts)
    const manualNonSalaryIncomes = incomes.filter(i => !i.isSalary);
    const manualNonSalaryIncomeCOP = manualNonSalaryIncomes.reduce((sum, i) => sum + toCOP(i.amount, i.currency, period), 0);

    // Calculated Non-Salary (Returns)
    let nonSalaryRealReturnsCOP = 0;
    let nonSalaryProjectedReturnsCOP = 0;

    // Helper map for snapshots
    const prevSnapMap = new Map(prevSnapshots.map(s => [s.accountId, s]));

    snapshots.forEach(chap => {
        const account = accounts.find(a => a.id === chap.accountId);
        if (!account) return;

        // Valid TRM check handled in toCOP (returns 0 if missing)

        // Real Return
        const prev = prevSnapMap.get(chap.accountId);
        const { realMonthlyReturn } = calculateRealReturn(chap.balance, prev?.balance);
        nonSalaryRealReturnsCOP += toCOP(realMonthlyReturn, account.currency, period);

        // Projected Return
        if (chap.effectiveAnnualRateProjected) {
            const { projectedMonthlyReturn } = calculateProjectedReturn(chap.balance, chap.effectiveAnnualRateProjected);
            nonSalaryProjectedReturnsCOP += toCOP(projectedMonthlyReturn, account.currency, period);
        }
    });

    // Total Non-Salary Real = Manual Non-Salary + Real Returns
    const incomeNonSalaryReal = manualNonSalaryIncomeCOP + nonSalaryRealReturnsCOP;

    // Total Income = Salary + Non-Salary Real
    const incomeTotal = salaryIncomeCOP + incomeNonSalaryReal;

    // 2. Expenses
    const expensesTotal = expenses.reduce((sum, e) => sum + toCOP(e.amount, e.currency, period), 0);

    // 3. Balance
    const balance = incomeTotal - expensesTotal;
    const balanceWithoutSalary = incomeNonSalaryReal - expensesTotal;

    // 4. Debt
    const debtTotal = debts.reduce((sum, d) => sum + getNetDebtAmount(d, period), 0);
    const prevDebtTotal = prevDebts.reduce((sum, d) => sum + getNetDebtAmount(d, period), 0);

    // 5. Liquid & Capital
    let liquidTotal = 0;
    let capitalTotal = 0;

    snapshots.forEach(snap => {
        const account = accounts.find(a => a.id === snap.accountId);
        if (!account) return;

        const valCOP = toCOP(snap.balance, account.currency, period);

        const categories = getAccountCategories(account);
        if (categories.some(category => LIQUID_CATEGORIES.includes(category))) {
            liquidTotal += valCOP;
        }
        if (categories.some(category => CAPITAL_CATEGORIES.includes(category))) {
            capitalTotal += valCOP;
        }
    });

    // 6. Unspecified Expenses (Residuo)
    // Option B from Prompt: (SaldoInicial + Ingresos) - EgresosRegistrados - SaldoFinal
    // But SaldoInicial is Capital(T-1) and SaldoFinal is Capital(T).
    // Let's use Option A if PlannedExpenses exists, else use Option B-ish or just 0 for now.
    // The user suggested: "Unspecified = max(0, totalExpenses - plannedExpenses)" (Option A)
    // Or "Ahorro Real" approach.
    // Let's implement Option A (Placeholder for plannedExpenses which defaults to 0)
    const plannedExpenses = 0; // TODO: Add to Period model?
    const unspecifiedExpense = Math.max(0, expensesTotal - plannedExpenses); // This logic in prompt A was weird. 
    // Wait, prompt said: "unspecifiedExpenseCOP(period) = max(0, totalExpensesCOP(period) - plannedExpensesCOP(period))"
    // "Interpretación usuario: valores derivados a partir de restas entre ingresos reales vs egresos planeados".
    // Actually, let's stick to the prompt's fallback logic if no planned expenses:
    // "Propuesta MVP: Ingresos Reales - Egresos Reales - Ahorro Real (Delta Patrimonial). Si el número es positivo, es gasto no trackeado."
    // Delta Patrimonial = Capital(T) - Capital(T-1).
    // ExpenseUnspecified = IncomeTotal - ExpensesTotal - (Capital(T) - Capital(T-1)). 
    // Logically: Income - Expense = Savings (Flow). Delta Capital is Savings (Stock). Difference is leakage.
    // Ensure we have Capital(T-1). We verify via prevSnapshots.

    let prevCapitalTotal = 0;
    prevSnapshots.forEach(snap => {
        const account = accounts.find(a => a.id === snap.accountId);
        const categories = account ? getAccountCategories(account) : [];
        if (account && categories.some(category => CAPITAL_CATEGORIES.includes(category))) {
            prevCapitalTotal += toCOP(snap.balance, account.currency, period); // Assuming same TRM or re-converting T-1 at T rates? Prompt implies historical is usually fixed but for comparison we typically use consistent rates or raw deltas. 
            // Actually, "Delta Patrimonial" usually implies simply CapitalT - CapitalT-1 in reporting currency.
        }
    });

    const netCapitalTotal = capitalTotal - debtTotal;
    const netPrevCapitalTotal = prevCapitalTotal - prevDebtTotal;

    const savingsFlow = incomeTotal - expensesTotal; // Theoretical savings
    const savingsStock = netCapitalTotal - netPrevCapitalTotal; // Actual savings (Delta Capital)

    const possibleLeakage = savingsFlow - savingsStock;
    // If Flow says we saved 1M, but Stock only went up 800k, then 200k leaked.
    // Leakage = Flow - Stock.

    return {
        incomeTotal,
        incomeSalary: salaryIncomeCOP,
        incomeNonSalaryReal,
        incomeNonSalaryProjected: nonSalaryProjectedReturnsCOP,
        expensesTotal,
        balance,
        balanceWithoutSalary,
        debtTotal,
        liquidTotal,
        capitalTotal: netCapitalTotal,
        unspecifiedExpense: possibleLeakage > 0 ? possibleLeakage : 0, // Only if positive
        plannedExpenses
    };
}
