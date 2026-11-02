// Runtime-dependency free so scripts/validate-backup.ts can run it with plain Node.
import type { BackupTables } from './backup';

export interface IntegrityReport {
    /** Broken links that would corrupt balances or reconciliation; restoring must stop. */
    errors: string[];
    /** Loose ends that do not change any figure, such as a deleted entity. */
    warnings: string[];
}

type Row = { id: string } & Record<string, unknown>;

function idSet(rows: Row[]): Set<string> {
    return new Set(rows.map(row => row.id));
}

function missing(rows: Row[], field: string, targets: Set<string>, optional = false): Row[] {
    return rows.filter(row => {
        const value = row[field];
        if (optional && (value === undefined || value === null || value === '')) return false;
        return typeof value !== 'string' || !targets.has(value);
    });
}

function describe(count: number, what: string, sample: Row[]): string {
    const ids = sample.slice(0, 3).map(row => row.id).join(', ');
    return `${count} ${what} (ej. ${ids}${count > 3 ? ', …' : ''})`;
}

export function checkBackupIntegrity(tables: BackupTables): IntegrityReport {
    const t = tables as unknown as Record<keyof BackupTables, Row[]>;
    const errors: string[] = [];
    const warnings: string[] = [];
    const accounts = idSet(t.accounts);
    const events = idSet(t.financialEvents);
    const obligations = idSet(t.obligations);
    const entities = idSet(t.entities);
    const expenses = idSet(t.expenses);

    for (const [name, rows] of Object.entries(t)) {
        const duplicates = rows.length - idSet(rows).size;
        if (duplicates) errors.push(`La tabla "${name}" tiene ${duplicates} identificador(es) repetido(s).`);
    }

    const errorChecks: Array<[Row[], string]> = [
        [missing(t.accountSnapshots, 'accountId', accounts), 'saldo(s) de cuentas inexistentes'],
        [missing(t.accountEntries, 'accountId', accounts), 'entrada(s) de cuentas inexistentes'],
        [missing(t.accountEntries, 'eventId', events), 'entrada(s) de cuenta sin evento'],
        [missing(t.obligationEntries, 'obligationId', obligations), 'entrada(s) de obligaciones inexistentes'],
        [missing(t.obligationEntries, 'eventId', events), 'entrada(s) de obligación sin evento'],
        [missing(t.obligationSnapshots, 'obligationId', obligations), 'saldo(s) de obligaciones inexistentes'],
        [missing(t.accountPlans, 'accountId', accounts), 'tasa(s) de cuentas inexistentes'],
    ];
    const warningChecks: Array<[Row[], string]> = [
        [missing(t.accounts, 'entityId', entities), 'cuenta(s) con entidad inexistente'],
        [missing(t.obligations, 'entityId', entities), 'obligación(es) con entidad inexistente'],
        [missing(t.financialEvents, 'expenseId', expenses, true), 'evento(s) que apuntan a un gasto inexistente'],
        [missing(t.expenses, 'financialEventId', events, true), 'gasto(s) que apuntan a un evento inexistente'],
        [missing(t.plannedCashFlows, 'accountId', accounts, true), 'flujo(s) previsto(s) de cuentas inexistentes'],
    ];
    for (const [rows, what] of errorChecks) if (rows.length) errors.push(describe(rows.length, what, rows));
    for (const [rows, what] of warningChecks) if (rows.length) warnings.push(describe(rows.length, what, rows));
    return { errors, warnings };
}
