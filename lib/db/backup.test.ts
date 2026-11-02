import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getBackupRecordCount, migrateLegacyBackup, parseBackup } from './backup';
import { checkBackupIntegrity } from './backup-integrity';

describe('legacy backup migration', () => {
    it('accepts and upgrades the 284-record v1 save without mutating the source shape', async () => {
        const raw = JSON.parse(await readFile('Save/finanzas-export-2026-07-12.json', 'utf8'));
        const parsed = parseBackup(raw);
        expect(getBackupRecordCount(parsed)).toBe(284);
        const migrated = migrateLegacyBackup(parsed);
        expect(migrated.version).toBe(2);
        expect(migrated.tables.accountSnapshots).toHaveLength(125);
        expect(migrated.tables.obligations).toHaveLength(1);
        expect(migrated.tables.obligationSnapshots).toHaveLength(10);
        expect(migrated.tables.financialEvents.length).toBeGreaterThan(0);
        expect(migrated.tables.accountEntries).toHaveLength(11);
        expect(raw.version).toBe(1);
        expect(raw.tables.obligations).toBeUndefined();
    });
});


describe('backup integrity', () => {
    const base = () => ({
        version: 2,
        tables: {
            periods: [{ id: '2026-10' }], entities: [{ id: 'bank' }],
            accounts: [{ id: 'nu', entityId: 'bank', categories: ['SAVINGS'] }],
            accountSnapshots: [{ id: 's1', accountId: 'nu', periodId: '2026-10' }],
            incomes: [], expenses: [], debts: [],
            financialEvents: [{ id: 'e1' }],
            accountEntries: [{ id: 'a1', eventId: 'e1', accountId: 'nu' }],
        },
    });

    it('accepts a consistent backup', () => {
        expect(() => parseBackup(base())).not.toThrow();
    });

    it('rejects entries that point to a missing account or event', () => {
        const raw = base();
        raw.tables.accountEntries.push({ id: 'a2', eventId: 'ghost', accountId: 'nu' }, { id: 'a3', eventId: 'e1', accountId: 'gone' });
        expect(() => parseBackup(raw)).toThrow(/entrada\(s\) de cuenta sin evento.*entrada\(s\) de cuentas inexistentes|entrada\(s\) de cuentas inexistentes.*entrada\(s\) de cuenta sin evento/);
    });

    it('rejects duplicated ids and newer format versions', () => {
        const duplicated = base();
        duplicated.tables.financialEvents.push({ id: 'e1' });
        expect(() => parseBackup(duplicated)).toThrow(/repetido/);
        expect(() => parseBackup({ ...base(), version: 3 })).toThrow(/versión 3/);
    });

    it('only warns about loose ends that do not change any figure', () => {
        const raw = base();
        raw.tables.accounts[0].entityId = 'deleted-bank';
        const parsed = parseBackup(raw);
        expect(checkBackupIntegrity(parsed.tables).warnings).toHaveLength(1);
    });
});
