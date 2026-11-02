'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing } from 'lucide-react';
import { db } from '@/lib/db/db';
import { saveSetting, SETTING_KEYS } from '@/lib/db/settings';
import { withAlertDefaults, type AlertSettings } from '@/lib/finance/alerts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type Rule = { key: keyof AlertSettings; field: string; label: (input: React.ReactNode) => React.ReactNode; step?: string };

const RULES: Rule[] = [
    { key: 'cardDue', field: 'days', label: input => <>Pago de tarjeta en {input} día(s) o menos</> },
    { key: 'cardUsage', field: 'percent', label: input => <>Tarjeta usa el {input}% del cupo o más</> },
    { key: 'unexplained', field: 'amount', label: input => <>Diferencia sin explicar de {input} COP o más</> },
    { key: 'openPreviousMonth', field: 'day', label: input => <>Mes anterior sin cerrar después del día {input}</> },
    { key: 'rateDrop', field: 'points', label: input => <>Una tasa planificada baja {input} puntos o más</>, step: '0.1' },
    { key: 'backup', field: 'days', label: input => <>Último respaldo con {input} días o más</> },
];

export function AlertSettingsCard() {
    const stored = useLiveQuery(async () => (await db.settings.get(SETTING_KEYS.alerts)) ?? null);
    if (stored === undefined) return null;
    return <AlertSettingsForm key={stored?.updatedAt ?? 'defaults'} initial={withAlertDefaults(stored?.value)} />;
}

function AlertSettingsForm({ initial }: { initial: AlertSettings }) {
    const [settings, setSettings] = useState(initial);
    const [saved, setSaved] = useState(false);
    const update = (key: keyof AlertSettings, patch: Record<string, unknown>) => {
        setSaved(false);
        setSettings(current => ({ ...current, [key]: { ...current[key], ...patch } }));
    };
    const save = async () => {
        await saveSetting(SETTING_KEYS.alerts, settings);
        setSaved(true);
    };

    return (
        <Card>
            <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><BellRing className="size-5" /></div>
                    <div>
                        <CardTitle>Alertas</CardTitle>
                        <CardDescription className="mt-1">Aparecen en el Resumen al abrir la app. Se guardan con el respaldo.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                {RULES.map(rule => {
                    const value = settings[rule.key] as unknown as Record<string, number | boolean>;
                    return (
                        <div key={rule.key} className="flex flex-wrap items-center gap-3 text-sm">
                            <Checkbox checked={Boolean(value.enabled)} onCheckedChange={checked => update(rule.key, { enabled: checked === true })} />
                            <span className={value.enabled ? 'text-slate-800' : 'text-slate-400'}>
                                {rule.label(<Input type="number" min="0" step={rule.step ?? '1'} className="mx-1 inline-flex h-8 w-28" value={String(value[rule.field])} disabled={!value.enabled} onChange={event => update(rule.key, { [rule.field]: Number(event.target.value) || 0 })} />)}
                            </span>
                        </div>
                    );
                })}
                <div className="flex items-center gap-3 pt-1">
                    <Button size="sm" onClick={save}>Guardar alertas</Button>
                    {saved && <span className="text-xs text-emerald-700">Guardado.</span>}
                </div>
            </CardContent>
        </Card>
    );
}
