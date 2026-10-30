import { redirect } from 'next/navigation';

export default async function LegacyIncomePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
    const { period } = await searchParams;
    redirect(`/movimientos?tab=historial${period ? `&period=${period}` : ''}`);
}
