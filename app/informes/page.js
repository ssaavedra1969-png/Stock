'use client';

// ============================================================
// app/informes/page.js
// Informes de stock: entradas / salidas / balance por producto
// y por período, calculados 100% en el cliente sobre la cache local.
// ============================================================
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { toMillis, parseWeight } from '@/lib/utils';
import StatsCard from '@/components/StatsCard';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconLayers,
  IconScale,
  IconAlert,
  IconRefresh,
  IconX,
} from '@/components/Icons';

function fmtTn(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(1).replace('.', ',')} tn`;
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div className="card mx-auto max-w-2xl border-red-500/30 p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-950/40 text-red-400">
          <IconAlert className="h-6 w-6" />
        </div>
        <div className="flex-1 space-y-3">
          <h2 className="section-title">Error al conectar con la base de datos</h2>
          <p className="break-words text-sm text-slate-300">{message}</p>
          <button type="button" onClick={onRetry} className="btn-ghost">
            <IconRefresh className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Informes() {
  const { records, productos, loading, error, reload } = useApp();
  const [producto, setProducto] = useState('Todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const filtered = useMemo(() => {
    const min = desde ? toMillis(new Date(`${desde}T00:00:00`)) : null;
    const max = hasta ? toMillis(new Date(`${hasta}T23:59:59`)) : null;
    return records.filter((r) => {
      if (producto !== 'Todos' && r.producto !== producto) return false;
      const ms = toMillis(r.fechaRemito);
      if (ms == null) return false;
      if (min != null && ms < min) return false;
      if (max != null && ms > max) return false;
      return true;
    });
  }, [records, producto, desde, hasta]);

  const byProduct = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const key = String(r.producto || 'Sin producto');
      const entry = map.get(key) || {
        producto: key,
        entradas: 0,
        entradasTn: 0,
        salidas: 0,
        salidasTn: 0,
      };
      const tn = parseWeight(r.pesoBalanza);
      if (r.carga === 'Entrada') {
        entry.entradas += 1;
        entry.entradasTn += tn;
      } else {
        entry.salidas += 1;
        entry.salidasTn += tn;
      }
      map.set(key, entry);
    }
    return [...map.values()].sort(
      (a, b) => b.entradasTn + b.salidasTn - (a.entradasTn + a.salidasTn)
    );
  }, [filtered]);

  const totals = useMemo(
    () =>
      byProduct.reduce(
        (acc, e) => ({
          entradas: acc.entradas + e.entradas,
          entradasTn: acc.entradasTn + e.entradasTn,
          salidas: acc.salidas + e.salidas,
          salidasTn: acc.salidasTn + e.salidasTn,
        }),
        { entradas: 0, entradasTn: 0, salidas: 0, salidasTn: 0 }
      ),
    [byProduct]
  );

  const balanceTn = totals.entradasTn - totals.salidasTn;
  const hasFilters = producto !== 'Todos' || Boolean(desde) || Boolean(hasta);

  function clearFilters() {
    setProducto('Todos');
    setDesde('');
    setHasta('');
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-sub mb-1">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1 className="section-title !text-2xl">
            Informes de <span className="text-gradient-falpat">Stock</span>
          </h1>
        </div>
        <button type="button" onClick={reload} className="btn-ghost" disabled={loading}>
          <IconRefresh className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Actualizar
        </button>
      </div>

      {error && <ErrorPanel message={error} onRetry={reload} />}

      {/* Filtros */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <label className="label">Producto</label>
            <select
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="field"
            >
              <option value="Todos" className="bg-night-900">
                Todos
              </option>
              {productos.map((p) => (
                <option key={p} value={p} className="bg-night-900">
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">&nbsp;</label>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="btn-ghost"
            >
              <IconX className="h-4 w-4" />
              Limpiar
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Los pesos se suman desde el campo &quot;Peso (Balanza)&quot; en toneladas (tn).
        </p>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total entradas"
          value={loading ? '…' : totals.entradas}
          sub={loading ? '' : `${fmtTn(totals.entradasTn)} ingresadas`}
          icon={<IconArrowUpRight className="h-5 w-5" />}
          tone="cyan"
        />
        <StatsCard
          label="Total salidas"
          value={loading ? '…' : totals.salidas}
          sub={loading ? '' : `${fmtTn(totals.salidasTn)} despachadas`}
          icon={<IconArrowDownLeft className="h-5 w-5" />}
          tone="volt"
        />
        <StatsCard
          label="Balance"
          value={loading ? '…' : fmtTn(balanceTn)}
          sub={balanceTn >= 0 ? 'Más entradas que salidas' : 'Más salidas que entradas'}
          icon={<IconScale className="h-5 w-5" />}
          tone={balanceTn >= 0 ? 'cyan' : 'volt'}
        />
        <StatsCard
          label="Movimientos"
          value={loading ? '…' : filtered.length}
          sub={hasFilters ? 'Según los filtros aplicados' : 'Todos los registros'}
          icon={<IconLayers className="h-5 w-5" />}
          tone="white"
        />
      </div>

      {/* Tabla por producto */}
      <div className="card overflow-hidden !p-0">
        <div className="flex flex-col gap-1 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">Resumen por producto</h2>
            <p className="section-sub mt-0.5">
              {filtered.length} registro{filtered.length !== 1 ? 's' : ''} en el período
              seleccionado
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Calculando informes…</div>
        ) : byProduct.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Sin datos para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-4 py-3 font-bold">Producto</th>
                  <th className="px-4 py-3 font-bold">Entradas</th>
                  <th className="px-4 py-3 font-bold">Salidas</th>
                  <th className="px-4 py-3 font-bold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((e) => {
                  const bal = e.entradasTn - e.salidasTn;
                  return (
                    <tr
                      key={e.producto}
                      className="border-b border-white/[0.05] transition last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 font-semibold text-falpat-soft">{e.producto}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-falpat-soft">
                          {e.entradas} · {fmtTn(e.entradasTn)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-volt">
                          {e.salidas} · {fmtTn(e.salidasTn)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'font-mono text-xs font-bold tabular-nums ' +
                            (bal > 0 ? 'text-falpat-soft' : bal < 0 ? 'text-volt' : 'text-slate-400')
                          }
                        >
                          {fmtTn(bal)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-white/10 bg-black/20">
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-300">
                    Totales
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-falpat-soft">
                    {totals.entradas} · {fmtTn(totals.entradasTn)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-volt">
                    {totals.salidas} · {fmtTn(totals.salidasTn)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-100">
                    {fmtTn(balanceTn)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
