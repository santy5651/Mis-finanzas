import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(value: number, currency: 'COP' | 'USD' = 'COP') {
  const digits = currency === 'USD' ? 2 : 0
  return value.toLocaleString('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function formatCurrency(value: number, currency: 'COP' | 'USD' = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(value)
}
