
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Wallet,
    TrendingUp,
    PiggyBank,
    Settings,
    Presentation,
    CreditCard
} from 'lucide-react';

const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },

    { href: '/transacciones/ingresos', label: 'Ingresos', icon: TrendingUp },
    { href: '/transacciones/egresos', label: 'Egresos', icon: Wallet },
    { href: '/snapshots', label: 'Snapshots / Saldos', icon: Presentation },
    { href: '/deudas', label: 'Deudas del Mes', icon: CreditCard },
    { href: '/cuentas', label: 'Cuentas / Inversiones', icon: PiggyBank },
    { href: '/config', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
            <div className="mb-8 px-2">
                <h1 className="text-xl font-bold">Mi Economía</h1>
            </div>
            <nav className="space-y-2 flex-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center space-x-2 px-4 py-2 rounded-md transition-colors",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-gray-800 text-gray-300 hover:text-white"
                            )}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
