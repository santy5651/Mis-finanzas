import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getBackupRecordCount, migrateLegacyBackup, parseBackup } from './backup';

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

