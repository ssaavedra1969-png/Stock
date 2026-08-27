'use client';

// ============================================================
// components/Topbar.js
// Barra superior estilo "Glamour's Control": fecha y hora en vivo,
// título de la sección y marca. Solo visual, no toca funcionalidad.
// ============================================================
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const SECTION_TITLES = {
  '/': 'Panel',
  '/reportes': 'Reportes',
  '/informes': 'Informes',
  '/incorporar': 'Incorporar',
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Topbar() {
  const pathname = usePathname();
  const now = useClock();

  const date = now.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = now.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const title = SECTION_TITLES[pathname] || 'Stock';

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#080c14]/70 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="flex items-center gap-1">
        <h1 className="text-[1.1rem] font-bold tracking-tight text-slate-100">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center font-mono sm:flex">
          <span className="text-[0.8rem] font-semibold tracking-[0.02em] text-slate-400">
            {date}
          </span>
          <span className="mx-2.5 h-[3px] w-[3px] rounded-full bg-gold/70" />
          <span className="text-[0.9rem] font-medium text-slate-100">{time}</span>
        </div>
      </div>
    </header>
  );
}
