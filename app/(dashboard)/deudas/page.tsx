import { redirect } from 'next/navigation';

export default async function LegacyDebtsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
    const { period } = await searchParams;
    redirect(`/obligaciones${period ? `?period=${period}` : ''}`);
}
