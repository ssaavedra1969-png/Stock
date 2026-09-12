'use client';

// ============================================================
// components/Sidebar.js
// Barra lateral fija (desktop) + barra superior (mobile)
// con el logo "GRUPO FALPAT SRL". Estética tipo Glamour's Control.
// ============================================================
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { IconLayout, IconLayers, IconPieChart, IconUpload, IconChevronLeft, IconChevronRight } from './Icons';
import { LOGO_PATH } from '@/lib/company';

function Brand({ onClick, collapsed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 text-left focus:outline-none"
      aria-label="GRUPO FALPAT SRL"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-falpat to-indigo shadow-[0_4px_16px_rgba(59,130,246,0.3)]">
        <Image
          src={LOGO_PATH}
          alt="Logo GRUPO FALPAT SRL"
          width={44}
          height={44}
          className="h-10 w-10 object-contain mix-blend-screen"
          priority
        />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-sm font-extrabold uppercase tracking-widest text-slate-50">
            Grupo <span className="text-gradient-falpat">Falpat</span>
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            SRL · Control de Stock
          </span>
        </span>
      )}
    </button>
  );
}

function NavItem({ icon, label, href, collapsed }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={
        'group relative flex items-center overflow-hidden rounded-xl border border-white/[0.04] px-3.5 py-2.5 text-sm font-semibold transition ' +
        (collapsed ? 'justify-center px-2.5 ' : 'gap-3 ') +
        (active
          ? 'translate-x-0 bg-gradient-to-br from-falpat/15 to-indigo/5 text-falpat-soft shadow-[inset_0_1px_rgba(255,255,255,0.09),-12px_14px_26px_rgba(0,0,0,0.5)]'
          : 'border-white/[0.04] bg-white/[0.02] text-slate-400 shadow-[0_2px_6px_rgba(0,0,0,0.28)] hover:translate-x-0 hover:border-falpat/25 hover:bg-white/[0.05] hover:text-slate-100')
      }
    >
      {active && (
        <span className="pointer-events-none absolute inset-0 rounded-xl border border-falpat/40" />
      )}
      <span className="relative shrink-0 transition group-hover:scale-110 group-hover:text-falpat-soft">
        {icon}
      </span>
      {!collapsed && <span className="relative uppercase tracking-wider">{label}</span>}
      {!collapsed && active && (
        <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-falpat shadow-glow" />
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
        <div key={it.label} className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-2.5 text-center">
          <div className={`font-mono text-lg font-bold tabular-nums ${it.cls}`}>{it.value}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Sidebar({ collapsed = false, onToggle }) {
  return (
    <>
      {/* ====== Sidebar desktop (lg+) ====== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] bg-[#080c14]/85 backdrop-blur-2xl transition-[width] duration-300 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex h-full flex-col pt-6 ${collapsed ? 'px-3' : 'px-5'}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} collapsed={collapsed} />
            </div>
            <button
              type="button"
              onClick={onToggle}
              title={collapsed ? 'Expandir menú' : 'Contraer menú (pantalla completa)'}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition hover:border-falpat/30 hover:bg-white/[0.06] hover:text-falpat-soft"
            >
              {collapsed ? (
                <IconChevronRight className="h-4 w-4" />
              ) : (
                <IconChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className={`space-y-1.5 ${collapsed ? 'mt-8' : 'mt-8'}`}>
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Menú
              </p>
            )}
            <NavItem icon={<IconLayout className="h-[18px] w-[18px]" />} label="Panel" href="/" collapsed={collapsed} />
            <NavItem icon={<IconPieChart className="h-[18px] w-[18px]" />} label="Reportes" href="/reportes" collapsed={collapsed} />
            <NavItem icon={<IconLayers className="h-[18px] w-[18px]" />} label="Informes" href="/informes" collapsed={collapsed} />
            <NavItem icon={<IconUpload className="h-[18px] w-[18px]" />} label="Incorporar" href="/incorporar" collapsed={collapsed} />
          </nav>

          {!collapsed && (
            <div className="mt-8">
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Resumen
              </p>
              <QuickStats />
            </div>
          )}

          {!collapsed && (
            <div className="mt-auto">
              <p className="text-center text-[10px] uppercase tracking-wider text-slate-600">
                v1.0 · GitHub + Vercel
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ====== Barra superior mobile (< lg) ====== */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#080c14]/80 px-4 backdrop-blur-2xl lg:hidden">
        <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      </header>
    </>
  );
}
