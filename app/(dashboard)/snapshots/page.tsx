import { redirect } from 'next/navigation';

export default async function LegacySnapshotsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
    const { period } = await searchParams;
    redirect(`/cierre${period ? `?period=${period}` : ''}`);
}
