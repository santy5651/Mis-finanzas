import { describe, expect, it } from 'vitest';
import { guessCategory, resolveCategory } from './categories';
import { parseAmountToken, parseQuickExpense, type PaymentSource } from './quick-expense';

const sources: PaymentSource[] = [
    { id: 'nu', kind: 'ACCOUNT', name: 'NU', currency: 'COP' },
    { id: 'rappi-cuenta', kind: 'ACCOUNT', name: 'RAPPI CUENTA', currency: 'COP' },
    { id: 'rappi-card', kind: 'CARD', name: 'Tarjeta RAPPI', currency: 'COP' },
    { id: 'nomina', kind: 'ACCOUNT', name: 'DAVIVIENDA NOMINA', currency: 'COP' },
];

describe('parseAmountToken', () => {
    it('reads Colombian notation, k suffixes and decimals', () => {
        expect(parseAmountToken('50000')).toBe(50_000);
        expect(parseAmountToken('50.000')).toBe(50_000);
        expect(parseAmountToken('$1.250.000')).toBe(1_250_000);
        expect(parseAmountToken('12,5k')).toBe(12_500);
        expect(parseAmountToken('12.5')).toBe(12.5);
        expect(parseAmountToken('1.234,56')).toBe(1_234.56);
        expect(parseAmountToken('comida')).toBeNull();
        expect(parseAmountToken('0')).toBeNull();
    });
});

describe('parseQuickExpense', () => {
    it('reads "comida 50000" with the default source', () => {
        expect(parseQuickExpense('comida 50000', sources)).toEqual({ amount: 50_000, description: 'Comida', category: 'FOOD', sourceId: null, candidates: [] });
    });

    it('picks the paying account and keeps the rest as description', () => {
        const result = parseQuickExpense('almuerzo con mamá 25.000 nu', sources);
        expect(result).toMatchObject({ amount: 25_000, description: 'Almuerzo con mamá', category: 'FOOD', sourceId: 'nu' });
    });

    it('prefers the source that matches more words', () => {
        expect(parseQuickExpense('mercado 80 mil tarjeta rappi', sources)).toMatchObject({ amount: 80_000, sourceId: 'rappi-card', description: 'Mercado' });
    });

    it('asks when a word fits several sources instead of guessing', () => {
        const result = parseQuickExpense('rappi 30000', sources);
        expect(result.sourceId).toBeNull();
        expect(result.candidates.sort()).toEqual(['rappi-card', 'rappi-cuenta']);
        expect(result.description).toBe('Rappi');
    });

    it('accepts the amount first and falls back to Otros', () => {
        expect(parseQuickExpense('12,5k regalo raro', sources)).toMatchObject({ amount: 12_500, category: 'LEISURE' });
        expect(parseQuickExpense('35000 cosas varias', sources)).toMatchObject({ category: 'OTHER', description: 'Cosas varias' });
    });

    it('reports a missing amount', () => {
        expect(parseQuickExpense('uber nomina', sources)).toMatchObject({ amount: null, category: 'TRANSPORT', sourceId: 'nomina' });
    });
});

describe('categories', () => {
    it('infers the category of older expenses from their description', () => {
        expect(guessCategory('VIAJE AMEXICO')).toBe('LEISURE');
        expect(resolveCategory({ reason: 'AUDIFONOS' })).toBe('SHOPPING');
        expect(resolveCategory({ reason: 'RAPPI PRO' })).toBe('SUBSCRIPTIONS');
        expect(resolveCategory({ reason: 'Cosa rara' })).toBe('OTHER');
        expect(resolveCategory({ reason: 'Uber', category: 'HEALTH' })).toBe('HEALTH');
    });
});
