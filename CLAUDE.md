# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Mi economía": a local-first personal finance app (Next.js 16 App Router, React 19, Tailwind 4, shadcn/Radix UI) for closing each month by reconciling real account balances against linked movements, obligations and plans. All data lives in the browser's IndexedDB via Dexie; there is no backend database. The only network call is `app/api/trm/route.ts`, which proxies the official USD/COP TRM from datos.gov.co (Superintendencia Financiera). UI text, routes and user-facing errors are in Spanish.

## Commands

```bash
npm run dev            # next dev --webpack (Webpack is intentional, not Turbopack)
npm run build          # next build --webpack
npm start              # serve the production build (preferred for daily use)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (next core-web-vitals + typescript)
npm test               # vitest run
npx vitest run lib/finance/reconciliation.test.ts   # single test file
npx vitest run -t "nombre del test"                  # single test by name
npm run validate:backup                    # validate newest JSON in Save/
npm run validate:backup -- "ruta/al/respaldo.json"
```

Full verification before finishing a change: `typecheck`, `lint`, `test`, `build`.

## Architecture

### Data layer (`lib/db/db.ts`, `lib/types/index.ts`)
- Single Dexie instance `db` (`PersonalEconomyDB`). Schema changes require a **new `this.version(N)`** block that repeats every store definition, plus an `.upgrade()` migration for existing data. Never edit an existing version.
- `Period.id` and every `periodId` use the `"YYYY-MM"` format. The active period lives in the URL query `?period=YYYY-MM` (`lib/hooks/use-active-period.ts`). The sidebar keeps it when navigating, so new links should keep it too.
- Pages are client components that read with `useLiveQuery` from `dexie-react-hooks`.

### Ledger model (v12+; the current source of truth)
- **`FinancialEvent`** is the business fact (INCOME, EXPENSE, TRANSFER, PASSIVE_RETURN, OBLIGATION_PAYMENT, RECEIVABLE_*, ADJUSTMENT, LEGACY_MOVEMENT).
- **`AccountEntry`** and **`ObligationEntry`** are signed deltas linked by `eventId`, in the account's or obligation's native currency. For accounts, positive means money enters. For obligations, positive means the balance owed grows.
- Write through `lib/finance/ledger.ts` (`saveFinancialEvent`, `saveExpenseWithLedger`, `deleteFinancialEvent`, `deleteExpenseWithLedger`). These functions replace an event's entries atomically inside a Dexie transaction. They throw `LedgerError` if the period is CLOSED, if the date falls outside `periodId`, or if an entry's currency differs from its account or obligation. Don't write entries directly. Default event dates come from `dateInsidePeriod` in `lib/finance/period.ts`, which uses local time, not UTC `toISOString()`.
- Transfers are not income, expense or gain. They are kept out of cash flow, and a cross-currency transfer stores `effectiveExchangeRate`.
- `Obligation` (PAYABLE/RECEIVABLE) plus monthly `ObligationSnapshot` replaced `Debt`. `AccountPlan` (FIXED_EA / VARIABLE_MONTHLY rates) and `PlannedCashFlow` replaced projected incomes.
- Legacy tables (`incomes`, `expenses`, `debts`, `projectedIncomes`, `projectedIncomeItems`, `accountMovements`) still exist for migration and backup compatibility. `expenses` is still written alongside its EXPENSE event. Legacy routes `/deudas` and `/snapshots` only redirect to `/obligaciones` and `/cierre`.

### Monthly close (`app/(dashboard)/cierre/page.tsx`, `lib/finance/reconciliation.ts`)
- `AccountSnapshot.balance` is the real end-of-month balance. Reconciliation compares the change from the previous period's snapshot with the sum of that period's entries, split by event type. The remainder is `unexplained`.
- Closing sets `Period.status = 'CLOSED'`, which freezes the snapshots and TRM. Forms and pages check `period.status === 'CLOSED'` and become read-only (`locked`) until the user chooses "Reabrir mes".
- Currency: `COP` or `USD`. `lib/finance/currency.ts` resolves the rate: a closed period uses the snapshot's frozen `usdCopRate`, and an open period uses the period's current rate. `calculateFxEffect` separates FX gains from real returns.
- `lib/finance/planning.ts` copies recurring planned flows into the next period.

### Backup (`lib/db/backup.ts`, `scripts/validate-backup.mjs`)
- JSON export of every table (`BACKUP_VERSION = 2`, `BACKUP_TABLE_NAMES`). `parseBackup` validates the whole structure first. `migrateLegacyBackup` converts v1 files the same way the Dexie v12 upgrade does. `restoreBackup` clears and bulk-adds all tables in one transaction.
- When you add a table, update the Dexie schema, `BackupTables` / `BACKUP_TABLE_NAMES`, `createBackup`, `restoreBackup`, the validator script and the tests together.
- `Save/` holds real user backups (personal financial data). Use them only for validation; don't modify or commit them.

### Tests
Vitest covers the pure logic in `lib/finance/*.test.ts` and `lib/db/backup.test.ts`. `vitest.config.mts` maps the `@/` alias to the repo root. Keep calculations pure in `lib/finance/` so they stay testable without IndexedDB.
