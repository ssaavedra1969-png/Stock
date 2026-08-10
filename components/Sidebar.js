'use client';

// ============================================================
// components/Sidebar.js
// Barra lateral fija (desktop) + barra superior (mobile)
// con el logo "GRUPO FALPAT SRL".
// ============================================================
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { IconLayout, IconLayers, IconPieChart } from './Icons';
import { LOGO_PATH } from '@/lib/company';

function Brand({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left focus:outline-none"
      aria-label="GRUPO FALPAT SRL"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white shadow-lg">
        <Image
          src={LOGO_PATH}
          alt="Logo GRUPO FALPAT SRL"
          width={44}
          height={44}
          className="h-10 w-10 object-contain"
          priority
        />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-extrabold uppercase tracking-widest text-slate-50">
          Grupo <span className="text-gradient-falpat">Falpat</span>
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          SRL · Control de Stock
        </span>
      </span>
    </button>
  );
}

function NavItem({ icon, label, href }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ' +
        (active
          ? 'bg-falpat/10 text-falpat-soft shadow-[inset_0_0_0_1px_rgba(45,212,255,0.25)]'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100')
      }
    >
      {icon}
      <span className="uppercase tracking-wider">{label}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-falpat shadow-glow" />
      )}
    </Link>
  );
}

function QuickStats() {
  const { stats } = useApp();
  const items = [
    { label: 'Entradas', value: stats.entradas, cls: 'text-falpat-soft' },
    { label: 'Salidas', value: stats.salidas, cls: 'text-volt' },
    { label: 'Total', value: stats.total, cls: 'text-slate-100' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-center">
          <div className={`font-mono text-lg font-bold tabular-nums ${it.cls}`}>{it.value}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Sidebar() {
  return (
    <>
      {/* ====== Sidebar desktop (lg+) ====== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-night-900/70 backdrop-blur-2xl lg:flex">
        <div className="flex h-full flex-col px-5 py-6">
          <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

          <nav className="mt-8 space-y-1.5">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Menú
            </p>
            <NavItem icon={<IconLayout className="h-[18px] w-[18px]" />} label="Panel" href="/" />
            <NavItem icon={<IconPieChart className="h-[18px] w-[18px]" />} label="Reportes" href="/reportes" />
            <NavItem icon={<IconLayers className="h-[18px] w-[18px]" />} label="Informes" href="/informes" />
          </nav>

          <div className="mt-8">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Resumen
            </p>
            <QuickStats />
          </div>

          <div className="mt-auto">
            <p className="text-center text-[10px] uppercase tracking-wider text-slate-600">
              v1.0 · GitHub + Vercel
            </p>
          </div>
        </div>
      </aside>

      {/* ====== Barra superior mobile (< lg) ====== */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-night-900/80 px-4 backdrop-blur-2xl lg:hidden">
        <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      </header>
    </>
  );
}
