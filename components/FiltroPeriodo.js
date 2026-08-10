'use client';

// ============================================================
// components/FiltroPeriodo.js
// Filtro de período compartido entre Panel, Reportes e Informes.
// - Principal: Mes + Año agrupados.
// - Secundario (opcional): Desde / Hasta como detalle.
// ============================================================
import { MESES } from '@/lib/utils';

export default function FiltroPeriodo({
  mes,
  anio,
  desde,
  hasta,
  anios,
  onMes,
  onAnio,
  onDesde,
  onHasta,
  showDetalle = true,
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Mes</label>
          <select
            value={mes}
            onChange={(e) => onMes(e.target.value)}
            className="field"
            aria-label="Filtrar por mes"
          >
            <option value="">Todos</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1} className="bg-night-900">
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select
            value={anio}
            onChange={(e) => onAnio(e.target.value)}
            className="field"
            aria-label="Filtrar por año"
          >
            <option value="">Todos</option>
            {anios.map((a) => (
              <option key={a} value={a} className="bg-night-900">
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showDetalle && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Período detallado (desde → hasta)
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => onDesde(e.target.value)}
                className="field"
                aria-label="Desde"
              />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => onHasta(e.target.value)}
                className="field"
                aria-label="Hasta"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
