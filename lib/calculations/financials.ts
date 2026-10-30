import type { AccountCategory, Currency, Period } from '@/lib/types';

export const LIQUID_CATEGORIES: AccountCategory[] = ['CASH', 'LOW_AMOUNT_ACCOUNT'];

/** Convierte un valor a COP. Si falta la TRM, el valor no se incluye en los totales. */
export function toCOP(amount: number, currency: Currency, period: Period): number {
    if (currency === 'COP') return amount;
    if (!period.usdCopRate) {
        console.warn(`No se puede convertir USD en ${period.id}: falta la TRM.`);
        return 0;
    }
    return amount * period.usdCopRate;
}

export interface ProjectedReturnResult {
    monthlyRateProjected: number;
    projectedEndBalance: number;
    projectedMonthlyReturn: number;
}

/** Convierte una tasa efectiva anual decimal (0.12 = 12 %) en rendimiento mensual. */
export function calculateProjectedReturn(currentBalance: number, effectiveAnnualRate: number): ProjectedReturnResult {
    const monthlyRateProjected = Math.pow(1 + effectiveAnnualRate, 1 / 12) - 1;
    const projectedEndBalance = currentBalance * (1 + monthlyRateProjected);
    return {
        monthlyRateProjected,
        projectedEndBalance,
        projectedMonthlyReturn: projectedEndBalance - currentBalance,
    };
}

export interface RealReturnResult {
    realMonthlyReturn: number;
    realMonthlyRate: number | null;
    realEA: number | null;
}

/** Aísla el rendimiento real descontando los aportes y retiros del cambio de saldo. */
export function calculateRealReturn(
    currentBalance: number,
    previousBalance: number | undefined,
    netFlow = 0,
): RealReturnResult {
    if (previousBalance === undefined) {
        return { realMonthlyReturn: 0, realMonthlyRate: null, realEA: null };
    }

    const realMonthlyReturn = currentBalance - previousBalance - netFlow;
    if (previousBalance <= 0) {
        return { realMonthlyReturn, realMonthlyRate: null, realEA: null };
    }

    const realMonthlyRate = realMonthlyReturn / previousBalance;
    return {
        realMonthlyReturn,
        realMonthlyRate,
        realEA: Math.pow(1 + realMonthlyRate, 12) - 1,
    };
}
