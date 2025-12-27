
import { z } from 'zod';

export const currencySchema = z.enum(['COP', 'USD']);
export const entityTypeSchema = z.enum(['BANK', 'FRANCHISE', 'PERSON', 'EMPLOYER', 'BROKER', 'OTHER']);
export const accountCategorySchema = z.enum([
    'CASH', 'LOW_AMOUNT_ACCOUNT', 'SAVINGS', 'EMERGENCY_FUND',
    'INVEST_SHORT', 'INVEST_MEDIUM', 'INVEST_LONG', 'RETIREMENT', 'OTHER'
]);
export const expenseMethodSchema = z.enum(['DEBIT', 'CREDIT_CARD', 'CASH', 'TRANSFER', 'OTHER']);
export const debtTypeSchema = z.enum(['CREDIT_CARD', 'PERSONAL', 'LOAN', 'OTHER']);
export const debtHistoryEntrySchema = z.object({
    id: z.string().uuid(),
    type: z.enum(['AMORTIZATION', 'INCREASE']),
    amount: z.coerce.number().min(0),
    note: z.string().optional(),
    createdAt: z.string()
});
export const projectedIncomeTypeSchema = z.enum(['FIXED_EA', 'VARIABLE_MONTHLY', 'ONE_TIME', 'SALARY']);

export const periodSchema = z.object({
    id: z.string().regex(/^\d{4}-\d{2}$/, "El formato debe ser YYYY-MM"),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    usdCopRate: z.coerce.number().positive().nullable(),
});

export const entitySchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, "El nombre es obligatorio"),
    type: entityTypeSchema.optional(),
    notes: z.string().optional(),
});

export const accountSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, "El nombre es obligatorio"),
    entityId: z.string().uuid(),
    accountType: z.string().min(1, "El tipo es obligatorio"),
    categories: z.array(accountCategorySchema).min(1, "Seleccione al menos una categoria"),
    currency: currencySchema,
    isSalaryAccount: z.boolean().optional(),
    isActive: z.boolean(),
});

export const accountSnapshotSchema = z.object({
    id: z.string().uuid(),
    periodId: z.string(),
    accountId: z.string().uuid(),
    balance: z.coerce.number(),
    effectiveAnnualRateProjected: z.coerce.number().optional(), // 0.12 for 12%
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const incomeSchema = z.object({
    id: z.string().uuid(),
    periodId: z.string(),
    date: z.string().optional(),
    entityId: z.string().optional(),
    concept: z.string().min(1, "El concepto es obligatorio"),
    amount: z.coerce.number().positive(),
    currency: currencySchema,
    isSalary: z.boolean(),
    method: z.string().optional(),
    notes: z.string().optional(),
});

export const expenseSchema = z.object({
    id: z.string().uuid(),
    date: z.string(),
    periodId: z.string(),
    entityId: z.string().optional(),
    reason: z.string().min(1, "La razon es obligatoria"),
    amount: z.coerce.number().positive(),
    currency: currencySchema,
    method: expenseMethodSchema,
    installments: z.coerce.number().int().min(1),
    isRecurring: z.boolean().optional(),
    notes: z.string().optional(),
});

export const debtSchema = z.object({
    id: z.string().uuid(),
    seriesId: z.string().uuid(),
    periodId: z.string(),
    entityId: z.string(),
    debtType: debtTypeSchema,
    amount: z.coerce.number().positive(),
    amortizationAmount: z.coerce.number().min(0).optional(),
    increaseAmount: z.coerce.number().min(0).optional(),
    currency: currencySchema,
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    notes: z.string().optional(),
    history: z.array(debtHistoryEntrySchema).optional(),
});

export const projectedIncomeSchema = z.object({
    id: z.string().uuid(),
    periodId: z.string(),
    date: z.string().optional(),
    entityId: z.string().optional(),
    accountId: z.string().uuid(),
    concept: z.string().min(1, "El concepto es obligatorio"),
    currency: currencySchema,
    type: projectedIncomeTypeSchema,
    rateEA: z.coerce.number().min(0).optional(),
    rateMonthly: z.coerce.number().min(0).optional(),
    amount: z.coerce.number().min(0).optional(),
    isRecurring: z.boolean().optional(),
    notes: z.string().optional(),
});
