import { redirect } from 'next/navigation';

export default async function LegacyExpensesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
    const { period } = await searchParams;
    redirect(`/movimientos?tab=gastos${period ? `&period=${period}` : ''}`);
}
