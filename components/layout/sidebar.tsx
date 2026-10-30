'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    BarChart3,
    ArrowLeftRight,
    Building2,
    ClipboardCheck,
    CreditCard,
    Database,
    Menu,
    PiggyBank,
    Sparkles,
    X,
} from 'lucide-react';

const navGroups = [
    {
        label: 'Este mes',
        items: [
            { href: '/', label: 'Resumen', description: 'Tu panorama general', icon: BarChart3 },
            { href: '/cierre', label: 'Cierre mensual', description: 'Cinco pasos para cuadrar', icon: ClipboardCheck },
            { href: '/ingresos-proyectados', label: 'Planificación', description: 'Ingresos, gastos y tasas', icon: Sparkles },
        ],
    },
    {
        label: 'Movimientos',
        items: [
            { href: '/movimientos', label: 'Movimientos', description: 'Ingresos, gastos y traslados', icon: ArrowLeftRight },
            { href: '/obligaciones', label: 'Obligaciones', description: 'Por pagar y por cobrar', icon: CreditCard },
        ],
    },
    {
        label: 'Organización',
        items: [
            { href: '/cuentas', label: 'Cuentas', description: 'Bancos e inversiones', icon: Building2 },
            { href: '/config', label: 'Datos y entidades', description: 'Respaldo y configuración', icon: Database },
        ],
    },
];

function Brand() {
    return (
        <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/20">
                <PiggyBank className="size-5" />
            </div>
            <div>
                <p className="text-base font-semibold tracking-tight text-white">Mi economía</p>
                <p className="text-xs text-slate-400">Control personal</p>
            </div>
        </div>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mobileOpen, setMobileOpen] = useState(false);
    const period = searchParams.get('period');

    const nav = (
        <nav className="mt-8 flex-1 space-y-6" aria-label="Navegación principal">
            {navGroups.map(group => (
                <div key={group.label}>
                    <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {group.label}
                    </p>
                    <div className="space-y-1">
                        {group.items.map(item => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                            const href = period ? `${item.href}?period=${period}` : item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                                        isActive
                                            ? 'bg-emerald-400 text-slate-950'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                                    )}
                                >
                                    <Icon className="size-5 shrink-0" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium">{item.label}</span>
                                        <span className={cn('block truncate text-xs', isActive ? 'text-slate-700' : 'text-slate-500 group-hover:text-slate-400')}>
                                            {item.description}
                                        </span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );

    return (
        <>
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 lg:flex">
                <div className="px-2"><Brand /></div>
                {nav}
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs leading-relaxed text-slate-400">
                    Tus datos permanecen en este dispositivo. Crea un respaldo JSON con frecuencia.
                </div>
            </aside>

            <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b bg-slate-950 px-4 lg:hidden">
                <Brand />
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="grid size-10 place-items-center rounded-lg border border-slate-700 text-white"
                    aria-label="Abrir menú"
                >
                    <Menu className="size-5" />
                </button>
            </header>

            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Cerrar menú"
                    />
                    <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col bg-slate-950 px-4 py-5 shadow-2xl">
                        <div className="flex items-center justify-between px-2">
                            <Brand />
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                className="grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"
                                aria-label="Cerrar menú"
                            >
                                <X className="size-5" />
                            </button>
                        </div>
                        {nav}
                    </aside>
                </div>
            )}
        </>
    );
}
