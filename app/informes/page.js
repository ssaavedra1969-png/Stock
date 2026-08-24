'use client';

// ============================================================
// app/informes/page.js
// Sección Informes: generador de reportes gerenciales con filtros,
// gráficos de torta y exportación a Excel / PDF con encabezado
// y logo de GRUPO FALPAT SRL.
// Tipos de informe:
//  - INFORME GENERAL (gerencial, 5 secciones):
//      01 Ventas (salidas del período) · 02 Entradas del período ·
//      03 Stock a la fecha por material (acumulado histórico) ·
//      04 Evolución mensual 12 meses · 05 Alertas de stock
//  - Entradas / Salidas / Movimientos (detalle operativo, con saldo)
//  - Stock por planta
// ============================================================
import { useMemo, useState, useId } from 'react';
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
  { value: 'general', label: 'Informe General' },
  { value: 'entradas', label: 'Entradas' },
  { value: 'salidas', label: 'Salidas' },
  { value: 'movimientos', label: 'Movimientos' },
  { value: 'por-planta', label: 'Stock por planta' },
];

// Abreviaturas de mes para el gráfico de evolución.
const MES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Colores de acento por sección del Informe General (hex + rgb para PDF).
const SECCION_COLORS = {
  ventas: { hex: '#0891b2', rgb: [8, 145, 178] },
  entradas: { hex: '#059669', rgb: [5, 150, 105] },
  stock: { hex: '#7c3aed', rgb: [124, 58, 237] },
  evolucion: { hex: '#0ea5e9', rgb: [14, 165, 233] },
  alertas: { hex: '#e11d48', rgb: [225, 29, 72] },
};

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

// Acumulado histórico por producto+unidad sobre TODOS los registros:
// devuelve un mapa clave -> { e, s } con el total de entradas y salidas de toda la base.
function buildAcumuladoMap(records) {
  const out = new Map();
  for (const r of records) {
    const { num, unit } = pesoDetalle(r.pesoBalanza);
    const key = `${r.codigoProducto || r.producto || 'SIN CÓDIGO'}§${unit}`;
    if (!out.has(key)) out.set(key, { e: 0, s: 0 });
    const it = out.get(key);
    if (r.carga === 'Entrada') it.e += num;
    else it.s += num;
  }
  return out;
}

// Renderiza el donut de pantalla a un PNG (para el PDF).
// Con profundidad: sombra proyectada, gradiente radial por segmento
// (relieve), separadores blancos y texto con leve emboss.
// Se usa solo en el cliente, dentro del handler de exportación.
function donutToDataUrl(data, size = 190, thickness = 30, centerTop = '', centerBottom = '') {
  const canvas = document.createElement('canvas');
  const dpr = 3;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const pad = 7; // margen para la sombra
  const thicknessAdj = Math.min(thickness, (size - pad * 2) / 2);
  const r = (size - thicknessAdj - pad * 1.4) / 2;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  // Sombra proyectada del anillo completo.
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.32)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 4.5;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = thicknessAdj;
  ctx.stroke();
  ctx.restore();

  // Segmentos con color pleno + capa de relieve (gradiente radial).
  const grad = ctx.createRadialGradient(c, c, r - thicknessAdj / 2, c, c, r + thicknessAdj / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(0.68, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.26)');

  let start = -Math.PI / 2;
  const boundaries = [];
  for (const d of data) {
    const sweep = (d.pct / 100) * Math.PI * 2;
    const end = start + sweep;
    ctx.beginPath();
    ctx.arc(c, c, r, start, end);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = thicknessAdj;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, r, start, end);
    ctx.strokeStyle = grad;
    ctx.stroke();
    boundaries.push(start);
    start = end;
  }

  // Separadores blancos entre segmentos.
  for (const a of boundaries) {
    ctx.beginPath();
    ctx.arc(c, c, r, a - 0.009, a + 0.009);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Separador final (cierre del anillo).
  if (boundaries.length > 1) {
    ctx.beginPath();
    ctx.arc(c, c, r, start - 0.009, start + 0.009);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Texto central con leve emboss.
  ctx.textAlign = 'center';
  if (centerTop) {
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15,23,42,0.18)';
    ctx.fillText(centerTop, c, c - 1.3);
    ctx.fillStyle = '#64748b';
    ctx.fillText(centerTop, c, c - 2);
  }
  if (centerBottom) {
    ctx.font = '700 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15,23,42,0.16)';
    ctx.fillText(centerBottom, c, c + 17.3);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(centerBottom, c, c + 16.6);
  }

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
// Con profundidad: sombra proyectada, gradiente radial por
// segmento (relieve) y bordes redondeados.
// ------------------------------------------------------------
function DonutChart({ data, size = 190, thickness = 30, centerTop, centerBottom, dark = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!data.length) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-dashed text-sm ${
          dark ? 'border-white/15 text-slate-500' : 'border-slate-300 text-slate-400'
        }`}
        style={{ width: size, height: size }}
      >
        Sin datos
      </div>
    );
  }
  const r = (size - thickness) / 2 - 3;
  const c = size / 2;
  const rInner = r - thickness / 2;
  const rOuter = r + thickness / 2;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <filter id={`ds-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#000000" floodOpacity={dark ? 0.55 : 0.3} />
          </filter>
          {data.map((d, i) => (
            <radialGradient
              key={i}
              id={`dg-${uid}-${i}`}
              gradientUnits="userSpaceOnUse"
              cx={c}
              cy={c}
              r={rOuter}
            >
              <stop offset={`${((rInner / rOuter) * 100).toFixed(1)}%`} stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="68%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
            </radialGradient>
          ))}
        </defs>
        <g filter={`url(#ds-${uid})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : '#eef2f7'} strokeWidth={thickness} />
          {data.map((d, i) => {
            const shown = Math.max(d.pct - 1.6, 0.7);
            const dash = `${shown} ${100 - shown}`;
            const dashOffset = -(offset + Math.max((d.pct - shown) / 2, 0));
            const seg = (
              <g key={i}>
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={thickness}
                  pathLength={100}
                  strokeDasharray={dash}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${c} ${c})`}
                />
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={`url(#dg-${uid}-${i})`}
                  strokeWidth={thickness}
                  pathLength={100}
                  strokeDasharray={dash}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${c} ${c})`}
                />
              </g>
            );
            offset += d.pct;
            return seg;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{centerTop}</span>
        <span className={`font-mono text-lg font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{centerBottom}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Página
// ------------------------------------------------------------
function PiePanel({ title, data, centerTop, centerBottom, dark = false }) {
  return (
    <div
      className={
        dark
          ? 'flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur'
          : 'flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-[0_14px_34px_-18px_rgba(2,6,23,0.35)]'
      }
    >
      <h3
        className={`mb-3 text-center text-[11px] font-bold uppercase tracking-wider ${
          dark ? 'font-mono text-slate-400' : 'text-slate-500'
        }`}
      >
        {title}
      </h3>
      <div className="flex flex-col items-center gap-4">
        <DonutChart data={data} centerTop={centerTop} centerBottom={centerBottom} dark={dark} />
        <div className="w-full space-y-1.5">
          {data.length === 0 ? (
            <p className={`py-2 text-center text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Sin datos</p>
          ) : (
            data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className={`min-w-0 flex-1 truncate ${dark ? 'text-slate-300' : 'text-slate-700'}`} title={d.label}>
                  {d.label}
                </span>
                <span className={`whitespace-nowrap font-mono font-semibold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>
                  {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                </span>
                <span className="w-12 text-right font-mono tabular-nums text-slate-500">
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

export default function Informes() {

  const { records, loading, error, showToast } = useApp();
  const [tipo, setTipo] = useState('general');
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

  // Base SIN filtros de fecha (solo producto/planta/contraparte): usada por el
  // stock a la fecha y la evolución mensual del Informe General.
  const baseSinFechas = useMemo(() => {
    let arr = records;
    if (productosSel.length > 0) {
      arr = arr.filter(
        (r) => productosSel.includes(r.codigoProducto) || productosSel.includes(r.producto)
      );
    }
    if (planta) arr = arr.filter((r) => r.planta === planta);
    if (contraparte) arr = arr.filter((r) => r.proveedor === contraparte || r.cliente === contraparte);
    return arr;
  }, [records, productosSel, planta, contraparte]);

  // Saldo histórico por producto (usado como columna "Saldo").
  const saldoMap = useMemo(() => buildSaldoMap(records), [records]);

  // ----- Stock: agrega entradas/salidas por producto+unidad -----
  // Movimientos = período filtrado. Stock Total = acumulado histórico (Σentradas - Σsalidas),
  // calculado sobre baseSinFechas (respeta filtros de producto/planta/contraparte, ignora fechas).
  const acumuladoMap = useMemo(() => buildAcumuladoMap(baseSinFechas), [baseSinFechas]);
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
    return [...map.entries()].map(([key, it]) => {
      const h = acumuladoMap.get(key);
      return {
        ...it,
        stock: it.entradas - it.salidas,
        entradasH: h?.e || 0,
        salidasH: h?.s || 0,
        stockHist: (h?.e || 0) - (h?.s || 0),
      };
    })
    .sort((a, b) => Math.abs(b.stockHist) - Math.abs(a.stockHist));
  }, [baseRecords, acumuladoMap]);

  // ----- Stock por planta -----
  // Stock Total por planta también es acumulado histórico.
  const plantaHistMap = useMemo(() => {
    const out = new Map();
    for (const r of records) {
      const p = r.planta || 'Sin planta';
      if (!out.has(p)) out.set(p, { e: 0, s: 0 });
      const it = out.get(p);
      const tn = pesoTn(r.pesoBalanza);
      if (r.carga === 'Entrada') it.e += tn;
      else it.s += tn;
    }
    return out;
  }, [records]);
  const plantaRows = useMemo(() => {
    const map = new Map();
    for (const r of baseRecords) {
      const p = r.planta || 'Sin planta';
      if (!map.has(p)) {
        map.set(p, { planta: p, entradas: 0, salidas: 0, productos: new Set(), movs: 0 });
      }
      const it = map.get(p);
      it.movs += 1;
      it.productos.add(r.codigoProducto || r.producto || '—');
      const tn = pesoTn(r.pesoBalanza);
      if (r.carga === 'Entrada') it.entradas += tn;
      else it.salidas += tn;
    }
    return [...map.values()].map((it) => {
      const h = plantaHistMap.get(it.planta);
      return {
        ...it,
        stockHist: (h?.e || 0) - (h?.s || 0),
        nProductos: it.productos.size,
      };
    })
    .sort((a, b) => b.stockHist - a.stockHist);
  }, [baseRecords, plantaHistMap]);

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
    if (tipo === 'general') return {};
    if (tipo === 'por-planta') {
      return {
        count: plantaRows.length,
        entradas: plantaRows.reduce((s, r) => s + r.entradas, 0),
        salidas: plantaRows.reduce((s, r) => s + r.salidas, 0),
        stock: plantaRows.reduce((s, r) => s + r.stockHist, 0),
        totalMovs: plantaRows.reduce((s, r) => s + r.movs, 0),
      };
    }
    const tn = movRows.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    return { count: movRows.length, tn };
  }, [tipo, plantaRows, movRows]);

  // ----- Datos del gráfico de torta -----
  const pieData = useMemo(() => {
    if (tipo === 'general') return [];
    if (tipo === 'por-planta') {
      return buildPie(
        plantaRows.filter((r) => r.stockHist > 0.0001),
        (r) => r.stockHist,
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
  }, [tipo, plantaRows, movRows]);

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
  // ==========================================================
  // Datos del INFORME GENERAL (gerencial, 5 secciones)
  // ==========================================================
  const generalData = useMemo(() => {
    if (tipo !== 'general') return null;

    const filasES = (rows, campo, campoMovs) => {
      const conMov = rows.filter((r) => r[campo] > 0.0001);
      const total = conMov.reduce((s, r) => s + r[campo], 0) || 1;
      return conMov
        .map((r) => ({
          codigo: r.codigo,
          producto: r.producto,
          unit: r.unit,
          cant: r[campo],
          movs: r[campoMovs],
          pct: (r[campo] / total) * 100,
        }))
        .sort((a, b) => b.cant - a.cant);
    };

    // --- Sección 01: VENTAS (salidas del período) ---
    const ventasRows = filasES(stockRows, 'salidas', 'countS');
    const salidasBase = baseRecords.filter((r) => r.carga === 'Salida');
    const tnSal = salidasBase.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    const movsSal = salidasBase.length;
    const clientes = new Set(salidasBase.map((r) => r.cliente).filter(Boolean)).size;
    const promSal = movsSal ? tnSal / movsSal : 0;

    // --- Sección 02: ENTRADAS (del período) ---
    const entradasRows = filasES(stockRows, 'entradas', 'countE');
    const entradasBase = baseRecords.filter((r) => r.carga === 'Entrada');
    const tnEnt = entradasBase.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    const movsEnt = entradasBase.length;
    const proveedores = new Set(entradasBase.map((r) => r.proveedor).filter(Boolean)).size;
    const promEnt = movsEnt ? tnEnt / movsEnt : 0;

    // --- Sección 03: STOCK A LA FECHA (por material, acumulado histórico) ---
    const catalogo = new Map();
    const ultimo = new Map();
    for (const r of baseSinFechas) {
      const { unit } = pesoDetalle(r.pesoBalanza);
      const key = `${r.codigoProducto || r.producto || 'SIN CÓDIGO'}§${unit}`;
      if (!catalogo.has(key)) {
        catalogo.set(key, { codigo: r.codigoProducto || '—', producto: r.producto || '—', unit: unit || '—' });
      }
      const ms = toMillis(r.fechaRemito) || 0;
      if (ms > (ultimo.get(key) || 0)) ultimo.set(key, ms);
    }
    const stockFechaRows = [...acumuladoMap.entries()]
      .map(([key, h]) => {
        const c = catalogo.get(key) || { codigo: '—', producto: key.split('§')[0], unit: '—' };
        const ult = ultimo.get(key);
        return {
          ...c,
          e: h.e,
          s: h.s,
          stock: h.e - h.s,
          ultimo: ult ? formatDate(new Date(ult).toISOString()) : '—',
        };
      })
      .sort((a, b) => a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }));
    const stockPie = buildPie(
      stockFechaRows.filter((r) => r.stock > 0.0001),
      (r) => r.stock,
      (r) => `${r.codigo} · ${r.producto}`,
      () => 'tn'
    );
    const stockTotalTn = stockFechaRows.filter((r) => r.unit === 'tn').reduce((s, r) => s + r.stock, 0);
    const negativos = stockFechaRows.filter((r) => r.stock < -0.0001);
    const ceros = stockFechaRows.filter((r) => Math.abs(r.stock) <= 0.0001);

    // --- Sección 04: EVOLUCIÓN MENSUAL (últimos 12 meses) ---
    let maxMs = 0;
    for (const r of baseSinFechas) maxMs = Math.max(maxMs, toMillis(r.fechaRemito) || 0);
    const ancla = maxMs ? new Date(maxMs) : new Date();
    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ancla.getFullYear(), ancla.getMonth() - i, 1);
      meses.push({
        y: d.getFullYear(),
        m: d.getMonth() + 1,
        label: `${MES_ABREV[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        e: 0,
        s: 0,
      });
    }
    const idxMes = new Map(meses.map((mm, i) => [`${mm.y}-${String(mm.m).padStart(2, '0')}`, i]));
    for (const r of baseSinFechas) {
      const ym = anioMes(r.fechaRemito);
      if (!ym) continue;
      const i = idxMes.get(`${ym.anio}-${String(ym.mes).padStart(2, '0')}`);
      if (i == null) continue;
      const tn = pesoTn(r.pesoBalanza);
      if (r.carga === 'Entrada') meses[i].e += tn;
      else meses[i].s += tn;
    }
    const pico = [...meses].sort((a, b) => b.s - a.s)[0];
    const mesesActivos = meses.filter((m) => m.e > 0.0001 || m.s > 0.0001).length || 1;
    const promEvoE = meses.reduce((s, m) => s + m.e, 0) / mesesActivos;
    const promEvoS = meses.reduce((s, m) => s + m.s, 0) / mesesActivos;

    // --- Sección 05: ALERTAS DE STOCK ---
    const alertasRows = [
      ...negativos.map((r) => ({ ...r, estado: 'NEGATIVO' })),
      ...ceros.map((r) => ({ ...r, estado: 'SIN STOCK' })),
    ];

    return {
      ventas: { rows: ventasRows, pie: pieSalidas, totalTn: tnSal, movs: movsSal, contrapartes: clientes, promedio: promSal },
      entradas: { rows: entradasRows, pie: pieEntradas, totalTn: tnEnt, movs: movsEnt, contrapartes: proveedores, promedio: promEnt },
      stock: { rows: stockFechaRows, pie: stockPie, n: stockFechaRows.length, totalTn: stockTotalTn, negativos: negativos.length, ceros: ceros.length },
      evo: { meses, pico, promE: promEvoE, promS: promEvoS },
      alertas: { rows: alertasRows },
    };
  }, [tipo, stockRows, baseRecords, baseSinFechas, acumuladoMap, pieEntradas, pieSalidas]);

  // ----- Etiquetas del informe -----
  const reportTitle = TIPOS.find((t) => t.value === tipo)?.label || 'Informe';
  const esMovimiento = MOVIMIENTO_TIPOS.has(tipo);

  const donutCenterTop = tipo === 'por-planta' ? 'Stock (tn)' : 'Total (tn)';
  const donutCenterBottom = tipo === 'por-planta' ? fmtNum(totals.stock) : fmtNum(totals.tn);
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
    if (tipo === 'general') return { head: [], rows: [], foot: [] };
    if (tipo === 'por-planta') {
      return {
        head: ['Planta', 'Productos', 'Entradas (tn)', 'Salidas (tn)', 'Stock (tn)', 'Movimientos'],
        rows: plantaRows.map((r) => [
          r.planta,
          r.nProductos,
          fmtNum(r.entradas),
          fmtNum(r.salidas),
          fmtNum(r.stockHist),
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
      { text: `Total: ${totals.count} movimientos · ${fmtNum(totals.tn)} tn`, colSpan: head.length },
    ];
    return { head, rows, foot };
  }, [tipo, plantaRows, movRows, totals, esMovimiento]);

  // ==========================================================
  // Exportación a Excel (.xlsx)
  // ==========================================================
  async function handleExportExcel() {
    try {
      const XLSX = await import('xlsx');
      const hoy = formatDateTime(new Date());

      // --- Informe General: un libro con 5 hojas ---
      if (tipo === 'general' && generalData) {
        const wb = XLSX.utils.book_new();
        const cab = (arr, titulo) => {
          arr.push([COMPANY.name]);
          arr.push([`INFORME GENERAL — ${titulo.toUpperCase()}`]);
          arr.push([periodoLabel]);
          arr.push([`Generado: ${hoy}`]);
          arr.push([]);
        };
        function hoja(nombre, tituloHoja, head, rows, footTexts) {
          const aoa2 = [];
          cab(aoa2, tituloHoja);
          aoa2.push(head);
          for (const r of rows) aoa2.push(r.map((c) => pdfSafe(c)));
          if (footTexts?.length) {
            aoa2.push([]);
            aoa2.push(footTexts.map((c) => pdfSafe(c)));
          }
          const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
          ws2['!cols'] = Array.from({ length: head.length }, () => ({ wch: 18 }));
          XLSX.utils.book_append_sheet(wb, ws2, nombre);
        }

        hoja(
          'Ventas',
          'Ventas (salidas)',
          ['Producto', 'Código', 'Unidad', 'Vendido', 'Movimientos', '% del total'],
          generalData.ventas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), r.movs, `${r.pct.toFixed(1)}%`]),
          [`Total: ${fmtNum(generalData.ventas.totalTn)} tn · ${generalData.ventas.movs} remitos · ${generalData.ventas.contrapartes} clientes`]
        );
        hoja(
          'Entradas',
          'Entradas de materiales',
          ['Producto', 'Código', 'Unidad', 'Recibido', 'Movimientos', '% del total'],
          generalData.entradas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), r.movs, `${r.pct.toFixed(1)}%`]),
          [`Total: ${fmtNum(generalData.entradas.totalTn)} tn · ${generalData.entradas.movs} remitos · ${generalData.entradas.contrapartes} proveedores`]
        );
        hoja(
          'Stock',
          'Stock a la fecha',
          ['Producto', 'Código', 'Unidad', 'Entradas hist.', 'Salidas hist.', 'Stock actual', 'Último mov.'],
          generalData.stock.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.e), fmtNum(r.s), fmtNum(r.stock), r.ultimo]),
          [`Total: ${fmtNum(generalData.stock.totalTn)} tn en ${generalData.stock.n} materiales`]
        );
        hoja(
          'Evolucion',
          'Evolución mensual',
          ['Mes', 'Entradas (tn)', 'Salidas (tn)', 'Diferencia (tn)'],
          generalData.evo.meses.map((m) => [m.label, fmtNum(m.e), fmtNum(m.s), fmtNum(m.e - m.s)]),
          [`Pico de ventas: ${generalData.evo.pico?.label || '—'} (${fmtNum(generalData.evo.pico?.s || 0)} tn)`]
        );
        hoja(
          'Alertas',
          'Alertas de stock',
          ['Producto', 'Código', 'Unidad', 'Stock actual', 'Estado'],
          generalData.alertas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.stock), r.estado]),
          generalData.alertas.rows.length ? [] : ['Sin alertas: ningún material con stock negativo o cero']
        );

        XLSX.writeFile(wb, `Informe_General_${todayISO()}.xlsx`);
        showToast('Informe General exportado a Excel (5 hojas)');
        return;
      }

      const nCols = tableData.head.length;
      const aoa = [];
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

  // Anchos de columna (mm) por tipo de informe, para el PDF.
  // La suma de cada fila queda SIEMPRE dentro del área imprimible:
  //   portrait A4 = 210mm -> usable 190 · landscape = 297mm -> usable 277.
  const ANCHOS_PDF = {
    'por-planta': [{ w: 40 }, { w: 20, a: 'center' }, { w: 26, a: 'right' }, { w: 26, a: 'right' }, { w: 26, a: 'right' }, { w: 22, a: 'right' }],
    entradas: [{ w: 17 }, { w: 42 }, { w: 11, a: 'center' }, { w: 15, a: 'center' }, { w: 32 }, { w: 14, a: 'center' }, { w: 26 }, { w: 19, a: 'right' }, { w: 21, a: 'right' }, { w: 13, a: 'center' }],
    salidas: null, // igual que entradas
    movimientos: [{ w: 17 }, { w: 13, a: 'center' }, { w: 40 }, { w: 11, a: 'center' }, { w: 15, a: 'center' }, { w: 30 }, { w: 14, a: 'center' }, { w: 26 }, { w: 19, a: 'right' }, { w: 21, a: 'right' }, { w: 13, a: 'center' }],
  };

  async function handleExportPDF() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const logo = await getLogoDataUrl();
      const landscape = tipo === 'general' || tableData.head.length >= 8;
      const esGeneral = tipo === 'general';
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const usable = pageW - margin * 2;

      // --- utilidades de dibujo ---
      const gstateOk = typeof doc.GState === 'function' && typeof doc.setGState === 'function';
      function conOpacidad(op, fn) {
        if (!gstateOk) return fn();
        doc.setGState(new doc.GState({ opacity: op }));
        try {
          fn();
        } finally {
          doc.setGState(new doc.GState({ opacity: 1 }));
        }
      }
      // Tarjeta blanca con sombra suave y acento superior.
      function panel(x, y, w, h) {
        conOpacidad(0.05, () => {
          doc.setFillColor(15, 23, 42);
          doc.roundedRect(x + 0.8, y + 1.1, w, h, 3, 3, 'F');
        });
        conOpacidad(0.06, () => {
          doc.setFillColor(15, 23, 42);
          doc.roundedRect(x + 0.4, y + 0.55, w, h, 3, 3, 'F');
        });
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, w, h, 3, 3, 'FD');
        doc.setFillColor(8, 145, 178);
        doc.roundedRect(x + 4, y, Math.max(w - 8, 6), 1.1, 0.55, 0.55, 'F');
      }

      // --- Encabezado: banda con logo + empresa + título ---
      const headH = 24;
      conOpacidad(0.07, () => {
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(margin + 0.5, margin + 0.9, usable, headH, 3, 3, 'F');
      });
      doc.setFillColor(252, 253, 254);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, margin, usable, headH, 3, 3, 'FD');
      doc.setFillColor(8, 145, 178);
      doc.roundedRect(margin + 2.5, margin + 3, 1.7, headH - 6, 0.85, 0.85, 'F');
      if (logo) doc.addImage(logo, 'PNG', margin + 6.5, margin + 3.5, 17, 17);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(COMPANY.name), margin + 27, margin + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(COMPANY.tagline), margin + 27, margin + 15.5);

      // Título a la derecha: se achica si no entra en su mitad.
      const titulo = pdfSafe(`INFORME DE ${reportTitle.toUpperCase()}`);
      let fsTitulo = 13;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fsTitulo);
      while (fsTitulo > 8 && doc.getTextWidth(titulo) > usable * 0.52) {
        fsTitulo -= 0.5;
        doc.setFontSize(fsTitulo);
      }
      doc.setTextColor(8, 145, 178);
      doc.text(titulo, pageW - margin - 5, margin + 9, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafe(periodoLabel), pageW - margin - 5, margin + 14, { align: 'right' });
      doc.text(pdfSafe(`Generado: ${formatDateTime(new Date())}`), pageW - margin - 5, margin + 18, { align: 'right' });

      // Filtros debajo de la banda: envuelto al ancho útil, máx 2 líneas.
      let cursorY = margin + headH + 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const filtrosTxt = pdfSafe(filterLabel ? `Filtros: ${filterLabel}` : 'Sin filtros aplicados');
      let flLines = doc.splitTextToSize(filtrosTxt, usable);
      if (flLines.length > 2) {
        flLines = [flLines[0], `${flLines[1].replace(/\s+\S*$/, '')} …`];
      }
      doc.text(flLines, margin, cursorY);
      cursorY += flLines.length * 3.8 + 2;

      // --- Informe General: carátula + una página por sección ---
      if (tipo === 'general' && generalData) {
        const g = generalData;
        const SEC = SECCION_COLORS;
        const paginasConCabecera = new Set();

        // Cabecera compacta que aparece en TODAS las páginas del informe.
        function cabeceraPagina(colKey, tituloSeccion) {
          const pn = doc.internal.getNumberOfPages();
          if (paginasConCabecera.has(pn)) return;
          paginasConCabecera.add(pn);
          const col = SEC[colKey] || SEC.ventas;
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(margin, margin, usable, 13, 2.5, 2.5, 'FD');
          doc.setFillColor(...col.rgb);
          doc.roundedRect(margin + 1.5, margin + 2, 1.6, 9, 0.8, 0.8, 'F');
          if (logo) doc.addImage(logo, 'PNG', margin + 5, margin + 2.5, 8, 8);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(COMPANY.name), margin + 15.5, margin + 6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe('Sistema de Control de Stock'), margin + 15.5, margin + 10.2);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...col.rgb);
          doc.text(pdfSafe(tituloSeccion), pageW - margin - 4, margin + 6, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(periodoLabel), pageW - margin - 4, margin + 10.2, { align: 'right' });
        }

        // Cada sección arranca en página nueva, con su banda de título.
        function nuevaPaginaSeccion(num, titulo, sub, colKey) {
          doc.addPage();
          cabeceraPagina(colKey, `SECCIÓN ${num} · ${titulo}`);
          const y = margin + 13 + 6;
          const col = SEC[colKey];
          doc.setFillColor(...col.rgb);
          doc.roundedRect(margin, y, 9, 9, 1.8, 1.8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(255, 255, 255);
          doc.text(num, margin + 4.5, y + 6.3, { align: 'center' });
          doc.setFontSize(12.5);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(titulo), margin + 12.5, y + 6.4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.2);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(sub), pageW - margin, y + 6.4, { align: 'right' });
          conOpacidad(0.3, () => {
            doc.setDrawColor(...col.rgb);
            doc.setLineWidth(0.6);
            doc.line(margin, y + 12, pageW - margin, y + 12);
          });
          doc.setLineWidth(0.15);
          cursorY = y + 18;
        }

        function chips(stats) {
          const gapC = 4;
          const w = (usable - gapC * (stats.length - 1)) / stats.length;
          const hC = 12.5;
          stats.forEach(([label, valor], i) => {
            const x = margin + i * (w + gapC);
            conOpacidad(0.06, () => {
              doc.setFillColor(15, 23, 42);
              doc.roundedRect(x + 0.5, cursorY + 0.7, w, hC, 2, 2, 'F');
            });
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(x, cursorY, w, hC, 2, 2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(15, 23, 42);
            doc.text(pdfSafe(String(valor)), x + w / 2, cursorY + 5.6, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.6);
            doc.setTextColor(100, 116, 139);
            doc.text(pdfSafe(label.toUpperCase()), x + w / 2, cursorY + 10, { align: 'center' });
          });
          cursorY += hC + 4;
        }

        function donutPanel(data, centerTop, centerBottom) {
          if (!data.length) return;
          const chartSize = 30;
          const padP = 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.6);
          const legendX = margin + padP + chartSize + 6;
          const legendMax = pageW - margin - padP - legendX;
          const items = data.slice(0, 6);
          let lh = 0;
          for (const d of items) {
            const label = `${d.label} — ${fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
            lh += Math.max(4.3, doc.splitTextToSize(pdfSafe(label), legendMax).length * 4.2);
          }
          const innerH = Math.max(chartSize, lh) + padP * 2;
          panel(margin, cursorY, usable, innerH);
          const img = donutToDataUrl(data, 190, 30, centerTop, centerBottom);
          doc.addImage(img, 'PNG', margin + padP + 1, cursorY + padP, chartSize, chartSize);
          let ly = cursorY + padP + 3.2;
          for (const d of items) {
            const label = `${d.label} — ${fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
            doc.setFillColor(...hexToRgb(d.color));
            doc.circle(legendX + 1, ly, 1, 'F');
            const lines = doc.splitTextToSize(pdfSafe(label), legendMax);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.6);
            doc.setTextColor(51, 65, 85);
            doc.text(lines, legendX + 3.4, ly + 0.7);
            ly += Math.max(4.3, lines.length * 4.2);
          }
          if (data.length > items.length) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.6);
            doc.setTextColor(148, 163, 184);
            doc.text(pdfSafe(`+ ${data.length - items.length} más`), legendX + 3.4, ly + 0.7);
          }
          cursorY += innerH + 5;
        }

        function tabla(head, rows, widths, colKey, tituloSeccion, extraStyles = {}) {
          const totalW = widths.reduce((s, x) => s + (x?.w ?? x), 0);
          const side = Math.max((pageW - totalW) / 2, margin);
          const col = SEC[colKey] || SEC.ventas;
          autoTable(doc, {
            startY: cursorY,
            head: [head.map(pdfSafe)],
            body: rows.map((r) => r.map((c) => pdfSafe(c))),
            theme: 'grid',
            styles: { fontSize: 7.2, cellPadding: 1.5, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
            headStyles: { fillColor: col.rgb, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: Object.fromEntries(widths.map((spec, i) => [i, { cellWidth: spec?.w ?? spec, halign: spec?.a || 'left' }])),
            didDrawPage: () => cabeceraPagina(colKey, tituloSeccion),
            margin: { left: side, right: side, top: 28, bottom: 16 },
            ...extraStyles,
          });
          cursorY = doc.lastAutoTable.finalY + 6;
        }

        // ===== CARÁTULA (página 1) =====
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        doc.setTextColor(8, 145, 178);
        doc.text('INFORME GENERAL', margin, cursorY + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(pdfSafe(`${periodoLabel}  ·  Generado: ${formatDateTime(new Date())}`), margin, cursorY + 14);
        cursorY += 20;
        chips([
          ['Stock total (tn)', fmtNum(g.stock.totalTn)],
          ['Ventas del período (tn)', fmtNum(g.ventas.totalTn)],
          ['Entradas del período (tn)', fmtNum(g.entradas.totalTn)],
          ['Alertas de stock', String(g.alertas.rows.length)],
        ]);
        const toc = [
          ['01', 'Ventas — Salidas del período', 'ventas'],
          ['02', 'Entradas de materiales', 'entradas'],
          ['03', 'Stock a la fecha — por material', 'stock'],
          ['04', 'Evolución mensual — últimos 12 meses', 'evolucion'],
          ['05', 'Alertas de stock', 'alertas'],
        ];
        const tocH = 12 + toc.length * 9 + 5;
        panel(margin, cursorY, usable, tocH);
        let ty = cursorY + 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('CONTENIDO DEL INFORME', margin + 6, ty);
        ty += 7;
        toc.forEach(([n, t, c]) => {
          const col = SEC[c];
          doc.setFillColor(...col.rgb);
          doc.roundedRect(margin + 6, ty - 4.6, 6.5, 6.5, 1.3, 1.3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(n, margin + 9.25, ty - 0.4, { align: 'center' });
          doc.setFontSize(9.5);
          doc.setTextColor(30, 41, 59);
          doc.text(pdfSafe(t), margin + 17, ty);
          ty += 9;
        });
        cursorY += tocH + 7;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          pdfSafe('Nota: el stock a la fecha (sección 03) es el acumulado histórico de toda la base y no depende del período seleccionado.'),
          margin,
          cursorY
        );

        // ===== 01 VENTAS =====
        nuevaPaginaSeccion('01', 'VENTAS — SALIDAS DEL PERÍODO', `${g.ventas.movs} remitos · ${g.ventas.contrapartes} clientes`, 'ventas');
        chips([
          ['Vendido (tn)', fmtNum(g.ventas.totalTn)],
          ['Remitos de salida', String(g.ventas.movs)],
          ['Clientes', String(g.ventas.contrapartes)],
          ['Promedio por venta', `${fmtNum(g.ventas.promedio)} tn`],
        ]);
        donutPanel(g.ventas.pie, 'Ventas', fmtNum(g.ventas.totalTn));
        tabla(
          ['Producto', 'Código', 'Unidad', 'Vendido', 'Movs', '% del total'],
          g.ventas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`]),
          [{ w: 88 }, { w: 20, a: 'center' }, { w: 16, a: 'center' }, { w: 28, a: 'right' }, { w: 20, a: 'right' }, { w: 22, a: 'right' }],
          'ventas',
          'SECCIÓN 01 · VENTAS'
        );

        // ===== 02 ENTRADAS =====
        nuevaPaginaSeccion('02', 'ENTRADAS DE MATERIALES', `${g.entradas.movs} remitos · ${g.entradas.contrapartes} proveedores`, 'entradas');
        chips([
          ['Recibido (tn)', fmtNum(g.entradas.totalTn)],
          ['Remitos de entrada', String(g.entradas.movs)],
          ['Proveedores', String(g.entradas.contrapartes)],
          ['Promedio por ingreso', `${fmtNum(g.entradas.promedio)} tn`],
        ]);
        donutPanel(g.entradas.pie, 'Entradas', fmtNum(g.entradas.totalTn));
        tabla(
          ['Producto', 'Código', 'Unidad', 'Recibido', 'Movs', '% del total'],
          g.entradas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`]),
          [{ w: 88 }, { w: 20, a: 'center' }, { w: 16, a: 'center' }, { w: 28, a: 'right' }, { w: 20, a: 'right' }, { w: 22, a: 'right' }],
          'entradas',
          'SECCIÓN 02 · ENTRADAS'
        );

        // ===== 03 STOCK A LA FECHA =====
        nuevaPaginaSeccion('03', 'STOCK A LA FECHA — POR MATERIAL', 'Acumulado histórico · independiente del período seleccionado', 'stock');
        chips([
          ['Materiales', String(g.stock.n)],
          ['Stock total (tn)', fmtNum(g.stock.totalTn)],
          ['Con stock negativo', String(g.stock.negativos)],
          ['Sin existencias', String(g.stock.ceros)],
        ]);
        donutPanel(g.stock.pie, 'Stock actual', fmtNum(g.stock.totalTn));
        tabla(
          ['Producto', 'Código', 'Unidad', 'Entradas hist.', 'Salidas hist.', 'Stock actual', 'Último mov.'],
          g.stock.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.e), fmtNum(r.s), fmtNum(r.stock), r.ultimo]),
          [{ w: 74 }, { w: 18, a: 'center' }, { w: 14, a: 'center' }, { w: 26, a: 'right' }, { w: 26, a: 'right' }, { w: 27, a: 'right' }, { w: 21, a: 'center' }],
          'stock',
          'SECCIÓN 03 · STOCK'
        );

        // ===== 04 EVOLUCIÓN MENSUAL =====
        nuevaPaginaSeccion('04', 'EVOLUCIÓN MENSUAL — ÚLTIMOS 12 MESES', `Pico de ventas: ${g.evo.pico?.label || '—'} (${fmtNum(g.evo.pico?.s || 0)} tn)`, 'evolucion');
        chips([
          ['Promedio mensual entradas', `${fmtNum(g.evo.promE)} tn`],
          ['Promedio mensual salidas', `${fmtNum(g.evo.promS)} tn`],
          ['Mes pico de ventas', g.evo.pico?.label || '—'],
          ['Salidas del mes pico', `${fmtNum(g.evo.pico?.s || 0)} tn`],
        ]);
        let lx = margin;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        [
          ['Entradas', [5, 150, 105]],
          ['Salidas', [8, 145, 178]],
        ].forEach(([lab, colr]) => {
          doc.setFillColor(...colr);
          doc.circle(lx + 1.4, cursorY + 2.6, 1.4, 'F');
          doc.setTextColor(71, 85, 105);
          doc.text(pdfSafe(lab), lx + 4.4, cursorY + 3.9);
          lx += doc.getTextWidth(pdfSafe(lab)) + 12;
        });
        const evoTop = cursorY + 10;
        const plotM = 14;
        const plotW = usable - plotM * 2;
        const maxH = 62;
        const baseY = evoTop + maxH;
        const maxVal = Math.max(...g.evo.meses.map((m) => Math.max(m.e, m.s)), 1);
        const gw = plotW / g.evo.meses.length;
        const barW = Math.min(8.5, (gw - 3) / 2);
        conOpacidad(0.5, () => {
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.12);
          for (const f of [0.25, 0.5, 0.75]) {
            doc.line(margin + plotM, baseY - maxH * f, pageW - margin - plotM, baseY - maxH * f);
          }
        });
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.25);
        doc.line(margin + plotM, baseY, pageW - margin - plotM, baseY);
        g.evo.meses.forEach((m, i) => {
          const cx = margin + plotM + gw * i + gw / 2;
          const he = (m.e / maxVal) * maxH;
          const hs = (m.s / maxVal) * maxH;
          if (he > 0.15) {
            doc.setFillColor(5, 150, 105);
            doc.roundedRect(cx - barW - 0.8, baseY - he, barW, he, 1, 1, 'F');
          }
          if (hs > 0.15) {
            doc.setFillColor(8, 145, 178);
            doc.rect(cx + 0.8, baseY - hs, barW, hs, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(m.label), cx, baseY + 4.6, { align: 'center' });
          doc.setFontSize(5.6);
          doc.setTextColor(148, 163, 184);
          if (m.s > 0) doc.text(fmtNum(m.s), cx + barW / 2 + 0.8, baseY - hs - 1.4, { align: 'center' });
        });
        cursorY = baseY + 12;

        // ===== 05 ALERTAS DE STOCK =====
        nuevaPaginaSeccion('05', 'ALERTAS DE STOCK', `${g.alertas.rows.length} material(es) a revisar`, 'alertas');
        if (!g.alertas.rows.length) {
          doc.setFillColor(236, 253, 245);
          doc.setDrawColor(167, 243, 208);
          doc.roundedRect(margin, cursorY, usable, 12, 2.5, 2.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(4, 120, 87);
          doc.text('Sin alertas: ningún material presenta stock negativo o cero.', margin + 6, cursorY + 7.5);
        } else {
          tabla(
            ['Producto', 'Código', 'Unidad', 'Stock actual', 'Estado'],
            g.alertas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.stock), r.estado]),
            [{ w: 96 }, { w: 22, a: 'center' }, { w: 18, a: 'center' }, { w: 30, a: 'right' }, { w: 28, a: 'center' }],
            'alertas',
            'SECCIÓN 05 · ALERTAS',
            {
              didParseCell: (d) => {
                if (d.section === 'body' && d.column.index === 4) {
                  d.cell.styles.fontStyle = 'bold';
                  d.cell.styles.textColor = String(d.cell.raw) === 'NEGATIVO' ? [190, 18, 60] : [180, 83, 9];
                }
              },
            }
          );
          if (g.alertas.rows.length > 15) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(pdfSafe(`+ ${g.alertas.rows.length - 15} materiales adicionales a revisar.`), margin, cursorY - 1);
          }
        }
      } else if (pieData.length > 0) {
        // Un solo donut con leyenda a la derecha, dentro de un panel.
        const chartSize = landscape ? 44 : 40;
        const padPanel = 6;
        const legendXBase = margin + padPanel + chartSize + 8;
        const legendMax = pageW - margin - padPanel - legendXBase;
        const lineH = 5.2;
        const items = pieData.slice(0, 9);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        let legendH = 0;
        for (const d of items) {
          const label = `${d.label} — ${d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
          const lines = doc.splitTextToSize(pdfSafe(label), legendMax);
          legendH += Math.max(lineH, lines.length * lineH);
        }
        const innerH = Math.max(chartSize, legendH) + padPanel * 2;
        panel(margin, cursorY, usable, innerH);
        const img = donutToDataUrl(pieData, 190, 30, donutCenterTop, donutCenterBottom);
        doc.addImage(img, 'PNG', margin + padPanel, cursorY + padPanel, chartSize, chartSize);
        const legendX = legendXBase;
        let ly = cursorY + padPanel + 3;
        for (const d of items) {
          const label = `${d.label} — ${d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)} (${d.pct.toFixed(1)}%)`;
          doc.setFillColor(...hexToRgb(d.color));
          doc.circle(legendX + 1.1, ly, 1.1, 'F');
          const lines = doc.splitTextToSize(pdfSafe(label), legendMax);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(lines, legendX + 3.8, ly + 0.8);
          ly += Math.max(lineH, lines.length * lineH);
        }
        cursorY += innerH + 7;
      }

      if (!esGeneral) autoTable(doc, {
        startY: cursorY,
        head: [tableData.head.map(pdfSafe)],
        body: tableData.rows.map((row) => row.map((c) => pdfSafe(c))),
        foot: [tableData.foot.map((f) => ({ content: pdfSafe(f.text), colSpan: f.colSpan || 1 }))],
        theme: 'grid',
        styles: {
          fontSize: landscape ? 7.5 : 8.2,
          cellPadding: 2,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          overflow: 'linebreak',
        },
        headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: Object.fromEntries(
          (ANCHOS_PDF[tipo] || ANCHOS_PDF.entradas).map((spec, i) => [
            i,
            { cellWidth: spec?.w ?? spec, halign: spec?.a || 'left' },
          ])
        ),
        horizontalPageBreak: true,
        margin: { top: 14, right: margin, bottom: 16, left: margin },
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
    <div className="font-display mx-auto max-w-6xl space-y-6">
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

      {/* ===== Informe (panel oscuro) ===== */}
      <div className="font-display relative overflow-hidden rounded-2xl border border-white/10 bg-night-900/70 text-slate-200 shadow-2xl shadow-black/40 backdrop-blur-xl">
        {/* Línea superior degradada */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-falpat via-indigo-500/70 to-transparent" />

        {/* Encabezado de empresa */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
              style={{ boxShadow: 'inset 0 0 24px rgba(45,212,255,0.08)' }}
            >
              <Image src={LOGO_PATH} alt="Logo GRUPO FALPAT SRL" width={56} height={56} className="h-12 w-12 object-contain" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-white">{COMPANY.name}</h2>
              <p className="text-xs font-medium text-slate-400">{COMPANY.tagline}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {[COMPANY.cuit, COMPANY.phone, COMPANY.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h1
              className="bg-gradient-to-r from-falpat via-sky-300 to-indigo-400 bg-clip-text text-base font-extrabold uppercase tracking-wide text-transparent"
            >
              Informe de {reportTitle}
            </h1>
            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-300">{periodoLabel}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Generado: {formatDateTime(new Date())}</p>
          </div>
        </div>

        {/* Filtros aplicados */}
        <div className="border-b border-white/10 bg-white/[0.03] px-6 py-2.5 font-mono text-[11px] uppercase tracking-wider text-slate-500">
          Filtros aplicados: <span className="text-slate-300">{filterLabel}</span>
        </div>

        {tipo === 'general' && generalData ? (
          <GeneralBody g={generalData} />
        ) : (
          <>
            {/* Resumen — stat cards */}
            <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4">
              {tipo === 'por-planta' ? (
                <>
                  <ResumenChip label="Plantas" value={String(totals.count)} />
                  <ResumenChip label="Entradas (tn)" value={fmtNum(totals.entradas)} tone="emerald" />
                  <ResumenChip label="Salidas (tn)" value={fmtNum(totals.salidas)} tone="volt" />
                  <ResumenChip label="Stock Total (tn)" value={fmtNum(totals.stock)} accent />
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

            {/* Gráfico de distribución */}
            <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center">
              <div className="flex flex-col items-center gap-3">
                <DonutChart data={pieData} centerTop={donutCenterTop} centerBottom={donutCenterBottom} dark />
                <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <IconPieChart className="h-3.5 w-3.5" />
                  {tipo === 'por-planta' ? 'Distribución por planta' : 'Distribución por producto'}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                {pieData.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay datos suficientes para el gráfico.</p>
                ) : (
                  pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                      <span className="min-w-0 flex-1 truncate text-slate-300" title={d.label}>
                        {d.label}
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-white">
                        {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                      </span>
                      <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-500">{d.pct.toFixed(1)}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tabla del detalle */}
            <div className="border-t border-white/10">
              <ReportTable data={tableData} />
            </div>
          </>
        )}

        {/* Pie del informe */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span>Documento generado automáticamente por el Sistema de Control de Stock.</span>
          <span className="font-semibold text-slate-400">{COMPANY.name}</span>
        </div>
      </div>
    </div>
  );
}

function ResumenChip({ label, value, accent = false, tone }) {
  const line =
    tone === 'emerald'
      ? 'linear-gradient(90deg,#10b981,#34d399)'
      : tone === 'volt'
        ? 'linear-gradient(90deg,#ffd60a,#fbbf24)'
        : accent
          ? 'linear-gradient(90deg,#2dd4ff,#818cf8)'
          : 'linear-gradient(90deg,rgba(255,255,255,0.35),transparent)';
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: line }} />
      <div
        className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono text-lg font-bold tabular-nums ${
          accent ? 'text-falpat' : tone === 'emerald' ? 'text-emerald-400' : tone === 'volt' ? 'text-volt' : 'text-white'
        }`}
        title={String(value)}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500" title={label}>
        {label}
      </div>
    </div>
  );
}

function ReportTable({ data }) {
  const { head, rows, foot } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth: head.length * 110 }}>
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.04]">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-center text-sm text-slate-500">
                Sin datos para los filtros seleccionados.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.04]">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`whitespace-nowrap px-4 py-2 text-xs ${j === 0 ? 'font-semibold text-white' : 'text-slate-300'}`}
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
            <tr className="border-t-2 border-white/15 bg-white/[0.05]">
              {foot.map((f, i) => (
                <td
                  key={i}
                  colSpan={f.colSpan || 1}
                  className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-falpat"
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

// ============================================================
// INFORME GENERAL (pantalla): 5 secciones estilo dashboard
// ============================================================

function SectionShell({ num, titulo, sub, colorKey, children }) {
  const col = SECCION_COLORS[colorKey];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-night-900/60 shadow-lg shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${col.hex}, transparent 70%)` }} />
      <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-extrabold"
          style={{
            background: `${col.hex}1f`,
            color: col.hex,
            boxShadow: `inset 0 0 0 1px ${col.hex}55, 0 0 22px -4px ${col.hex}66`,
          }}
        >
          {num}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-extrabold tracking-tight text-white">{titulo}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-wider text-slate-500">{sub}</p>
        </div>
      </div>
      <div className="space-y-5 px-6 pb-6">{children}</div>
    </section>
  );
}

function ChipsRow({ stats, color = '#2dd4ff' }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="group relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
        >
          <div
            className="absolute inset-x-0 top-0 h-[2px] opacity-70 transition group-hover:opacity-100"
            style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
          />
          <div className="truncate font-mono text-xl font-bold tabular-nums text-white" title={String(value)}>
            {value}
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500" title={label}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTable({ head, rows, rightFrom = 3 }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <table className="w-full min-w-[600px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.04]">
            {head.map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 ${
                  i >= rightFrom ? 'text-right' : ''
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-5 text-center text-slate-500">
                Sin datos en el período seleccionado.
              </td>
            </tr>
          ) : (
            rows.map((r, ri) => (
              <tr key={ri} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.04]">
                {r.map((c, ci) => (
                  <td
                    key={ci}
                    className={`whitespace-nowrap px-3 py-1.5 ${
                      ci >= rightFrom ? 'text-right font-mono tabular-nums text-slate-100' : 'text-slate-300'
                    } ${ci === 0 ? 'max-w-[280px] overflow-hidden text-ellipsis font-semibold text-white' : ''}`}
                    title={typeof c === 'string' ? c : undefined}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EvoBars({ meses }) {
  const max = Math.max(...meses.map((m) => Math.max(m.e, m.s)), 1);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> Salidas (ventas)
        </span>
      </div>
      <div className="mt-4 flex h-44 items-end gap-1.5">
        {meses.map((m) => (
          <div key={m.label} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              <div
                className="w-full max-w-[16px] rounded-t bg-emerald-400 transition-all group-hover:bg-emerald-300"
                style={{ height: `${Math.max((m.e / max) * 100, m.e > 0 ? 1.5 : 0)}%`, boxShadow: '0 0 14px -4px rgba(52,211,153,0.6)' }}
                title={`Entradas ${m.label}: ${fmtNum(m.e)} tn`}
              />
              <div
                className="w-full max-w-[16px] rounded-t bg-sky-400 transition-all group-hover:bg-sky-300"
                style={{ height: `${Math.max((m.s / max) * 100, m.s > 0 ? 1.5 : 0)}%`, boxShadow: '0 0 14px -4px rgba(56,189,248,0.6)' }}
                title={`Salidas ${m.label}: ${fmtNum(m.s)} tn`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {meses.map((m) => (
          <div key={m.label} className="min-w-0 flex-1 truncate text-center font-mono text-[9px] font-semibold uppercase tracking-wide text-slate-600">
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertasTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg border-l-[3px] border-emerald-400 bg-emerald-400/10 px-5 py-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-night-950">✓</span>
        <p className="text-sm font-semibold text-emerald-300">Sin alertas: ningún material presenta stock negativo o cero.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <table className="w-full min-w-[600px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.04]">
            {['Producto', 'Código', 'Unidad', 'Stock actual', 'Estado'].map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 ${
                  i >= 3 ? 'text-right' : ''
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.04]">
              <td className="max-w-[280px] truncate px-3 py-1.5 font-semibold text-white" title={r.producto}>
                {r.producto}
              </td>
              <td className="px-3 py-1.5 text-slate-400">{r.codigo}</td>
              <td className="px-3 py-1.5 text-slate-400">{r.unit}</td>
              <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono font-bold tabular-nums ${r.estado === 'NEGATIVO' ? 'text-rose-400' : 'text-amber-400'}`}>
                {fmtNum(r.stock)}
              </td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className={`inline-flex rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                    r.estado === 'NEGATIVO'
                      ? 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                      : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {r.estado}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneralBody({ g }) {
  return (
    <div className="space-y-5 px-4 py-5 sm:px-6">
      {/* ===== 01 VENTAS ===== */}
      <SectionShell
        num="01"
        titulo="Ventas — Salidas del período"
        sub={`${g.ventas.movs} remitos · ${g.ventas.contrapartes} clientes · promedio ${fmtNum(g.ventas.promedio)} tn por venta`}
        colorKey="ventas"
      >
        <ChipsRow
          color={SECCION_COLORS.ventas.hex}
          stats={[
            ['Vendido (tn)', fmtNum(g.ventas.totalTn)],
            ['Remitos de salida', String(g.ventas.movs)],
            ['Clientes', String(g.ventas.contrapartes)],
            ['Promedio por venta', `${fmtNum(g.ventas.promedio)} tn`],
          ]}
        />
        <PiePanel title="Distribución de ventas" data={g.ventas.pie} centerTop="Ventas" centerBottom={fmtNum(g.ventas.totalTn)} />
        <MiniTable
          head={['Producto', 'Código', 'Unidad', 'Vendido', 'Movs', '% total']}
          rows={g.ventas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`])}
        />
      </SectionShell>

      {/* ===== 02 ENTRADAS ===== */}
      <SectionShell
        num="02"
        titulo="Entradas de materiales"
        sub={`${g.entradas.movs} remitos · ${g.entradas.contrapartes} proveedores · promedio ${fmtNum(g.entradas.promedio)} tn por ingreso`}
        colorKey="entradas"
      >
        <ChipsRow
          color={SECCION_COLORS.entradas.hex}
          stats={[
            ['Recibido (tn)', fmtNum(g.entradas.totalTn)],
            ['Remitos de entrada', String(g.entradas.movs)],
            ['Proveedores', String(g.entradas.contrapartes)],
            ['Promedio por ingreso', `${fmtNum(g.entradas.promedio)} tn`],
          ]}
        />
        <PiePanel title="Distribución de entradas" data={g.entradas.pie} centerTop="Entradas" centerBottom={fmtNum(g.entradas.totalTn)} />
        <MiniTable
          head={['Producto', 'Código', 'Unidad', 'Recibido', 'Movs', '% total']}
          rows={g.entradas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`])}
        />
      </SectionShell>

      {/* ===== 03 STOCK A LA FECHA ===== */}
      <SectionShell
        num="03"
        titulo="Stock a la fecha — por material"
        sub="Acumulado histórico de toda la base · independiente del período seleccionado · ordenado por nombre"
        colorKey="stock"
      >
        <ChipsRow
          color={SECCION_COLORS.stock.hex}
          stats={[
            ['Materiales', String(g.stock.n)],
            ['Stock total (tn)', fmtNum(g.stock.totalTn)],
            ['Con stock negativo', String(g.stock.negativos)],
            ['Sin existencias', String(g.stock.ceros)],
          ]}
        />
        <PiePanel title="Composición del stock actual" data={g.stock.pie} centerTop="Stock actual" centerBottom={fmtNum(g.stock.totalTn)} />
        <MiniTable
          head={['Producto', 'Código', 'Unidad', 'Entradas hist.', 'Salidas hist.', 'Stock actual', 'Último mov.']}
          rows={g.stock.rows.slice(0, 20).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.e), fmtNum(r.s), fmtNum(r.stock), r.ultimo])}
          rightFrom={3}
        />
      </SectionShell>

      {/* ===== 04 EVOLUCIÓN MENSUAL ===== */}
      <SectionShell
        num="04"
        titulo="Evolución mensual — últimos 12 meses"
        sub={`Pico de ventas: ${g.evo.pico?.label || '—'} (${fmtNum(g.evo.pico?.s || 0)} tn)`}
        colorKey="evolucion"
      >
        <ChipsRow
          color={SECCION_COLORS.evolucion.hex}
          stats={[
            ['Promedio mensual entradas', `${fmtNum(g.evo.promE)} tn`],
            ['Promedio mensual salidas', `${fmtNum(g.evo.promS)} tn`],
            ['Mes pico de ventas', g.evo.pico?.label || '—'],
            ['Salidas del mes pico', `${fmtNum(g.evo.pico?.s || 0)} tn`],
          ]}
        />
        <EvoBars meses={g.evo.meses} />
      </SectionShell>

      {/* ===== 05 ALERTAS DE STOCK ===== */}
      <SectionShell
        num="05"
        titulo="Alertas de stock"
        sub={`${g.alertas.rows.length} material(es) a revisar`}
        colorKey="alertas"
      >
        <AlertasTable rows={g.alertas.rows} />
      </SectionShell>
    </div>
  );
}
