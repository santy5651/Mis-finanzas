import type { Currency, ExpenseCategory } from '@/lib/types';
import { EXPENSE_CATEGORY_LABELS, guessCategory, words } from './categories';

export interface PaymentSource {
    id: string;
    kind: 'ACCOUNT' | 'CARD';
    name: string;
    currency: Currency;
}

export interface QuickExpense {
    amount: number | null;
    description: string;
    category: ExpenseCategory;
    /** Source named unambiguously in the text, if any. */
    sourceId: string | null;
    /** Several sources matched equally well; the user has to pick. */
    candidates: string[];
}

/** Words too common in product names to identify one on their own. */
const GENERIC = new Set(['cuenta', 'tarjeta', 'banco', 'de', 'la', 'el', 'del', 'ahorros', 'credito']);
const CONNECTORS = new Set(['con', 'en', 'desde', 'de', 'por', 'pago']);

/** Colombian notation: "50.000" and "1.250.000" are thousands, "12,5" is a decimal. */
export function parseAmountToken(token: string): number | null {
    const match = /^\$?(\d[\d.,]*)(k)?$/i.exec(token.trim());
    if (!match) return null;
    let raw = match[1];
    if (raw.includes('.') && raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes('.')) raw = /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
    else if (raw.includes(',')) raw = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return match[2] ? value * 1000 : value;
}

/**
 * Reads entries like "comida 50000", "almuerzo 25.000 nu", "uber 12,5k" or "mercado 80 mil tarjeta rappi".
 * Nothing is saved here: the caller shows the result for confirmation.
 */
export function parseQuickExpense(input: string, sources: PaymentSource[]): QuickExpense {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    let amount: number | null = null;
    const rest: string[] = [];
    for (let index = 0; index < tokens.length; index++) {
        const value: number | null = amount === null ? parseAmountToken(tokens[index]) : null;
        if (value === null) { rest.push(tokens[index]); continue; }
        const next = tokens[index + 1]?.toLocaleLowerCase('es-CO');
        amount = next === 'mil' || next === 'k' ? value * 1000 : value;
        if (next === 'mil' || next === 'k') index++;
    }

    const restWords = rest.map(token => words(token).join(' '));
    const scored = sources.map(source => {
        const nameWords = new Set(words(source.name));
        const matched = restWords.filter(word => word && nameWords.has(word));
        const distinctive = matched.some(word => !GENERIC.has(word));
        return { source, matched, score: distinctive ? matched.length : 0 };
    }).filter(item => item.score > 0);
    const best = Math.max(0, ...scored.map(item => item.score));
    const top = scored.filter(item => item.score === best);

    let sourceId: string | null = null;
    let remaining = rest;
    if (top.length === 1) {
        sourceId = top[0].source.id;
        const used = new Set(top[0].matched);
        remaining = rest.filter((_, index) => !used.has(restWords[index]));
    }
    while (remaining.length && CONNECTORS.has(words(remaining[remaining.length - 1]).join(' '))) remaining = remaining.slice(0, -1);

    const text = remaining.join(' ').trim();
    const category = guessCategory(text) ?? guessCategory(input) ?? 'OTHER';
    const description = text ? text.charAt(0).toLocaleUpperCase('es-CO') + text.slice(1) : EXPENSE_CATEGORY_LABELS[category];
    return { amount, description, category, sourceId, candidates: top.length > 1 ? top.map(item => item.source.id) : [] };
}
