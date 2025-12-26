'use client';

import { Button } from '@/components/ui/button';
import { db, Income } from '@/lib/db/db';
import { useActivePeriod } from '@/lib/hooks/use-active-period';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

export function CopyIncomesButton() {
    const { periodId } = useActivePeriod();
    const [loading, setLoading] = useState(false);

    const handleCopy = async () => {
        if (!periodId) return;

        // 1. Calculate previous period
        // Assumes format YYYY-MM
        const [yearStr, monthStr] = periodId.split('-');
        let year = parseInt(yearStr);
        let month = parseInt(monthStr);

        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear -= 1;
        }

        const prevPeriodId = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;

        setLoading(true);
        try {
            // 2. Fetch previous incomes
            const prevIncomes = await db.incomes.where('periodId').equals(prevPeriodId).toArray();

            if (prevIncomes.length === 0) {
                // ideally use toast here
                alert(`No se encontraron ingresos en el periodo anterior (${prevPeriodId}).`);
                return;
            }

            if (!confirm(`¿Copiar ${prevIncomes.length} ingresos del mes ${prevPeriodId}?`)) {
                return;
            }

            // 3. Transform and Save
            const newIncomes: Income[] = prevIncomes.map(inc => ({
                ...inc,
                id: uuidv4(),
                periodId: periodId,
                date: `${yearStr}-${monthStr}-${inc.date?.split('-')[2] || '01'}`, // Try to keep day, else 1st
                // Ensure date is valid for this month? 
                // Simple approach: Keep exact date string if possible, or fallback. 
                // Better: Just use current YYYY-MM-DD based on the old day.
            }));

            // Fix invalid dates (e.g. Feb 30)
            newIncomes.forEach(inc => {
                const d = new Date(inc.date!);
                if (isNaN(d.getTime())) {
                    inc.date = `${yearStr}-${monthStr}-01`;
                }
            });

            await db.incomes.bulkAdd(newIncomes);
            // alert('Ingresos copiados exitosamente.');

        } catch (error) {
            console.error(error);
            alert('Error al copiar ingresos.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleCopy} disabled={loading}>
            <Copy className="mr-2 h-4 w-4" />
            {loading ? 'Copiando...' : 'Copiar Mes Anterior'}
        </Button>
    );
}
