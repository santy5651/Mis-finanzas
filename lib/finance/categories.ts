import type { Expense, ExpenseCategory } from '@/lib/types';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    FOOD: 'Comida',
    TRANSPORT: 'Transporte',
    HOME: 'Vivienda y servicios',
    HEALTH: 'Salud',
    SUBSCRIPTIONS: 'Suscripciones',
    LEISURE: 'Ocio y viajes',
    SHOPPING: 'Compras',
    OTHER: 'Otros',
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

/** Words that point to a category. Matched against whole words, accents and case ignored. */
const KEYWORDS: Record<Exclude<ExpenseCategory, 'OTHER'>, string[]> = {
    FOOD: ['comida', 'mercado', 'almuerzo', 'desayuno', 'cena', 'restaurante', 'domicilio', 'cafe', 'panaderia', 'supermercado', 'exito', 'd1', 'ara', 'olimpica', 'jumbo', 'mercar', 'onces', 'snack'],
    TRANSPORT: ['transporte', 'uber', 'didi', 'taxi', 'bus', 'transmilenio', 'metro', 'gasolina', 'parqueadero', 'peaje', 'cabify', 'indriver', 'moto', 'carro', 'soat'],
    HOME: ['arriendo', 'administracion', 'luz', 'agua', 'gas', 'internet', 'celular', 'servicios', 'energia', 'claro', 'movistar', 'tigo', 'hogar', 'aseo'],
    HEALTH: ['salud', 'farmacia', 'drogueria', 'medico', 'medicina', 'medicamento', 'eps', 'odontologo', 'dentista', 'gimnasio', 'gym', 'cita', 'examen', 'optica'],
    SUBSCRIPTIONS: ['suscripcion', 'netflix', 'spotify', 'youtube', 'disney', 'hbo', 'max', 'prime', 'icloud', 'google', 'chatgpt', 'claude', 'pro', 'membresia', 'mensualidad'],
    LEISURE: ['ocio', 'viaje', 'vuelo', 'hotel', 'airbnb', 'cine', 'concierto', 'fiesta', 'bar', 'salida', 'paseo', 'vacaciones', 'juego', 'regalo', 'tour'],
    SHOPPING: ['compras', 'compra', 'ropa', 'zapatos', 'amazon', 'mercadolibre', 'tecnologia', 'audifonos', 'computador', 'libro', 'muebles'],
};

export function normalizeText(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-CO');
}

export function words(text: string): string[] {
    return normalizeText(text).split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/** First category whose keyword appears as a whole word in the text, or null. */
export function guessCategory(text: string): ExpenseCategory | null {
    const tokens = new Set(words(text));
    for (const [category, keywords] of Object.entries(KEYWORDS) as Array<[ExpenseCategory, string[]]>) {
        if (keywords.some(keyword => tokens.has(keyword))) return category;
    }
    return null;
}

export function isCategoryKeyword(word: string): boolean {
    const normalized = normalizeText(word);
    return Object.values(KEYWORDS).some(list => list.includes(normalized))
        || EXPENSE_CATEGORIES.some(category => words(EXPENSE_CATEGORY_LABELS[category]).includes(normalized));
}

/** Expenses saved before categories existed are read through their description. */
export function resolveCategory(expense: Pick<Expense, 'category' | 'reason'>): ExpenseCategory {
    return expense.category ?? guessCategory(expense.reason) ?? 'OTHER';
}
