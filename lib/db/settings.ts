import { db } from '@/lib/db/db';

export const SETTING_KEYS = {
    alerts: 'alerts',
    lastBackupAt: 'lastBackupAt',
} as const;

export async function saveSetting(id: string, value: unknown): Promise<void> {
    await db.settings.put({ id, value, updatedAt: new Date().toISOString() });
}
