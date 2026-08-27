'use client';

// ============================================================
// components/StatsCard.js
// Tarjeta de estadística del dashboard (glassmorphism).
// ============================================================

const TONES = {
  cyan: {
    border: 'hover:border-falpat/40',
    icon: 'bg-falpat/10 text-falpat-soft border-falpat/30',
    value: 'text-falpat-soft',
  },
  volt: {
    border: 'hover:border-volt/40',
    icon: 'bg-volt/10 text-volt border-volt/30',
    value: 'text-volt',
  },
  white: {
    border: 'hover:border-white/25',
    icon: 'bg-white/10 text-slate-100 border-white/20',
    value: 'text-slate-100',
  },
};

export default function StatsCard({ label, value, sub, icon, tone = 'cyan' }) {
  const t = TONES[tone] || TONES.cyan;
  return (
    <div
      className={`card group relative overflow-hidden transition duration-200 ${t.border}`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: tone === 'volt' ? '#d4af37' : '#3b82f6' }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label !mb-2">{label}</p>
          <p className={`font-mono text-3xl font-bold tabular-nums tracking-tight ${t.value}`}>
            {value}
          </p>
          {sub && <p className="mt-1.5 truncate text-xs text-slate-400">{sub}</p>}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${t.icon}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
