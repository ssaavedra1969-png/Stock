'use client';

// ============================================================
// app/informes/page.js
// Informes de stock: entradas / salidas / balance por producto
// y por período, calculados 100% en el cliente sobre la cache local.
// ============================================================
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { toMillis, parseWeight, normalizeText, anioMes, descripcionPeriodo } from '@/lib/utils';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import FiltrosAplicados from '@/components/FiltrosAplicados';
import MultiSelect from '@/components/MultiSelect';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconScale,
  IconAlert,
  IconRefresh,
  IconX,
  IconSearch,
  IconTruck,
} from '@/components/Icons';

function fmtTn(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(1).replace('.', ',')} tn`;
}

function toDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

const TIPOS = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Entrada', label: 'Entradas' },
  { value: 'Salida', label: 'Salidas' },
];

const RANGOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'todo', label: 'Todo el período' },
];

export default function Informes() {
  const { records, productos, loading, error, reload } = useApp();
  const [productosSel, setProductosSel] = useState([]);
  const [tipo, setTipo] = useState('Todos');
  const [planta, setPlanta] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [sortKey, setSortKey] = useState('peso');
  const [sortDir, setSortDir] = useState('desc');

  const plantas = useMemo(
    () => [...new Set(records.map((r) => r.planta).filter(Boolean))].sort(),
    [records]
  );

  const anios = useMemo(
    () =>
      [...new Set(records.map((r) => anioMes(r.fechaRemito)?.anio).filter(Boolean))].sort(
        (a, b) => b - a
      ),
    [records]
  );

  const filtered = useMemo(() => {
    const min = desde ? toMillis(new Date(`${desde}T00:00:00`)) : null;
    const max = hasta ? toMillis(new Date(`${hasta}T23:59:59`)) : null;
    const q = normalizeText(busqueda);
    return records.filter((r) => {
      if (productosSel.length > 0 && !productosSel.includes(r.producto)) return false;
      if (tipo !== 'Todos' && r.carga !== tipo) return false;
      if (planta !== 'Todas' && r.planta !== planta) return false;
      if (q) {
        const haystack = normalizeText(
          [
            r.patente,
            r.chofer,
            r.nroRemitoFalpat,
            r.nroRemitoProveedor,
            r.proveedor,
            r.cliente,
          ].join(' ')
        );
        if (!haystack.includes(q)) return false;
      }
      const ms = toMillis(r.fechaRemito);
      if (ms == null) return false;
      const ym = anioMes(r.fechaRemito);
      if (anio && ym?.anio !== Number(anio)) return false;
      if (mes && ym?.mes !== Number(mes)) return false;
      if (min != null && ms < min) return false;
      if (max != null && ms > max) return false;
      return true;
    });
  }, [records, productosSel, tipo, planta, busqueda, desde, hasta, mes, anio]);

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
    const arr = [...map.values()];
    const cmp =
      sortKey === 'producto'
        ? (a, b) => a.producto.localeCompare(b.producto)
        : (a, b) => a.entradasTn + a.salidasTn - (b.entradasTn + b.salidasTn);
    return arr.sort((a, b) => (sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)));
  }, [filtered, sortKey, sortDir]);

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

  const hasFilters =
    productosSel.length > 0 ||
    tipo !== 'Todos' ||
    planta !== 'Todas' ||
    Boolean(busqueda) ||
    Boolean(desde) ||
    Boolean(hasta) ||
    Boolean(mes) ||
    Boolean(anio);

  const activeFilters = [
    productosSel.length > 0,
    tipo !== 'Todos',
    planta !== 'Todas',
    Boolean(busqueda),
    Boolean(desde),
    Boolean(hasta),
    Boolean(mes),
    Boolean(anio),
  ].filter(Boolean).length;

  const filtrosAplicados = useMemo(() => {
    const items = [];
    if (mes || anio || desde || hasta) {
      items.push(`Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`);
    }
    if (productosSel.length > 0) items.push(`Producto: ${productosSel.join(', ')}`);
    if (planta !== 'Todas') items.push(`Planta: ${planta}`);
    if (tipo !== 'Todos') items.push(`Tipo: ${tipo === 'Entrada' ? 'Entradas' : 'Salidas'}`);
    if (busqueda) items.push(`Búsqueda: "${busqueda}"`);
    return items;
  }, [mes, anio, desde, hasta, productosSel, planta, tipo, busqueda]);

  function clearFilters() {
    setProductosSel([]);
    setTipo('Todos');
    setPlanta('Todas');
    setBusqueda('');
    setDesde('');
    setHasta('');
    setMes('');
    setAnio('');
  }

  function toggleSort(key) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === 'producto' ? 'asc' : 'desc');
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  }

  function quickRange(key) {
    const now = new Date();
    if (key === 'hoy') {
      const d = toDateInput(now);
      setDesde(d);
      setHasta(d);
    } else if (key === '7d') {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      setDesde(toDateInput(from));
      setHasta(toDateInput(now));
    } else if (key === 'mes') {
      setDesde(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
      setHasta(toDateInput(now));
    } else if (key === 'todo') {
      setDesde('');
      setHasta('');
    }
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
      <div className="card !p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="section-title !text-lg">Filtros</h2>
            {activeFilters > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-falpat/25 px-1.5 text-[11px] font-bold text-falpat-soft">
                {activeFilters}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="btn-ghost"
          >
            <IconX className="h-4 w-4" />
            Limpiar filtros
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Productos</label>
            <MultiSelect
              options={productos}
              value={productosSel}
              onChange={setProductosSel}
              placeholder="Todos los productos"
              searchPlaceholder="Buscar producto…"
              itemLabel="productos"
            />
          </div>

          <div>
            <label className="label">Planta</label>
            <select
              value={planta}
              onChange={(e) => setPlanta(e.target.value)}
              className="field"
            >
              <option value="Todas" className="bg-night-900">
                Todas
              </option>
              {plantas.map((p) => (
                <option key={p} value={p} className="bg-night-900">
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Tipo de movimiento</label>
            <div className="inline-flex w-full rounded-lg border border-white/10 bg-black/20 p-1">
              {TIPOS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setTipo(o.value)}
                  className={
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
                    (tipo === o.value
                      ? 'bg-falpat/20 text-falpat-soft shadow'
                      : 'text-slate-400 hover:text-slate-200')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label">Búsqueda</label>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Patente, chofer, remito, proveedor…"
                className="field !pl-9"
              />
            </div>
          </div>
        </div>

        {/* Período: Mes + Año (principal) y Desde/Hasta (detalle secundario) */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <FiltroPeriodo
            mes={mes}
            anio={anio}
            desde={desde}
            hasta={hasta}
            anios={anios}
            onMes={setMes}
            onAnio={setAnio}
            onDesde={setDesde}
            onHasta={setHasta}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Período rápido:
          </span>
          {RANGOS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => quickRange(r.key)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition hover:border-falpat/40 hover:bg-falpat/10 hover:text-falpat-soft"
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <FiltrosAplicados items={filtrosAplicados} onLimpiar={hasFilters ? clearFilters : undefined} />
          <p className="text-xs text-slate-500">
            Los pesos se suman desde el campo &quot;Peso (Balanza)&quot; en toneladas (tn).
          </p>
        </div>
      </div>

      {/* Resumen compacto */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <IconTruck className="h-4 w-4 text-falpat-soft" />
          <b className="text-base leading-none text-white">{filtered.length}</b>
          <span className="text-slate-500">viajes</span>
        </span>
        <span className="h-4 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1.5">
          <IconArrowUpRight className="h-3.5 w-3.5 text-falpat-soft" />
          <b className="text-base leading-none text-falpat-soft">{totals.entradas}</b>
          <span className="text-slate-500">entradas</span>
          <span className="font-mono text-slate-300">{fmtTn(totals.entradasTn)}</span>
        </span>
        <span className="h-4 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1.5">
          <IconArrowDownLeft className="h-3.5 w-3.5 text-volt" />
          <b className="text-base leading-none text-volt">{totals.salidas}</b>
          <span className="text-slate-500">salidas</span>
          <span className="font-mono text-slate-300">{fmtTn(totals.salidasTn)}</span>
        </span>
        <span className="h-4 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1.5">
          <IconScale className="h-3.5 w-3.5 text-white" />
          <span className="text-slate-500">Balance</span>
          <b
            className={
              'font-mono text-base leading-none ' +
              (balanceTn >= 0 ? 'text-falpat-soft' : 'text-volt')
            }
          >
            {fmtTn(balanceTn)}
          </b>
        </span>
      </div>

      {/* Tabla por producto */}
      <div className="card overflow-hidden !p-0">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">Resumen por producto</h2>
            <p className="section-sub mt-0.5">
              {filtered.length} viaje{filtered.length !== 1 ? 's' : ''} en el período
              seleccionado
            </p>
          </div>
          <FiltrosAplicados items={filtrosAplicados} onLimpiar={hasFilters ? clearFilters : undefined} />
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
                  <th className="px-4 py-3 font-bold">
                    <button
                      type="button"
                      onClick={() => toggleSort('producto')}
                      className="inline-flex items-center gap-1 transition hover:text-falpat-soft"
                      title="Ordenar por producto"
                    >
                      Producto
                      <span
                        className={
                          'text-[10px] ' +
                          (sortKey === 'producto' ? 'text-falpat-soft' : 'text-slate-600')
                        }
                      >
                        {sortKey === 'producto' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
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
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-slate-300">
                            {e.entradas} viajes
                          </span>
                          <span className="inline-flex rounded-md bg-falpat/15 px-2 py-1 font-mono text-xs font-bold text-falpat-soft">
                            {fmtTn(e.entradasTn)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-slate-300">
                            {e.salidas} viajes
                          </span>
                          <span className="inline-flex rounded-md bg-volt/15 px-2 py-1 font-mono text-xs font-bold text-volt">
                            {fmtTn(e.salidasTn)}
                          </span>
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
                    <div className="flex flex-col gap-1.5">
                      <span className="inline-flex rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-bold text-slate-200">
                        {totals.entradas} viajes
                      </span>
                      <span className="inline-flex rounded-md bg-falpat/20 px-2 py-1 font-mono text-xs font-bold text-falpat-soft">
                        {fmtTn(totals.entradasTn)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-volt">
                    <div className="flex flex-col gap-1.5">
                      <span className="inline-flex rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-bold text-slate-200">
                        {totals.salidas} viajes
                      </span>
                      <span className="inline-flex rounded-md bg-volt/20 px-2 py-1 font-mono text-xs font-bold text-volt">
                        {fmtTn(totals.salidasTn)}
                      </span>
                    </div>
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
