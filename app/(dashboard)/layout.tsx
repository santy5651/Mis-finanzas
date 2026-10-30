import { Sidebar } from '@/components/layout/sidebar';
import { Suspense } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50">
            <Suspense fallback={<div className="min-h-screen animate-pulse bg-slate-50" />}>
                <Sidebar />
                <main className="min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:ml-72 lg:px-8 lg:pt-8">
                    <div className="mx-auto w-full max-w-[1500px]">{children}</div>
                </main>
            </Suspense>
        </div>
    );
}
