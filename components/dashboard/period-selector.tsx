
'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, format, parse, subMonths } from 'date-fns';

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
        <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-[120px]">
                <Select value={periodId} onValueChange={setPeriod}>
                    <SelectTrigger>
                        <SelectValue>{periodId}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {/* Generate some recent periods */}
                        {Array.from({ length: 12 }).map((_, i) => {
                            const date = subMonths(new Date(), i);
                            const val = format(date, 'yyyy-MM');
                            return (
                                <SelectItem key={val} value={val}>
                                    {val}
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>
            <Button variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
