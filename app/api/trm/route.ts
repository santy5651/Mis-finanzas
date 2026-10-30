import { NextRequest, NextResponse } from 'next/server';

const DATASET_URL = 'https://www.datos.gov.co/resource/mcec-87by.json';

type TrmRow = {
    valor?: string;
    vigenciadesde?: string;
    vigenciahasta?: string;
};

export async function GET(request: NextRequest) {
    const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'La fecha debe usar el formato YYYY-MM-DD.' }, { status: 400 });
    }

    const query = new URLSearchParams({
        '$select': 'valor,vigenciadesde,vigenciahasta',
        '$where': `vigenciadesde <= '${date}T23:59:59.999' AND vigenciahasta >= '${date}T00:00:00.000'`,
        '$order': 'vigenciadesde DESC',
        '$limit': '1',
    });

    try {
        let response = await fetch(`${DATASET_URL}?${query}`, { next: { revalidate: 3600 } });
        let rows = response.ok ? await response.json() as TrmRow[] : [];
        if (!rows[0]) {
            const fallbackQuery = new URLSearchParams({
                '$select': 'valor,vigenciadesde,vigenciahasta',
                '$where': `vigenciadesde <= '${date}T23:59:59.999'`,
                '$order': 'vigenciadesde DESC',
                '$limit': '1',
            });
            response = await fetch(`${DATASET_URL}?${fallbackQuery}`, { next: { revalidate: 3600 } });
            rows = response.ok ? await response.json() as TrmRow[] : [];
        }
        const row = rows[0];
        const value = Number(row?.valor);
        if (!row || !Number.isFinite(value) || value <= 0) throw new Error('Respuesta de TRM inválida');

        return NextResponse.json({
            value,
            date,
            validFrom: row.vigenciadesde,
            validTo: row.vigenciahasta,
            source: 'SFC',
        });
    } catch (error) {
        console.error('TRM lookup failed', error);
        return NextResponse.json(
            { error: 'No fue posible consultar la TRM oficial. Puedes ingresarla manualmente.' },
            { status: 503 },
        );
    }
}

