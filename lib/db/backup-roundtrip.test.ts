import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { createBackup, parseBackup, restoreBackup } from './backup';

describe('backup round trip', () => {
    it('exports and restores every table, settings included', async () => {
        const now = new Date().toISOString();
        await db.entities.put({ id: 'bank', name: 'Banco' });
        await db.accounts.put({ id: 'nu', name: 'Nu', entityId: 'bank', accountType: 'Ahorros', categories: ['SAVINGS'], currency: 'COP', isActive: true });
        await db.settings.put({ id: 'alerts', value: { backup: { enabled: false } }, updatedAt: now });

        const exported = JSON.parse(JSON.stringify(await createBackup()));
        expect(exported.tables.settings).toHaveLength(1);

        await Promise.all(db.tables.map(table => table.clear()));
        await restoreBackup(parseBackup(exported));
        expect((await db.settings.get('alerts'))?.value).toEqual({ backup: { enabled: false } });
        expect(await db.accounts.count()).toBe(1);
    });

    it('restores older backups that have no settings table', async () => {
        const exported = JSON.parse(JSON.stringify(await createBackup()));
        delete exported.tables.settings;
        await restoreBackup(parseBackup(exported));
        expect(await db.settings.count()).toBe(0);
    });
});
