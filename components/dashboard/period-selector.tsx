
'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, format, parse, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

export function PeriodSelector() {
    const { periodId, setPeriod } = useActivePeriod();

    const handlePrev = () => {
        const date = parse(periodId, 'yyyy-MM', new Date());
        setPeriod(format(subMonths(date, 1), 'yyyy-MM'));
    };

    const handleNext = () => {
        const date = parse(periodId, 'yyyy-MM', new Date());
        setPeriod(format(addMonths(date, 1), 'yyyy-MM'));
    };

    return (
        <div className="flex items-center gap-1.5 rounded-xl border bg-white p-1 shadow-sm">
            <Button variant="ghost" size="icon" onClick={handlePrev} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-[145px] sm:w-[165px]">
                <Select value={periodId} onValueChange={setPeriod}>
                    <SelectTrigger className="border-0 bg-transparent capitalize shadow-none focus-visible:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from({ length: 37 }).map((_, i) => {
                            const date = addMonths(new Date(), 12 - i);
                            const val = format(date, 'yyyy-MM');
                            return (
                                <SelectItem key={val} value={val} className="capitalize">
                                    {format(date, 'MMMM yyyy', { locale: es })}
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
