'use client';

// ============================================================
// app/informes/page.js
// Sección Informes: generador de reportes gerenciales con filtros,
// gráficos de torta y exportación a Excel / PDF con encabezado
// y logo de GRUPO FALPAT SRL.
// Tipos de informe:
//  - Stock actual (entradas / salidas / diferencia por producto)
//  - Entradas / Salidas / Movimientos (con saldo por producto)
//  - Comparativo Entrada vs Salida
//  - Stock por planta
// ============================================================
import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useApp } from '@/context/AppContext';
import { COMPANY, LOGO_PATH } from '@/lib/company';
import { formatDate, formatDateTime, todayISO, toMillis, anioMes, descripcionPeriodo } from '@/lib/utils';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import FiltrosAplicados from '@/components/FiltrosAplicados';
import MultiSelect from '@/components/MultiSelect';
import {
  IconFilter,
  IconFileSpreadsheet,
  IconPrinter,
  IconPieChart,
} from '@/components/Icons';

const PIE_COLORS = [
  '#0891b2',
  '#f59e0b',
  '#0ea5e9',
  '#f97316',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#22d3ee',
  '#f43f5e',
];

const TIPOS = [
  { value: 'stock', label: 'Stock actual' },
  { value: 'entradas', label: 'Entradas' },
  { value: 'salidas', label: 'Salidas' },
  { value: 'movimientos', label: 'Movimientos' },
  { value: 'comparativo', label: 'Comparativo E/S' },
  { value: 'por-planta', label: 'Stock por planta' },
];

// Tipos que se leen como listado de movimientos (no agregan por producto).
const MOVIMIENTO_TIPOS = new Set(['entradas', 'salidas', 'movimientos']);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

// Separa un peso ("35.18 tn", "2.31 u") en número y unidad.
function pesoDetalle(value) {
  if (value == null) return { num: 0, unit: '' };
  const s = String(value).trim();
  const m = s.match(/^([\d.,]+)\s*([a-zA-Z]*)$/);
  if (!m) return { num: 0, unit: '' };
  const num = parseFloat(m[1].replace(',', '.'));
  return { num: Number.isFinite(num) ? num : 0, unit: m[2].toLowerCase() };
}

// Solo número en toneladas (ignora otras unidades para no mezclar).
function pesoTn(value) {
  const d = pesoDetalle(value);
  return d.unit === 'tn' ? d.num : 0;
}

function fmtNum(n, unit = '') {
  const v = Number.isFinite(n)
    ? n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  return unit ? `${v} ${unit}` : v;
}

// Texto seguro para PDF (fuentes WinAnsi de jsPDF).
function pdfSafe(v) {
  return String(v ?? '').replace(/—/g, '-').replace(/…/g, '...');
}

// Arma los segmentos del gráfico de torta (top N + "Otros").
function buildPie(items, valueOf, labelOf, unitOf, topN = 8) {
  const arr = items
    .map((it) => ({
      label: labelOf(it),
      value: Number(valueOf(it)) || 0,
      unit: unitOf ? unitOf(it) : '',
    }))
    .filter((d) => Math.abs(d.value) > 0.0001)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = arr.slice(0, topN);
  const rest = arr.slice(topN).reduce((s, d) => s + d.value, 0);
  const data = [...top];
  if (Math.abs(rest) > 0.0001) data.push({ label: 'Otros', value: rest, unit: top[0]?.unit || '' });
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return data.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length], pct: (d.value / total) * 100 }));
}

// Saldo acumulado (entradas - salidas) por producto, en el orden cronológico.
// Devuelve un mapa recordId -> { num, unit } con el saldo DESPUÉS de cada movimiento.
function buildSaldoMap(records) {
  const bal = new Map();
  const out = new Map();
  const sorted = [...records].sort((a, b) => (toMillis(a.fechaRemito) || 0) - (toMillis(b.fechaRemito) || 0));
  for (const r of sorted) {
    const { num, unit } = pesoDetalle(r.pesoBalanza);
    const key = `${r.codigoProducto || r.producto || 'SIN CÓDIGO'}§${unit}`;
    const cur = bal.get(key) || 0;
    const next = r.carga === 'Entrada' ? cur + num : cur - num;
    bal.set(key, next);
    out.set(r.id, { num: next, unit });
  }
  return out;
}

// Datos para el panel de VENTAS del período: agrupa por producto+unidad
// (no mezcla tn con kg) y separa por unidad para escalar las barras bien.
function buildVentas(stockRows) {
  const rows = stockRows.filter((r) => r.salidas > 0.0001);
  const units = [...new Set(rows.map((r) => r.unit))].sort();
  return units.map((unit) => {
    const items = rows
      .filter((r) => r.unit === unit)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.salidas - a.salidas);
    const total = items.reduce((s, r) => s + r.salidas, 0);
    const count = items.reduce((s, r) => s + r.countS, 0);
    const max = items[0]?.salidas || 1;
    return {
      unit,
      total,
      count,
      items: items.map((r) => ({
        ...r,
        pct: (r.salidas / total) * 100,
        bar: Math.max(2, (r.salidas / max) * 100),
      })),
    };
  });
}

// Renderiza el mismo donut de pantalla a un PNG (para el PDF).
// Se usa solo en el cliente, dentro del handler de exportación.
function donutToDataUrl(data, size = 190, thickness = 30, centerTop = '', centerBottom = '') {
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = (size - thickness) / 2;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = thickness;
  ctx.stroke();

  let start = -Math.PI / 2;
  for (const d of data) {
    const end = start + (d.pct / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c, c, r, start, end);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = thickness;
    ctx.stroke();
    start = end;
  }

  ctx.fillStyle = '#334155';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(centerTop, c, c - 2);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  ctx.fillText(centerBottom, c, c + 16);

  return canvas.toDataURL('image/png');
}

// "#0891b2" -> [8, 145, 178] (para fillColor de jsPDF).
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return [100, 116, 139];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ------------------------------------------------------------
// Gráfico de torta (donut) en SVG, sin dependencias.
// ------------------------------------------------------------
function DonutChart({ data, size = 190, thickness = 30, centerTop, centerBottom }) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-400"
        style={{ width: size, height: size }}
      >
        Sin datos
      </div>
    );
  }
  const r = (size - thickness) / 2;
  const c = size / 2;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        {data.map((d, i) => {
          const seg = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              pathLength={100}
              strokeDasharray={`${d.pct} ${100 - d.pct}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          offset += d.pct;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{centerTop}</span>
        <span className="font-mono text-lg font-bold text-slate-900">{centerBottom}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Página
// ------------------------------------------------------------
function PiePanel({ title, data, centerTop, centerBottom }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <div className="flex flex-col items-center gap-4">
        <DonutChart data={data} centerTop={centerTop} centerBottom={centerBottom} />
        <div className="w-full space-y-1.5">
          {data.length === 0 ? (
            <p className="py-2 text-center text-xs text-slate-400">Sin datos</p>
          ) : (
            data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate text-slate-700" title={d.label}>
                  {d.label}
                </span>
                <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-slate-900">
                  {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                </span>
                <span className="w-12 text-right font-mono tabular-nums text-slate-400">
                  {d.pct.toFixed(1)}%
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Panel de VENTAS del período: barras horizontales por producto+unidad.
// Se diferencia de los donuts para que no se confunda con Entradas/Salidas.
function VentasPanel({ data, total, totalMovs }) {
  return (
    <div className="border-t border-slate-200 px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <IconPieChart className="h-3.5 w-3.5 text-cyan-700" />
          Ventas del período
        </h3>
        <p className="text-xs text-slate-500">
          <strong className="font-mono text-base font-bold tabular-nums text-cyan-700">{fmtNum(total)}</strong>{' '}
          tn vendidas · <strong className="text-slate-700">{totalMovs}</strong> remitos
        </p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data.length === 0 ? (
          <p className="text-sm text-slate-400">No hay ventas para los filtros seleccionados.</p>
        ) : (
          data.map((g) => (
            <div key={g.unit} className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Unidad: {g.unit || '—'} · {fmtNum(g.total)} total
              </p>
              {g.items.map((it) => (
                <div key={`${it.codigo}§${it.unit}`} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={it.producto}>
                      {it.codigo} · {it.producto}
                    </span>
                    <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-slate-900">
                      {fmtNum(it.salidas, it.unit)}
                    </span>
                    <span className="w-11 text-right font-mono tabular-nums text-slate-400">
                      {it.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-teal-500"
                      style={{ width: `${it.bar}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Informes() {

  const { records, loading, error, showToast } = useApp();
  const [tipo, setTipo] = useState('stock');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [productosSel, setProductosSel] = useState([]);
  const [planta, setPlanta] = useState('');
  const [contraparte, setContraparte] = useState('');

  // Opciones de los filtros (valores únicos de la cache local).
  const prodOptions = useMemo(
    () =>
      [...new Set(records.map((r) => r.codigoProducto).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      ),
    [records]
  );
  const plantaOptions = useMemo(
    () =>
      [...new Set(records.map((r) => r.planta).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      ),
    [records]
  );
  const contraparteOptions = useMemo(() => {
    const set = new Set();
    for (const r of records) {
      if (r.proveedor) set.add(r.proveedor);
      if (r.cliente) set.add(r.cliente);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [records]);

  const anios = useMemo(
    () =>
      [...new Set(records.map((r) => anioMes(r.fechaRemito)?.anio).filter(Boolean))].sort(
        (a, b) => b - a
      ),
    [records]
  );

  // Base respetando producto/planta/contraparte y período (mes/año + desde/hasta).
  const baseRecords = useMemo(() => {
    let arr = records;
    if (productosSel.length > 0) {
      arr = arr.filter(
        (r) => productosSel.includes(r.codigoProducto) || productosSel.includes(r.producto)
      );
    }
    if (planta) arr = arr.filter((r) => r.planta === planta);
    if (contraparte) arr = arr.filter((r) => r.proveedor === contraparte || r.cliente === contraparte);
    if (anio || mes) {
      arr = arr.filter((r) => {
        const ym = anioMes(r.fechaRemito);
        if (!ym) return false;
        if (anio && ym.anio !== Number(anio)) return false;
        if (mes && ym.mes !== Number(mes)) return false;
        return true;
      });
    }
    if (desde) {
      const min = toMillis(desde);
      arr = arr.filter((r) => (toMillis(r.fechaRemito) || 0) >= min);
    }
    if (hasta) {
      const end = new Date(hasta);
      end.setHours(23, 59, 59, 999);
      const max = end.getTime();
      arr = arr.filter((r) => (toMillis(r.fechaRemito) || 0) <= max);
    }
    return arr;
  }, [records, productosSel, planta, contraparte, desde, hasta, mes, anio]);

  // Saldo histórico por producto (usado como columna "Saldo").
  const saldoMap = useMemo(() => buildSaldoMap(records), [records]);

  // ----- Stock: agrega entradas/salidas por producto+unidad -----
  const stockRows = useMemo(() => {
    const map = new Map();
    for (const r of baseRecords) {
      const { num, unit } = pesoDetalle(r.pesoBalanza);
      const key = `${r.codigoProducto || r.producto || 'SIN CÓDIGO'}§${unit}`;
      if (!map.has(key)) {
        map.set(key, {
          codigo: r.codigoProducto || '—',
          producto: r.producto || '—',
          unit: unit || '—',
          entradas: 0,
          salidas: 0,
          countE: 0,
          countS: 0,
          count: 0,
        });
      }
      const it = map.get(key);
      it.count += 1;
      if (r.carga === 'Entrada') {
        it.entradas += num;
        it.countE += 1;
      } else {
        it.salidas += num;
        it.countS += 1;
      }
    }
    return [...map.values()]
      .map((it) => ({ ...it, stock: it.entradas - it.salidas }))
      .sort((a, b) => Math.abs(b.stock) - Math.abs(a.stock));
  }, [baseRecords]);

  // ----- Comparativo: igual que stock + % salido -----
  const comparativoRows = useMemo(
    () =>
      stockRows.map((r) => ({
        ...r,
        pctSalido: r.entradas > 0.0001 ? (r.salidas / r.entradas) * 100 : null,
      })),
    [stockRows]
  );

  // ----- Stock por planta -----
  const plantaRows = useMemo(() => {
    const map = new Map();
    for (const r of baseRecords) {
      const p = r.planta || 'Sin planta';
      if (!map.has(p)) {
        map.set(p, { planta: p, entradas: 0, salidas: 0, stock: 0, productos: new Set(), movs: 0 });
      }
      const it = map.get(p);
      it.movs += 1;
      it.productos.add(r.codigoProducto || r.producto || '—');
      const tn = pesoTn(r.pesoBalanza);
      if (r.carga === 'Entrada') it.entradas += tn;
      else it.salidas += tn;
    }
    return [...map.values()]
      .map((it) => ({ ...it, stock: it.entradas - it.salidas, nProductos: it.productos.size }))
      .sort((a, b) => b.stock - a.stock);
  }, [baseRecords]);

  // ----- Movimientos (entradas / salidas / todos) -----
  const movRows = useMemo(() => {
    if (!MOVIMIENTO_TIPOS.has(tipo)) return [];
    let arr = baseRecords;
    if (tipo === 'entradas') arr = arr.filter((r) => r.carga === 'Entrada');
    if (tipo === 'salidas') arr = arr.filter((r) => r.carga === 'Salida');
    return arr
      .map((r) => ({ ...r, saldo: saldoMap.get(r.id) }))
      .sort((a, b) => (toMillis(a.fechaRemito) || 0) - (toMillis(b.fechaRemito) || 0));
  }, [baseRecords, tipo, saldoMap]);

  // ----- Totales -----
  const totals = useMemo(() => {
    if (tipo === 'stock' || tipo === 'comparativo') {
      const tnRows = stockRows.filter((r) => r.unit === 'tn');
      const entradas = tnRows.reduce((s, r) => s + r.entradas, 0);
      const salidas = tnRows.reduce((s, r) => s + r.salidas, 0);
      const stock = tnRows.reduce((s, r) => s + r.stock, 0);
      const totalMovs = stockRows.reduce((s, r) => s + r.count, 0);
      const entradasMovs = tnRows.reduce((s, r) => s + r.countE, 0);
      const salidasMovs = tnRows.reduce((s, r) => s + r.countS, 0);
      const promedioEntrada = entradasMovs > 0 ? entradas / entradasMovs : 0;
      const promedioSalida = salidasMovs > 0 ? salidas / salidasMovs : 0;
      const promedioMov =
        entradasMovs + salidasMovs > 0 ? (entradas + salidas) / (entradasMovs + salidasMovs) : 0;
      return {
        count: stockRows.length,
        totalMovs,
        entradas,
        salidas,
        ventas: salidas,
        stock,
        entradasMovs,
        salidasMovs,
        ventasMovs: salidasMovs,
        promedioEntrada,
        promedioSalida,
        promedioVenta: promedioSalida,
        promedioMov,
      };
    }
    if (tipo === 'por-planta') {
      return {
        count: plantaRows.length,
        entradas: plantaRows.reduce((s, r) => s + r.entradas, 0),
        salidas: plantaRows.reduce((s, r) => s + r.salidas, 0),
        stock: plantaRows.reduce((s, r) => s + r.stock, 0),
        totalMovs: plantaRows.reduce((s, r) => s + r.movs, 0),
      };
    }
    const tn = movRows.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    return { count: movRows.length, tn };
  }, [tipo, stockRows, plantaRows, movRows]);

  // ----- Datos del gráfico de torta -----
  const pieData = useMemo(() => {
    if (tipo === 'stock') {
      return buildPie(
        stockRows.filter((r) => r.stock > 0.0001),
        (r) => r.stock,
        (r) => `${r.codigo} · ${r.producto}`,
        (r) => r.unit
      );
    }
    if (tipo === 'comparativo') {
      return buildPie(
        comparativoRows.filter((r) => r.stock > 0.0001),
        (r) => r.stock,
        (r) => `${r.codigo} · ${r.producto}`,
        (r) => r.unit
      );
    }
    if (tipo === 'por-planta') {
      return buildPie(
        plantaRows.filter((r) => r.stock > 0.0001),
        (r) => r.stock,
        (r) => r.planta,
        () => 'tn'
      );
    }
    return buildPie(
      movRows,
      (r) => pesoTn(r.pesoBalanza),
      (r) => `${r.codigoProducto || '—'} · ${r.producto || '—'}`,
      () => 'tn'
    );
  }, [tipo, stockRows, comparativoRows, plantaRows, movRows]);

  // ----- Gráficos separados: Entradas, Salidas y Ventas -----
  const pieLabel = (r) => `${r.codigo} · ${r.producto}`;
  const pieEntradas = useMemo(
    () => buildPie(stockRows.filter((r) => r.entradas > 0.0001), (r) => r.entradas, pieLabel, (r) => r.unit),
    [stockRows]
  );
  const pieSalidas = useMemo(
    () => buildPie(stockRows.filter((r) => r.salidas > 0.0001), (r) => r.salidas, pieLabel, (r) => r.unit),
    [stockRows]
  );
  // Ventas del período = salidas (cada salida es una venta a cliente), agrupadas por unidad.
  const ventasData = useMemo(() => buildVentas(stockRows), [stockRows]);

  // ----- Etiquetas del informe -----
  const reportTitle = TIPOS.find((t) => t.value === tipo)?.label || 'Informe';
  const esMovimiento = MOVIMIENTO_TIPOS.has(tipo);

  const donutCenterTop =
    tipo === 'por-planta' ? 'Stock (tn)' : esMovimiento ? 'Total (tn)' : 'Diferencia (tn)';
  const donutCenterBottom =
    tipo === 'por-planta'
      ? fmtNum(totals.stock)
      : esMovimiento
        ? fmtNum(totals.tn)
        : fmtNum(totals.stock);
  const periodoLabel = useMemo(() => {
    if (mes || anio || desde || hasta) {
      return `Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`;
    }
    return 'Período: todo el historial';
  }, [mes, anio, desde, hasta]);
  const filterLabel = useMemo(() => {
    const parts = [periodoLabel];
    if (productosSel.length > 0) parts.push(`Producto: ${productosSel.join(', ')}`);
    if (planta) parts.push(`Planta: ${planta}`);
    if (contraparte) parts.push(`Origen/Destino: ${contraparte}`);
    return parts.join('  ·  ');
  }, [periodoLabel, productosSel, planta, contraparte]);

  const filtrosAplicados = useMemo(() => {
    const items = [];
    if (mes || anio || desde || hasta) items.push(`Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`);
    if (productosSel.length > 0) items.push(`Producto: ${productosSel.join(', ')}`);
    if (planta) items.push(`Planta: ${planta}`);
    if (contraparte) items.push(`Origen/Destino: ${contraparte}`);
    return items;
  }, [mes, anio, desde, hasta, productosSel, planta, contraparte]);

  function clearFilters() {
    setProductosSel([]);
    setPlanta('');
    setContraparte('');
    setDesde('');
    setHasta('');
    setMes('');
    setAnio('');
  }

  // ==========================================================
  // Tablas (head / rows / foot) compartidas entre pantalla, Excel y PDF
  // ==========================================================
  const tableData = useMemo(() => {
    if (tipo === 'stock') {
      return {
        head: ['Producto', 'Código', 'Unidad', 'Entradas', 'Salidas', 'Diferencia (Stock)', 'Movimientos'],
        rows: stockRows.map((r) => [
          r.producto,
          r.codigo,
          r.unit,
          fmtNum(r.entradas),
          fmtNum(r.salidas),
          fmtNum(r.stock),
          r.count,
        ]),
        foot: [
          { text: 'Total (tn)', colSpan: 3 },
          { text: fmtNum(totals.entradas) },
          { text: fmtNum(totals.salidas) },
          { text: fmtNum(totals.stock) },
          { text: String(totals.totalMovs) },
        ],
      };
    }
    if (tipo === 'comparativo') {
      return {
        head: ['Producto', 'Código', 'Unidad', 'Entradas', 'Salidas', 'Diferencia', '% Salido', 'Movimientos'],
        rows: comparativoRows.map((r) => [
          r.producto,
          r.codigo,
          r.unit,
          fmtNum(r.entradas),
          fmtNum(r.salidas),
          fmtNum(r.stock),
          r.pctSalido == null ? '—' : `${r.pctSalido.toFixed(1)}%`,
          r.count,
        ]),
        foot: [
          { text: 'Total (tn)', colSpan: 3 },
          { text: fmtNum(totals.entradas) },
          { text: fmtNum(totals.salidas) },
          { text: fmtNum(totals.stock) },
          { text: '' },
          { text: String(totals.totalMovs) },
        ],
      };
    }
    if (tipo === 'por-planta') {
      return {
        head: ['Planta', 'Productos', 'Entradas (tn)', 'Salidas (tn)', 'Stock (tn)', 'Movimientos'],
        rows: plantaRows.map((r) => [
          r.planta,
          r.nProductos,
          fmtNum(r.entradas),
          fmtNum(r.salidas),
          fmtNum(r.stock),
          r.movs,
        ]),
        foot: [
          { text: 'Total', colSpan: 2 },
          { text: fmtNum(totals.entradas) },
          { text: fmtNum(totals.salidas) },
          { text: fmtNum(totals.stock) },
          { text: String(totals.totalMovs) },
        ],
      };
    }
    // Movimientos / Entradas / Salidas
    const head = esMovimiento && tipo === 'movimientos'
      ? ['Fecha', 'Tipo', 'Producto', 'Código', 'Remito', 'Proveedor/Cliente', 'Patente', 'Chofer', 'Peso', 'Saldo', 'Planta']
      : ['Fecha', 'Producto', 'Código', 'Remito', tipo === 'entradas' ? 'Proveedor' : 'Cliente', 'Patente', 'Chofer', 'Peso', 'Saldo', 'Planta'];
    const rows = movRows.map((r) => {
      const saldo = r.saldo ? `${fmtNum(r.saldo.num)} ${r.saldo.unit}` : '—';
      const base = [
        formatDate(r.fechaRemito),
        r.producto || '—',
        r.codigoProducto || '—',
        r.nroRemitoFalpat || r.nroRemitoProveedor || '—',
        tipo === 'entradas' ? r.proveedor || '—' : r.cliente || '—',
        r.patente || '—',
        r.chofer || '—',
        r.pesoBalanza || '—',
        saldo,
        r.planta || '—',
      ];
      return tipo === 'movimientos' ? [base[0], r.carga, ...base.slice(1)] : base;
    });
    const foot = [
      { text: `Total: ${totals.count} movimientos · ${fmtNum(totals.tn)} tn`, colSpan: 9 },
    ];
    return { head, rows, foot };
  }, [tipo, stockRows, comparativoRows, plantaRows, movRows, totals, esMovimiento]);

  // ==========================================================
  // Exportación a Excel (.xlsx)
  // ==========================================================
  async function handleExportExcel() {
    try {
      const XLSX = await import('xlsx');
      const nCols = tableData.head.length;
      const aoa = [];
      const hoy = formatDateTime(new Date());

      aoa.push([COMPANY.name]);
      aoa.push([COMPANY.tagline]);
      aoa.push([]);
      aoa.push([`INFORME DE ${reportTitle.toUpperCase()}`]);
      aoa.push([periodoLabel]);
      aoa.push([`Generado: ${hoy}`]);
      aoa.push([`Filtros: ${filterLabel}`]);
      aoa.push([]);
      aoa.push(tableData.head);
      for (const row of tableData.rows) aoa.push(row.map((c) => pdfSafe(c)));
      aoa.push([]);
      aoa.push(tableData.foot.map((f) => pdfSafe(f.text)));

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = Array.from({ length: nCols }, () => ({ wch: 18 }));
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: nCols - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: nCols - 1 } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: nCols - 1 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: nCols - 1 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31));
      XLSX.writeFile(wb, `Informe_${reportTitle.replace(/\s+/g, '')}_${todayISO()}.xlsx`);
      showToast('Informe exportado a Excel');
    } catch (e) {
      showToast(`Error al exportar Excel: ${e.message}`, 'error');
    }
  }

  // ==========================================================
  // Exportación a PDF (.pdf)
  // ==========================================================
  let logoCache = null;
  async function getLogoDataUrl() {
    if (logoCache !== null) return logoCache;
    try {
      const res = await fetch(LOGO_PATH);
      const blob = await res.blob();
      logoCache = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onloadend = () => resolve(fr.result);
        fr.readAsDataURL(blob);
      });
    } catch {
      logoCache = null;
    }
    return logoCache;
  }

  async function handleExportPDF() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const logo = await getLogoDataUrl();
      const landscape = tableData.head.length >= 8;
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;

      // --- Encabezado: logo + empresa + título ---
      if (logo) doc.addImage(logo, 'PNG', margin, margin, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(COMPANY.name), margin + 24, margin + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(COMPANY.tagline), margin + 24, margin + 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(8, 145, 178);
      doc.text(pdfSafe(`INFORME DE ${reportTitle.toUpperCase()}`), pageW - margin, margin + 9, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafe(periodoLabel), pageW - margin, margin + 14, { align: 'right' });
      doc.text(pdfSafe(`Generado: ${formatDateTime(new Date())}`), pageW - margin, margin + 18, { align: 'right' });
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, margin + 24, pageW - margin, margin + 24);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(pdfSafe(`Filtros: ${filterLabel}`), margin, margin + 28);

      // --- Gráficos + leyendas (igual que en pantalla) ---
      let tableStartY = margin + 32;
      if (tipo === 'stock' || tipo === 'comparativo') {
        const panels = [
          { title: 'Entradas', data: pieEntradas, centerBottom: fmtNum(totals.entradas) },
          { title: 'Salidas', data: pieSalidas, centerBottom: fmtNum(totals.salidas) },
        ];
        const usable = pageW - margin * 2;
        const gap = 6;
        const colW = (usable - gap) / 2;
        const chartSize = Math.min(colW * 0.62, 44);
        const chartY = margin + 32;
        let maxBottom = chartY;
        panels.forEach((p, idx) => {
          const x = margin + idx * (colW + gap);
          const chartX = x + (colW - chartSize) / 2;
          if (p.data.length) {
            const img = donutToDataUrl(p.data, 190, 30, p.title, p.centerBottom);
            doc.addImage(img, 'PNG', chartX, chartY, chartSize, chartSize);
          }
          const items = p.data.slice(0, 7);
          const legendY = chartY + chartSize + 4;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(p.title.toUpperCase()), x, legendY);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          let ly = legendY + 4.5;
          for (const d of items) {
            const val = `${d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
            const label = `${d.label} — ${val}`;
            doc.setFillColor(...hexToRgb(d.color));
            doc.rect(x, ly - 1.1, 2, 2, 'F');
            const lines = doc.splitTextToSize(pdfSafe(label), colW - 4);
            doc.text(lines, x + 3, ly + 0.7);
            ly += Math.max(4.2, lines.length * 4.2);
          }
          if (p.data.length > items.length) {
            doc.setTextColor(148, 163, 184);
            doc.text(pdfSafe(`+ ${p.data.length - items.length} más`), x, ly + 0.7);
            ly += 4.2;
          }
          maxBottom = Math.max(maxBottom, ly);
        });

        // --- Ventas del período (barras horizontales) ---
        const ventasY = maxBottom + 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(8, 145, 178);
        doc.text(pdfSafe('VENTAS DEL PERÍODO'), margin, ventasY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(
          pdfSafe(`${fmtNum(totals.ventas)} tn vendidas · ${totals.ventasMovs} remitos`),
          pageW - margin,
          ventasY,
          { align: 'right' }
        );
        const barX = margin + 78;
        const barMaxW = pageW - margin - barX - 26;
        let by = ventasY + 6;
        for (const g of ventasData) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(148, 163, 184);
          doc.text(pdfSafe(`Unidad: ${g.unit || '—'} · ${fmtNum(g.total)} total`), margin, by);
          by += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          for (const it of g.items.slice(0, 10)) {
            const labelLines = doc.splitTextToSize(pdfSafe(`${it.codigo} · ${it.producto}`), barX - margin - 2);
            doc.setTextColor(51, 65, 85);
            doc.text(labelLines, margin, by + 1.5);
            doc.setFillColor(226, 232, 240);
            doc.rect(barX, by - 1, barMaxW, 3, 'F');
            doc.setFillColor(8, 145, 178);
            doc.rect(barX, by - 1, Math.max(1.5, (it.bar / 100) * barMaxW), 3, 'F');
            doc.setTextColor(51, 65, 85);
            doc.text(
              pdfSafe(`${fmtNum(it.salidas, it.unit)} (${it.pct.toFixed(1)}%)`),
              pageW - margin,
              by + 1.5,
              { align: 'right' }
            );
            by += Math.max(6.5, labelLines.length * 4.5);
          }
          by += 3;
        }
        tableStartY = by + 3;
      } else if (pieData.length > 0) {
        const chartSize = landscape ? 46 : 42;
        const chartY = margin + 32;
        const img = donutToDataUrl(pieData, 190, 30, donutCenterTop, donutCenterBottom);
        doc.addImage(img, 'PNG', margin, chartY, chartSize, chartSize);

        const legendX = margin + chartSize + 7;
        const legendMax = pageW - margin - legendX;
        const lineH = 5.2;
        const items = pieData.slice(0, 9);
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        let ly = chartY + 3;
        for (const d of items) {
          const label = `${d.label} — ${d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
          doc.setFillColor(...hexToRgb(d.color));
          doc.rect(legendX, ly - 1.2, 2.2, 2.2, 'F');
          const lines = doc.splitTextToSize(pdfSafe(label), legendMax);
          doc.text(lines, legendX + 3.5, ly + 0.8);
          ly += Math.max(lineH, lines.length * lineH);
        }
        tableStartY = chartY + Math.max(chartSize, ly - chartY) + 7;
      }

      autoTable(doc, {
        startY: tableStartY,
        head: [tableData.head.map(pdfSafe)],
        body: tableData.rows.map((row) => row.map((c) => pdfSafe(c))),
        foot: [tableData.foot.map((f) => pdfSafe(f.text))],
        theme: 'grid',
        styles: { fontSize: landscape ? 7.5 : 8.5, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
        headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: tableStartY, right: margin, bottom: 16, left: margin },
      });

      // --- Pie de página con numeración ---
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(pdfSafe(`${COMPANY.name} · ${reportTitle}`), margin, pageH - 7);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 7, { align: 'right' });
      }

      doc.save(`Informe_${reportTitle.replace(/\s+/g, '')}_${todayISO()}.pdf`);
      showToast('Informe exportado a PDF');
    } catch (e) {
      showToast(`Error al exportar PDF: ${e.message}`, 'error');
    }
  }

  // ==========================================================
  // Render
  // ==========================================================
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="card h-40 animate-pulse" />
        <div className="h-[480px] animate-pulse rounded-2xl bg-white/[0.05]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card mx-auto max-w-2xl border-red-500/30 p-8 text-center">
        <p className="text-sm text-slate-300">Error al leer los datos: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Encabezado de página */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-sub mb-1">Reportes gerenciales con encabezado de empresa</p>
          <h1 className="section-title !text-2xl">Informes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleExportExcel} className="btn-ghost" title="Descargar informe en Excel">
            <IconFileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button type="button" onClick={handleExportPDF} className="btn-primary" title="Descargar informe en PDF">
            <IconPrinter className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconFilter className="h-4 w-4 text-falpat" />
            <h2 className="section-title !text-base">Filtros del informe</h2>
          </div>
          <FiltrosAplicados
            items={filtrosAplicados}
            onLimpiar={filtrosAplicados.length ? clearFilters : undefined}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo de informe</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="field">
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value} className="bg-night-900">
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Productos</span>
            <MultiSelect
              options={prodOptions}
              value={productosSel}
              onChange={setProductosSel}
              placeholder="Todos los productos"
              searchPlaceholder="Buscar producto…"
              itemLabel="productos"
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Planta</span>
            <select value={planta} onChange={(e) => setPlanta(e.target.value)} className="field">
              <option value="" className="bg-night-900">Todas</option>
              {plantaOptions.map((p) => (
                <option key={p} value={p} className="bg-night-900">
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Proveedor / Cliente</span>
            <select value={contraparte} onChange={(e) => setContraparte(e.target.value)} className="field">
              <option value="" className="bg-night-900">Todos</option>
              {contraparteOptions.map((c) => (
                <option key={c} value={c} className="bg-night-900">
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Período: Mes + Año (principal) y Desde/Hasta (detalle secundario) */}
        <div className="border-t border-white/10 pt-4">
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
      </div>

      {/* ===== Informe (papel) ===== */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl">
        {/* Encabezado de empresa */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Image src={LOGO_PATH} alt="Logo GRUPO FALPAT SRL" width={64} height={64} className="h-14 w-14 object-contain" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-900">{COMPANY.name}</h2>
              <p className="text-xs font-medium text-slate-500">{COMPANY.tagline}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {[COMPANY.address, COMPANY.phone, COMPANY.email, COMPANY.cuit, COMPANY.web].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-base font-extrabold uppercase tracking-wide text-cyan-700">Informe de {reportTitle}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{periodoLabel}</p>
            <p className="text-[11px] text-slate-400">Generado: {formatDateTime(new Date())}</p>
          </div>
        </div>

        {/* Filtros aplicados */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-[11px] font-medium text-slate-500">
          Filtros aplicados: {filterLabel}
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-6 py-5 sm:grid-cols-4">
          {tipo === 'stock' || tipo === 'comparativo' ? (
            <>
              <ResumenChip label="Productos" value={String(totals.count)} />
              <ResumenChip label="Entradas (tn)" value={fmtNum(totals.entradas)} />
              <ResumenChip label="Salidas (tn)" value={fmtNum(totals.salidas)} />
              <ResumenChip label="Ventas (tn)" value={fmtNum(totals.ventas)} accent />
            </>
          ) : tipo === 'por-planta' ? (
            <>
              <ResumenChip label="Plantas" value={String(totals.count)} />
              <ResumenChip label="Entradas (tn)" value={fmtNum(totals.entradas)} />
              <ResumenChip label="Salidas (tn)" value={fmtNum(totals.salidas)} />
              <ResumenChip label="Stock (tn)" value={fmtNum(totals.stock)} accent />
            </>
          ) : (
            <>
              <ResumenChip label={tipo === 'movimientos' ? 'Movimientos' : reportTitle} value={String(totals.count)} />
              <ResumenChip label="Total (tn)" value={fmtNum(totals.tn)} accent />
              <ResumenChip label="Planta" value={planta || 'Todas'} />
              <ResumenChip label="Periodo" value={descripcionPeriodo(mes, anio, desde, hasta)} />
            </>
          )}
        </div>

        {(tipo === 'stock' || tipo === 'comparativo') && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-slate-200 bg-slate-50/60 px-6 py-2.5 text-[11px] text-slate-500">
            <span>
              <strong className="text-slate-700">{totals.totalMovs}</strong> movimientos
            </span>
            <span>
              <strong className="text-emerald-700">{totals.entradasMovs}</strong> entradas
            </span>
            <span>
              <strong className="text-rose-700">{totals.salidasMovs}</strong> salidas
            </span>
            <span>
              <strong className="text-cyan-700">{totals.ventasMovs}</strong> ventas
            </span>
            <span>
              Prom. entrada <strong className="text-slate-700">{fmtNum(totals.promedioEntrada)} tn</strong>
            </span>
            <span>
              Prom. venta <strong className="text-slate-700">{fmtNum(totals.promedioVenta)} tn</strong>
            </span>
          </div>
        )}

        {/* Gráficos: Entradas / Salidas (donut) + Ventas (barras) */}
        {tipo === 'stock' || tipo === 'comparativo' ? (
          <>
            <div className="grid grid-cols-1 gap-6 px-6 py-6 md:grid-cols-2">
              <PiePanel
                title="Entradas"
                data={pieEntradas}
                centerTop="Entradas"
                centerBottom={fmtNum(totals.entradas)}
              />
              <PiePanel
                title="Salidas"
                data={pieSalidas}
                centerTop="Salidas"
                centerBottom={fmtNum(totals.salidas)}
              />
            </div>
            <VentasPanel data={ventasData} total={totals.ventas} totalMovs={totals.ventasMovs} />
          </>
        ) : (
          <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center">
            <div className="flex flex-col items-center gap-3">
              <DonutChart data={pieData} centerTop={donutCenterTop} centerBottom={donutCenterBottom} />
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <IconPieChart className="h-3.5 w-3.5" />
                {tipo === 'por-planta' ? 'Distribución por planta' : 'Distribución por producto'}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {pieData.length === 0 ? (
                <p className="text-sm text-slate-400">No hay datos suficientes para el gráfico.</p>
              ) : (
                pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={d.label}>
                      {d.label}
                    </span>
                    <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                    </span>
                    <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-400">{d.pct.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tabla del detalle */}
        <div className="border-t border-slate-200">
          <ReportTable data={tableData} />
        </div>

        {/* Pie del informe */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500">
          <span>Documento generado automáticamente por el Sistema de Control de Stock.</span>
          <span className="font-semibold uppercase tracking-wider text-slate-400">{COMPANY.name}</span>
        </div>
      </div>
    </div>
  );
}

function ResumenChip({ label, value, accent = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <div className={`font-mono text-lg font-bold tabular-nums ${accent ? 'text-cyan-700' : 'text-slate-900'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function ReportTable({ data }) {
  const { head, rows, foot } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth: head.length * 110 }}>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-center text-sm text-slate-400">
                Sin datos para los filtros seleccionados.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`whitespace-nowrap px-4 py-2 text-xs ${j === 0 ? 'font-semibold text-slate-800' : 'text-slate-700'}`}
                    title={typeof c === 'string' ? c : undefined}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-100">
              {foot.map((f, i) => (
                <td
                  key={i}
                  colSpan={f.colSpan || 1}
                  className="whitespace-nowrap px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  {f.text}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
