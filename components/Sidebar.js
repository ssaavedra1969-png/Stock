'use client';

// ============================================================
// components/Sidebar.js
// Barra lateral fija (desktop) + barra superior (mobile)
// con el logo "GRUPO FALPAT SRL". Estética tipo Glamour's Control.
// ============================================================
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  IconChevronLeft,
  IconChevronRight,
  IconLayers,
  IconLayout,
  IconPieChart,
  IconUpload,
} from './Icons';
import { LOGO_PATH } from '@/lib/company';

function Brand({ onClick, collapsed, stacked = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex focus:outline-none ${
        stacked && !collapsed ? 'w-full flex-col items-center gap-1.5 text-center' : 'items-center gap-3 text-left'
      }`}
      aria-label="GRUPO FALPAT SRL"
    >
      {!collapsed && stacked && (
        <span className="whitespace-nowrap text-[12px] font-extrabold uppercase leading-none tracking-[0.14em] text-slate-100">
          Grupo Falpat SRL
        </span>
      )}
      <span className={`omx-brand-logo flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${
        stacked && !collapsed ? 'h-10 w-10' : 'h-11 w-11'
      }`}>
        <Image
          src={LOGO_PATH}
          alt="Logo GRUPO FALPAT SRL"
          width={44}
          height={44}
          className={`${stacked && !collapsed ? 'h-9 w-9' : 'h-10 w-10'} object-contain mix-blend-screen`}
          priority
        />
      </span>
      {!collapsed && (
        stacked ? (
          <span className="whitespace-nowrap text-[9px] font-semibold uppercase leading-none tracking-[0.2em] text-slate-400">
            Control de stock
          </span>
        ) : (
          <span className="leading-tight">
            <span className="block text-sm font-extrabold uppercase tracking-widest text-slate-50">
              Grupo <span className="omx-brand-gradient">Falpat</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              SRL · Control de Stock
            </span>
          </span>
        )
      )}
    </button>
  );
}

function NavItem({ icon, label, href, collapsed, onNavigate }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={
        'group relative flex items-center overflow-hidden rounded-xl border border-white/[0.06] px-3 py-2 text-xs font-bold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-falpat/60 ' +
        (collapsed ? 'justify-center px-2.5 ' : 'gap-3 ') +
        (active
          ? 'omx-nav-active text-falpat-soft shadow-[0_8px_20px_-12px_rgba(0,0,0,0.9),inset_0_1px_rgba(255,255,255,0.12)]'
          : 'bg-gradient-to-b from-white/[0.045] to-white/[0.015] text-slate-400 shadow-[0_4px_10px_-5px_rgba(0,0,0,0.85),inset_0_1px_rgba(255,255,255,0.045)] hover:-translate-y-0.5 hover:border-falpat/25 hover:from-white/[0.07] hover:to-white/[0.025] hover:text-slate-100 hover:shadow-[0_9px_18px_-9px_rgba(0,0,0,0.95),inset_0_1px_rgba(255,255,255,0.08)]')
      }
    >
      {active && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-xl border border-falpat/40" />
          <span className="pointer-events-none absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-falpat shadow-[0_0_12px_var(--accent-glow)]" />
        </>
      )}
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition duration-200 group-hover:scale-105 ${
        active
          ? 'border-falpat/25 bg-falpat/10 text-falpat-soft shadow-[inset_0_1px_rgba(255,255,255,0.1)]'
          : 'border-white/[0.06] bg-black/20 text-slate-400 shadow-[inset_0_1px_rgba(255,255,255,0.06)] group-hover:border-falpat/20 group-hover:bg-falpat/10 group-hover:text-falpat-soft'
      }`}>
        {icon}
      </span>
      {!collapsed && <span className="relative leading-snug uppercase tracking-[0.08em]">{label}</span>}
      {!collapsed && active && (
        <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-falpat shadow-glow" />
      )}
    </Link>
  );
}

function NavGroup({ title, children, collapsed }) {
  return (
    <div className="space-y-1.5">
      {!collapsed && (
        <p className="mb-2 px-2 pt-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function NavigationLinks({ collapsed, onNavigate }) {
  return (
    <div className="space-y-3">
      <NavGroup title="Navegación" collapsed={collapsed}>
        <NavItem icon={<IconLayout className="h-[18px] w-[18px]" />} label="Inicio" href="/" collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem icon={<IconLayers className="h-[18px] w-[18px]" />} label="Movimientos" href="/movimientos" collapsed={collapsed} onNavigate={onNavigate} />
      </NavGroup>
      <NavGroup title="Importación" collapsed={collapsed}>
        <NavItem icon={<IconUpload className="h-[18px] w-[18px]" />} label="Importar Excel" href="/incorporar" collapsed={collapsed} onNavigate={onNavigate} />
      </NavGroup>
      <NavGroup title="Análisis" collapsed={collapsed}>
        <NavItem icon={<IconPieChart className="h-[18px] w-[18px]" />} label="Reportes" href="/reportes" collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem icon={<IconLayers className="h-[18px] w-[18px]" />} label="Informes" href="/informes" collapsed={collapsed} onNavigate={onNavigate} />
      </NavGroup>
    </div>
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
        <div key={it.label} className="omx-stat border p-2.5 text-center">
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
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <>
      {/* ====== Sidebar desktop (lg+) ====== */}
      <aside
        className={`omx-sidebar-scroll fixed inset-y-0 left-0 z-40 hidden flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-r border-white/[0.07] bg-[#080c14]/95 shadow-[12px_0_36px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl transition-[width] duration-300 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex min-h-full flex-col py-5 ${collapsed ? 'px-2' : 'px-4'}`}>
          <div className={`omx-sidebar-brand sticky top-0 z-10 flex rounded-2xl ${
            collapsed ? 'flex-col items-center gap-2 p-2' : 'items-center gap-2 p-3'
          }`}>
            <div className={collapsed ? 'flex w-full justify-center' : 'min-w-0 flex-1'}>
              <Brand
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                collapsed={collapsed}
                stacked
              />
            </div>
            <button
              type="button"
              onClick={onToggle}
              title={collapsed ? 'Expandir menú' : 'Contraer menú (pantalla completa)'}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              className="relative z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.025] text-slate-400 shadow-[0_4px_10px_-5px_rgba(0,0,0,0.9),inset_0_1px_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-falpat/30 hover:text-falpat-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-falpat/60"
            >
              {collapsed ? (
                <IconChevronRight className="h-4 w-4" />
              ) : (
                <IconChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="mt-5">
            <NavigationLinks collapsed={collapsed} />
          </nav>

          {!collapsed && pathname === '/movimientos' && (
            <div className="mt-5">
              <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Resumen
              </p>
              <QuickStats />
            </div>
          )}

          {!collapsed && (
            <div className="mt-auto pt-6">
              <p className="text-center text-[10px] uppercase tracking-wider text-slate-600">
                v1.0 · GitHub + Vercel
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ====== Barra superior mobile (< lg) ====== */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#080c14]/90 px-4 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.95)] backdrop-blur-2xl lg:hidden">
        <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen((open) => !open)}
          className="btn-ghost !px-3 !py-2 text-xs"
        >
          {mobileOpen ? 'Cerrar' : 'Menú'}
        </button>
      </header>
      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="omx-mobile-navigation fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-x-hidden overflow-y-auto overscroll-contain border-b border-white/10 bg-[#080c14]/[0.98] p-4 shadow-[0_24px_48px_-18px_rgba(0,0,0,0.95),inset_0_1px_rgba(255,255,255,0.04)] backdrop-blur-2xl [touch-action:pan-y] lg:hidden"
        >
          <nav>
            <NavigationLinks
              collapsed={false}
              onNavigate={closeMobileMenu}
            />
          </nav>
        </div>
      )}
    </>
  );
}
