'use client';

// ============================================================
// app/informes/page.js
// Informes de stock: entradas / salidas / balance por producto
// y por período, calculados 100% en el cliente sobre la cache local.
// ============================================================
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { toMillis, parseWeight, normalizeText, anioMes, descripcionPeriodo, todayISO } from '@/lib/utils';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import FiltrosAplicados from '@/components/FiltrosAplicados';
import MultiSelect from '@/components/MultiSelect';
import SectionHero from '@/components/SectionHero';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconScale,
  IconAlert,
  IconRefresh,
  IconX,
  IconSearch,
  IconTruck,
  IconPieChart,
  IconBox,
  IconBuilding,
} from '@/components/Icons';
import { ChartCard, GlamBars } from '@/components/Charts';

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

function getCantidadYUnidad(value) {
  const match = String(value ?? '').trim().match(/^([+-]?[\d.,]+)\s*([a-zA-Z]*)$/);
  if (!match) return { cantidad: 0, unidad: 'sin unidad' };

  const raw = match[1];
  const lastSeparator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let normalized = raw;
  if (lastSeparator >= 0) {
    const integer = raw.slice(0, lastSeparator).replace(/[.,]/g, '');
    const fraction = raw.slice(lastSeparator + 1).replace(/[.,]/g, '');
    const digitsAfter = raw.length - lastSeparator - 1;
    normalized =
      digitsAfter === 3 && integer
        ? raw.replace(/[.,]/g, '')
        : `${integer}.${fraction}`;
  }

  const cantidad = Number(normalized);
  return {
    cantidad: Number.isFinite(cantidad) ? cantidad : 0,
    unidad: match[2].toLowerCase() || 'sin unidad',
  };
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
  const [vista, setVista] = useState('flujo');
  const [fechaCorte, setFechaCorte] = useState(() => todayISO());
  const [unidadStock, setUnidadStock] = useState('tn');
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

  const stockRows = useMemo(() => {
    const end = fechaCorte ? new Date(`${fechaCorte}T23:59:59.999`).getTime() : Infinity;
    const q = normalizeText(busqueda);
    const map = new Map();
    for (const record of records) {
      const timestamp = toMillis(record.fechaRemito);
      if (timestamp == null || timestamp > end) continue;
      if (planta !== 'Todas' && record.planta !== planta) continue;
      if (productosSel.length && !productosSel.includes(record.producto)) continue;

      const { cantidad, unidad } = getCantidadYUnidad(record.pesoBalanza);
      const producto = record.producto || 'Sin producto';
      const codigo = record.codigoProducto || '—';
      if (q && !normalizeText(`${producto} ${codigo} ${record.planta || ''}`).includes(q)) continue;
      const key = `${record.planta || 'Sin planta'}§${codigo}§${producto}§${unidad}`;
      if (!map.has(key)) {
        map.set(key, {
          planta: record.planta || 'Sin planta',
          producto,
          codigo,
          unidad,
          entradas: 0,
          salidas: 0,
          ultimo: timestamp,
        });
      }
      const row = map.get(key);
      if (record.carga === 'Entrada') row.entradas += cantidad;
      else row.salidas += cantidad;
      row.ultimo = Math.max(row.ultimo, timestamp);
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        stock: row.entradas - row.salidas,
        ultimoMs: row.ultimo,
        ultimo: new Date(row.ultimo).toLocaleDateString('es-AR'),
      }))
      .sort((a, b) => a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }));
  }, [records, fechaCorte, planta, productosSel, busqueda]);

  const stockByProduct = useMemo(() => {
    const map = new Map();
    for (const row of stockRows) {
      const key = `${row.codigo}§${row.producto}§${row.unidad}`;
      if (!map.has(key)) {
        map.set(key, {
          producto: row.producto,
          codigo: row.codigo,
          unidad: row.unidad,
          entradas: 0,
          salidas: 0,
          stock: 0,
          ultimoMs: row.ultimoMs,
        });
      }
      const item = map.get(key);
      item.entradas += row.entradas;
      item.salidas += row.salidas;
      item.stock += row.stock;
      item.ultimoMs = Math.max(item.ultimoMs, row.ultimoMs);
    }
    return [...map.values()]
      .map((item) => ({ ...item, ultimo: new Date(item.ultimoMs).toLocaleDateString('es-AR') }))
      .sort((a, b) => b.stock - a.stock);
  }, [stockRows]);

  const stockByPlant = useMemo(() => {
    const map = new Map();
    for (const row of stockRows) {
      const key = `${row.planta}§${row.unidad}`;
      if (!map.has(key)) {
        map.set(key, { planta: row.planta, unidad: row.unidad, productos: 0, stock: 0 });
      }
      const item = map.get(key);
      item.productos += 1;
      item.stock += row.stock;
    }
    return [...map.values()].sort((a, b) => b.stock - a.stock);
  }, [stockRows]);

  const stockUnits = useMemo(
    () => [...new Set(records.map((record) => getCantidadYUnidad(record.pesoBalanza).unidad))].sort(),
    [records]
  );
  const stockViewRows = (vista === 'stock-planta' ? stockByPlant : stockByProduct)
    .filter((row) => row.unidad === unidadStock);
  const stockChartRows = stockViewRows.slice(0, 12);
  const stockChartTotal = stockViewRows.reduce((sum, row) => sum + row.stock, 0);
  const flowChartRows = [...byProduct]
    .sort((a, b) => b.entradasTn + b.salidasTn - a.entradasTn - a.salidasTn)
    .slice(0, 12);

  const hasFilters =
    productosSel.length > 0 ||
    planta !== 'Todas' ||
    Boolean(busqueda) ||
    (vista === 'flujo' && (tipo !== 'Todos' || Boolean(desde) || Boolean(hasta) || Boolean(mes) || Boolean(anio)));

  const activeFilters = [
    productosSel.length > 0,
    vista === 'flujo' && tipo !== 'Todos',
    planta !== 'Todas',
    Boolean(busqueda),
    vista === 'flujo' && (Boolean(desde) || Boolean(hasta) || Boolean(mes) || Boolean(anio)),
    vista !== 'flujo' && Boolean(fechaCorte),
  ].filter(Boolean).length;

  const filtrosAplicados = useMemo(() => {
    const items = [];
    if (vista === 'flujo' && (mes || anio || desde || hasta)) {
      items.push(`Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`);
    }
    if (productosSel.length > 0) items.push(`Producto: ${productosSel.join(', ')}`);
    if (planta !== 'Todas') items.push(`Planta: ${planta}`);
    if (vista === 'flujo' && tipo !== 'Todos') items.push(`Tipo: ${tipo === 'Entrada' ? 'Entradas' : 'Salidas'}`);
    if (busqueda) items.push(`Búsqueda: "${busqueda}"`);
    if (vista !== 'flujo' && fechaCorte) items.push(`Stock calculado al: ${fechaCorte}`);
    if (vista !== 'flujo') items.push(`Unidad: ${unidadStock}`);
    return items;
  }, [vista, mes, anio, desde, hasta, productosSel, planta, tipo, busqueda, fechaCorte, unidadStock]);

  function clearFilters() {
    setProductosSel([]);
    setTipo('Todos');
    setPlanta('Todas');
    setBusqueda('');
    setDesde('');
    setHasta('');
    setMes('');
    setAnio('');
    setFechaCorte(todayISO());
    setUnidadStock('tn');
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
      <SectionHero
        icon={IconPieChart}
        title="Reportes de Stock"
        tag="Reportes"
        subtitle={`Entradas, salidas y balance · ${new Date().toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
      >
        <button type="button" onClick={reload} className="btn-ghost" disabled={loading}>
          <IconRefresh className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Actualizar
        </button>
      </SectionHero>

      {error && <ErrorPanel message={error} onRetry={reload} />}

      <div className="card">
        <div className="mb-3">
          <h2 className="section-title">¿Qué querés analizar?</h2>
          <p className="section-sub mt-0.5">
            El flujo mide movimientos de un período; el stock calculado suma entradas y salidas hasta una fecha.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de análisis">
          {[
            { value: 'flujo', label: 'Entradas y salidas', detail: 'Movimientos del período' },
            { value: 'stock-producto', label: 'Stock por producto', detail: 'Saldo calculado por material' },
            { value: 'stock-planta', label: 'Stock por planta', detail: 'Saldo calculado por ubicación' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setVista(option.value)}
              aria-pressed={vista === option.value}
              className={`rounded-xl border p-3 text-left transition ${
                vista === option.value
                  ? 'border-falpat/40 bg-falpat/10 text-falpat-soft'
                  : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'
              }`}
            >
              <span className="block text-xs font-bold">{option.label}</span>
              <span className="mt-1 block text-[10px] text-slate-500">{option.detail}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="card !p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="section-title !text-lg">
              {vista === 'flujo' ? 'Filtros de movimientos' : 'Filtros de stock'}
            </h2>
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

          {vista === 'flujo' && (
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
          )}

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

        {vista === 'flujo' ? (
          <>
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
                  className="omx-chip rounded-full border px-3 py-1 text-xs text-slate-300 transition hover:border-falpat/40 hover:bg-falpat/10 hover:text-falpat-soft"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="label">Fecha de corte</span>
              <input
                type="date"
                value={fechaCorte}
                onChange={(event) => setFechaCorte(event.target.value)}
                className="field"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Unidad del gráfico y resumen</span>
              <select value={unidadStock} onChange={(event) => setUnidadStock(event.target.value)} className="field">
                {stockUnits.map((unit) => (
                  <option key={unit} value={unit} className="bg-night-900">{unit}</option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
              Stock calculado = entradas menos salidas hasta la fecha de corte. No equivale necesariamente al conteo físico.
              Los gráficos muestran una sola unidad a la vez para no mezclar toneladas, kg, unidades y otros formatos.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <FiltrosAplicados items={filtrosAplicados} onLimpiar={hasFilters ? clearFilters : undefined} />
          <p className="text-xs text-slate-500">
            {vista === 'flujo'
              ? 'El balance mostrado es entradas menos salidas del período.'
              : 'Los valores corresponden al historial disponible en desarrollo.'}
          </p>
        </div>
      </div>

      {vista !== 'flujo' ? (
        <StockVisual
          loading={loading}
          vista={vista}
          unidad={unidadStock}
          fechaCorte={fechaCorte}
          rows={stockViewRows}
          total={stockChartTotal}
        />
      ) : (
        <>
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

      <ChartCard title="Entradas y salidas por producto (tn)" icon={IconPieChart}>
        <GlamBars
          labels={flowChartRows.map((item) => item.producto)}
          datasets={[
            {
              label: 'Entradas (tn)',
              data: flowChartRows.map((item) => item.entradasTn),
              color: 'rgba(16,185,129,0.85)',
            },
            {
              label: 'Salidas (tn)',
              data: flowChartRows.map((item) => item.salidasTn),
              color: 'rgba(56,189,248,0.85)',
            },
          ]}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Se muestran hasta 12 productos, ordenados por volumen del período. Las toneladas excluyen movimientos registrados en otras unidades.
        </p>
      </ChartCard>

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
        </>
      )}
    </div>
  );
}

function StockVisual({ loading, vista, unidad, fechaCorte, rows, total }) {
  const byPlant = vista === 'stock-planta';
  const chartRows = rows.slice(0, 12);
  const format = (value) => `${Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${unidad}`;

  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Calculando stock al {fechaCorte}…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unidad seleccionada</div>
          <div className="mt-1 font-mono text-lg font-bold text-falpat-soft">{unidad}</div>
        </div>
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Stock calculado al {fechaCorte}
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-white">{format(total)}</div>
        </div>
      </div>

      <ChartCard
        title={byPlant ? `Stock por planta (${unidad})` : `Stock por producto (${unidad})`}
        icon={byPlant ? IconBuilding : IconBox}
      >
        {chartRows.length ? (
          <GlamBars
            labels={chartRows.map((row) => byPlant ? row.planta : row.producto)}
            datasets={[{
              label: `Stock calculado (${unidad})`,
              data: chartRows.map((row) => row.stock),
              color: 'rgba(124,58,237,0.82)',
            }]}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No hay saldo para los filtros seleccionados en esta unidad.
          </div>
        )}
      </ChartCard>

      <div className="card overflow-hidden !p-0">
        <div className="border-b border-white/10 p-4">
          <h2 className="section-title">{byPlant ? 'Detalle de stock por planta' : 'Detalle de stock por producto'}</h2>
          <p className="section-sub mt-0.5">
            Saldo = entradas históricas menos salidas históricas hasta la fecha de corte. Unidad: {unidad}.
          </p>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  {(byPlant
                    ? ['Planta', 'Productos', 'Stock calculado']
                    : ['Producto', 'Código', 'Entradas', 'Salidas', 'Stock calculado', 'Último movimiento']
                  ).map((label) => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${byPlant ? row.planta : row.codigo + row.producto}-${index}`} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03]">
                    {byPlant ? (
                      <>
                        <td className="px-4 py-3 font-semibold text-slate-200">{row.planta}</td>
                        <td className="px-4 py-3 text-slate-400">{row.productos}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-white">{format(row.stock)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-semibold text-slate-200">{row.producto}</td>
                        <td className="px-4 py-3 text-slate-400">{row.codigo}</td>
                        <td className="px-4 py-3 font-mono text-emerald-300">{format(row.entradas)}</td>
                        <td className="px-4 py-3 font-mono text-sky-300">{format(row.salidas)}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-white">{format(row.stock)}</td>
                        <td className="px-4 py-3 text-slate-400">{row.ultimo}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">No hay datos para los filtros seleccionados.</div>
        )}
      </div>
    </div>
  );
}
