import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const requiredTables = [
    'periods',
    'entities',
    'accounts',
    'accountSnapshots',
    'incomes',
    'expenses',
    'debts',
];

const optionalTables = [
    'projectedIncomeItems', 'projectedIncomes', 'accountMovements',
    'accountPlans', 'plannedCashFlows', 'financialEvents', 'accountEntries',
    'obligations', 'obligationEntries', 'obligationSnapshots',
];

async function resolveBackupPath() {
    if (process.argv[2]) return path.resolve(process.argv[2]);
    const saveDirectory = path.resolve('Save');
    const candidates = (await readdir(saveDirectory))
        .filter(file => file.toLowerCase().endsWith('.json'))
        .sort()
        .reverse();
    if (!candidates[0]) throw new Error('No se encontró ningún JSON en la carpeta Save.');
    return path.join(saveDirectory, candidates[0]);
}

const backupPath = await resolveBackupPath();
const payload = JSON.parse(await readFile(backupPath, 'utf8'));

if (!payload || typeof payload !== 'object' || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error('El archivo no contiene el objeto "tables".');
}

for (const tableName of requiredTables) {
    if (!Array.isArray(payload.tables[tableName])) {
        throw new Error(`Falta la tabla obligatoria "${tableName}".`);
    }
}

for (const tableName of [...requiredTables, ...optionalTables]) {
    const records = payload.tables[tableName] ?? [];
    if (!Array.isArray(records)) throw new Error(`La tabla "${tableName}" no es una lista.`);
    if (records.some(record => !record || typeof record !== 'object' || typeof record.id !== 'string')) {
        throw new Error(`La tabla "${tableName}" contiene registros sin id.`);
    }
}

if (payload.tables.accounts.some(account => !Array.isArray(account.categories) && typeof account.category !== 'string')) {
    throw new Error('Hay cuentas sin categorías compatibles.');
}

const counts = Object.fromEntries(
    [...requiredTables, ...optionalTables].map(tableName => [tableName, (payload.tables[tableName] ?? []).length]),
);
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

console.log(`Respaldo compatible: ${path.relative(process.cwd(), backupPath)}`);
console.log(`Versión: ${payload.version ?? 1} · Registros: ${total}`);
console.table(counts);
