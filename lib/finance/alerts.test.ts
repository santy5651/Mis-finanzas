import { describe, expect, it } from 'vitest';
import { computeAlerts, DEFAULT_ALERT_SETTINGS, withAlertDefaults, type AlertInput } from './alerts';
import type { Obligation } from '@/lib/types';

const card: Obligation = { id: 'rappi', entityId: 'e', name: 'Tarjeta RAPPI', direction: 'PAYABLE', type: 'CREDIT_CARD', currency: 'COP', dueDay: 5, creditLimit: 10_000_000, isActive: true, createdAt: '', updatedAt: '' };
const base = (overrides: Partial<AlertInput> = {}): AlertInput => ({
    today: new Date(2026, 10, 2),
    cards: [],
    unexplained: [],
    rateChanges: [],
    lastBackupAt: '2026-10-30T12:00:00.000Z',
    ...overrides,
});
const ids = (input: AlertInput, settings = DEFAULT_ALERT_SETTINGS) => computeAlerts(input, settings).map(alert => alert.id);

describe('computeAlerts', () => {
    it('stays quiet when everything is in order', () => {
        expect(ids(base({ cards: [{ card, balance: 1_000_000 }] }))).toEqual(['card-due-rappi']);
        expect(ids(base({ cards: [{ card: { ...card, dueDay: 25 }, balance: 1_000_000 }] }))).toEqual([]);
    });

    it('warns about card payment, card usage and skips paid cards', () => {
        expect(ids(base({ cards: [{ card, balance: 6_858_707 }] }))).toEqual(['card-due-rappi', 'card-usage-rappi']);
        expect(ids(base({ cards: [{ card, balance: 0 }] }))).toEqual([]);
    });

    it('flags large unexplained differences, an open previous month and rate drops', () => {
        const result = ids(base({
            unexplained: [{ periodId: '2026-10', accountName: 'LULO', amountCop: -2_009_618 }, { periodId: '2026-10', accountName: 'NU', amountCop: 300 }],
            previousPeriod: { id: '2026-10', hasBalances: true, closed: false },
            rateChanges: [{ accountName: 'PIBANK', previous: 0.1, current: 0.09 }, { accountName: 'NU', previous: 0.1, current: 0.099 }],
            today: new Date(2026, 10, 12),
        }));
        expect(result).toEqual(['unexplained-2026-10-LULO', 'open-2026-10', 'rate-PIBANK']);
    });

    it('waits until the configured day before asking to close last month', () => {
        expect(ids(base({ previousPeriod: { id: '2026-10', hasBalances: true, closed: false } }))).toEqual([]);
    });

    it('reminds about backups and respects disabled rules', () => {
        expect(ids(base({ lastBackupAt: undefined }))).toEqual(['backup']);
        expect(ids(base({ lastBackupAt: '2026-09-01T00:00:00.000Z' }))).toEqual(['backup']);
        const settings = withAlertDefaults({ backup: { enabled: false } });
        expect(ids(base({ lastBackupAt: undefined }), settings)).toEqual([]);
        expect(settings.backup.days).toBe(35);
    });
});
