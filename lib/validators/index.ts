
import { z } from 'zod';

export const currencySchema = z.enum(['COP', 'USD']);
export const entityTypeSchema = z.enum(['BANK', 'FRANCHISE', 'PERSON', 'EMPLOYER', 'BROKER', 'OTHER']);
export const accountCategorySchema = z.enum([
    'CASH', 'LOW_AMOUNT_ACCOUNT', 'SAVINGS', 'EMERGENCY_FUND',
    'INVEST_SHORT', 'INVEST_MEDIUM', 'INVEST_LONG', 'RETIREMENT', 'OTHER'
]);
export const expenseMethodSchema = z.enum(['DEBIT', 'CREDIT_CARD', 'CASH', 'TRANSFER', 'OTHER']);
export const debtTypeSchema = z.enum(['CREDIT_CARD', 'PERSONAL', 'LOAN', 'OTHER']);

export const periodSchema = z.object({
    id: z.string().regex(/^\d{4}-\d{2}$/, "Format must be YYYY-MM"),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    usdCopRate: z.coerce.number().positive().nullable(),
});

export const entitySchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, "Name is required"),
    type: entityTypeSchema.optional(),
    notes: z.string().optional(),
});

export const accountSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, "Name is required"),
    entityId: z.string().uuid(),
    accountType: z.string().min(1, "Type is required"),
    category: accountCategorySchema,
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
    concept: z.string().min(1, "Concept is required"),
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
    reason: z.string().min(1, "Reason is required"),
    amount: z.coerce.number().positive(),
    currency: currencySchema,
    method: expenseMethodSchema,
    installments: z.coerce.number().int().min(1),
    notes: z.string().optional(),
});

export const debtSchema = z.object({
    id: z.string().uuid(),
    periodId: z.string(),
    entityId: z.string(),
    debtType: debtTypeSchema,
    amount: z.coerce.number().positive(),
    currency: currencySchema,
    dueDate: z.string().optional().nullable(),
    notes: z.string().optional(),
});
