'use client';

// ============================================================
// components/FiltrosAplicados.js
// Etiqueta visual de los filtros activos en un informe, para que
// se entienda qué se está viendo sin ambigüedad.
// ============================================================
import { IconX } from '@/components/Icons';

export default function FiltrosAplicados({ items, onLimpiar, dark = false }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span
        className={
          'text-[11px] font-bold uppercase tracking-wider ' +
          (dark ? 'text-slate-400' : 'text-slate-500')
        }
      >
        Filtros aplicados:
      </span>
      {items.map((it, i) => (
        <span
          key={i}
          className={
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ' +
            (dark
              ? 'border-cyan-700/30 bg-cyan-50 text-cyan-800'
              : 'border-falpat/30 bg-falpat/10 text-falpat-soft')
          }
        >
          {it}
        </span>
      ))}
      {onLimpiar && (
        <button
          type="button"
          onClick={onLimpiar}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
          title="Limpiar todos los filtros"
        >
          <IconX className="h-3 w-3" />
          Limpiar
        </button>
      )}
    </div>
  );
}
