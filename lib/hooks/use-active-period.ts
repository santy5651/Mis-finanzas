
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useMemo, useCallback } from 'react';
import { format } from 'date-fns';

export function useActivePeriod() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const periodId = useMemo(() => {
        const p = searchParams.get('period');
        if (p && /^\d{4}-\d{2}$/.test(p)) return p;
        // Default to current month if not set or invalid
        return format(new Date(), 'yyyy-MM');
    }, [searchParams]);

    const setPeriod = useCallback((newPeriodId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', newPeriodId);
        router.push(`${pathname}?${params.toString()}`);
    }, [searchParams, pathname, router]);

    return { periodId, setPeriod };
}
