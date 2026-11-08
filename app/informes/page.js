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
import { formatDate, formatDateTime, todayISO, toMillis, anioMes, descripcionPeriodo, normalizeText } from '@/lib/utils';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import FiltrosAplicados from '@/components/FiltrosAplicados';
import MultiSelect from '@/components/MultiSelect';
import SectionHero from '@/components/SectionHero';
import {
  IconFilter,
  IconFileSpreadsheet,
  IconPrinter,
  IconPieChart,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconBox,
  IconLayers,
  IconScale,
  IconCalendar,
} from '@/components/Icons';
import {
  ChartCard,
  GlamDoughnut,
  GlamBars,
  GlamLine,
} from '@/components/Charts';

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
  { value: 'por-producto', label: 'Entradas y salidas por producto' },
  { value: 'por-cliente', label: 'Salidas por cliente' },
  { value: 'por-proveedor', label: 'Entradas por proveedor' },
  { value: 'por-chofer', label: 'Viajes por chofer' },
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
const CONTRAPARTE_TIPOS = new Set(['por-cliente', 'por-proveedor']);
const SIN_CHOFER = '__sin_chofer__';

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

// Filtra registros por período (mes/año + desde/hasta). Vacíos = sin restricción.
function filtrarPeriodo(arr, { mes, anio, desde, hasta }) {
  let out = arr;
  if (anio || mes) {
    out = out.filter((r) => {
      const ym = anioMes(r.fechaRemito);
      if (!ym) return false;
      if (anio && ym.anio !== Number(anio)) return false;
      if (mes && ym.mes !== Number(mes)) return false;
      return true;
    });
  }
  if (desde) {
    const min = toMillis(desde);
    out = out.filter((r) => (toMillis(r.fechaRemito) || 0) >= min);
  }
  if (hasta) {
    const end = new Date(hasta);
    end.setHours(23, 59, 59, 999);
    const max = end.getTime();
    out = out.filter((r) => (toMillis(r.fechaRemito) || 0) <= max);
  }
  return out;
}

// Agrega una lista de movimientos por producto+unidad (filas de las secciones 01/02).
function agregarSeccion(rows) {
  const map = new Map();
  for (const r of rows) {
    const { num, unit } = pesoDetalle(r.pesoBalanza);
    const key = `${r.codigoProducto || r.producto || 'SIN CÓDIGO'}§${unit}`;
    if (!map.has(key)) {
      map.set(key, {
        codigo: r.codigoProducto || '—',
        producto: r.producto || '—',
        unit: unit || '—',
        cant: 0,
        movs: 0,
      });
    }
    const it = map.get(key);
    it.cant += num;
    it.movs += 1;
  }
  const arr = [...map.values()].filter((r) => r.cant > 0.0001).sort((a, b) => b.cant - a.cant);
  const total = arr.reduce((s, r) => s + r.cant, 0) || 1;
  return arr.map((r) => ({ ...r, pct: (r.cant / total) * 100 }));
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

export default function Informes() {

  const { records, loading, error, showToast } = useApp();
  const [tipo, setTipo] = useState('general');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [productosSel, setProductosSel] = useState([]);
  const [planta, setPlanta] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [chofer, setChofer] = useState('');

  // Filtros de período propios de cada sección del Informe General
  // (01 Ventas / 02 Entradas), independientes del filtro global.
  const [ventasF, setVentasF] = useState({ mes: '', anio: '', desde: '', hasta: '' });
  const [entradasF, setEntradasF] = useState({ mes: '', anio: '', desde: '', hasta: '' });

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
  const razonSocialOptions = useMemo(
    () =>
      [...new Set(
        records
          .filter((record) => record.carga === 'Entrada')
          .map((record) => String(record.razonSocial ?? '').trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [records]
  );
  const contraparteOptions = useMemo(() => {
    const set = new Set();
    const soloProveedores = ['entradas', 'por-proveedor'].includes(tipo);
    const soloClientes = ['salidas', 'por-cliente'].includes(tipo);
    for (const r of records) {
      if (!soloClientes && r.proveedor) set.add(r.proveedor);
      if (!soloProveedores && r.cliente) set.add(r.cliente);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [records, tipo]);
  const choferOptions = useMemo(
    () => {
      const options = [...new Set(records.map((r) => String(r.chofer ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        .map((nombre) => ({ value: nombre, label: nombre }));
      if (records.some((r) => !String(r.chofer ?? '').trim())) {
        options.push({ value: SIN_CHOFER, label: 'Sin chofer' });
      }
      return options;
    },
    [records]
  );

  const anios = useMemo(
    () =>
      [...new Set(records.map((r) => anioMes(r.fechaRemito)?.anio).filter(Boolean))].sort(
        (a, b) => b - a
      ),
    [records]
  );

// Base respetando producto/planta/razón social/contraparte, sin período global: las secciones
  // 01 (Ventas) y 02 (Entradas) del Informe General aplican su PROPIO filtro de
  // período en la parte superior de cada sección.
  const baseSinPeriodo = useMemo(() => {
    let arr = records;
    if (productosSel.length > 0) {
      arr = arr.filter(
        (r) => productosSel.includes(r.codigoProducto) || productosSel.includes(r.producto)
      );
    }
    if (planta) arr = arr.filter((r) => r.planta === planta);
    if (razonSocial && tipo !== 'general') {
      arr = arr.filter(
        (r) => r.carga === 'Entrada' && String(r.razonSocial ?? '').trim() === razonSocial
      );
    }
    if (contraparte) {
      if (['salidas', 'por-cliente'].includes(tipo)) arr = arr.filter((r) => r.cliente === contraparte);
      else if (['entradas', 'por-proveedor'].includes(tipo)) arr = arr.filter((r) => r.proveedor === contraparte);
      else arr = arr.filter((r) => r.proveedor === contraparte || r.cliente === contraparte);
    }
    if (tipo === 'por-chofer' && chofer) {
      arr = arr.filter((r) => {
        const nombre = String(r.chofer ?? '').trim();
        return chofer === SIN_CHOFER ? !nombre : nombre === chofer;
      });
    }
    return arr;
  }, [records, productosSel, planta, razonSocial, contraparte, tipo, chofer]);

  // Base completa con el período global (mes/año + desde/hasta), para los informes
  // de Entradas / Salidas / Movimientos / Stock por planta.
  const baseRecords = useMemo(
    () => filtrarPeriodo(baseSinPeriodo, { mes, anio, desde, hasta }),
    [baseSinPeriodo, mes, anio, desde, hasta]
  );

  const analysisRows = useMemo(() => {
    if (!['por-cliente', 'por-proveedor', 'por-chofer', 'por-producto'].includes(tipo)) return [];
    const map = new Map();
    for (const record of baseRecords) {
      if (tipo === 'por-cliente' && record.carga !== 'Salida') continue;
      if (tipo === 'por-proveedor' && record.carga !== 'Entrada') continue;
      const { num, unit } = pesoDetalle(record.pesoBalanza);
      const tn = pesoTn(record.pesoBalanza);

      if (['por-cliente', 'por-proveedor', 'por-chofer'].includes(tipo)) {
        const nombreChofer = String(record.chofer ?? '').trim();
        const sinChofer = tipo === 'por-chofer' && !nombreChofer;
        const label = tipo === 'por-cliente'
          ? (record.cliente || 'Sin cliente')
          : tipo === 'por-proveedor'
            ? (record.proveedor || 'Sin proveedor')
            : (nombreChofer || 'Sin chofer');
        const key = sinChofer ? SIN_CHOFER : normalizeText(label);
        if (!map.has(key)) {
          map.set(key, {
            nombre: label,
            sinChofer,
            movimientos: 0,
            entradas: 0,
            entradasTn: 0,
            salidas: 0,
            salidasTn: 0,
            tn: 0,
            productos: new Set(),
          });
        }
        const item = map.get(key);
        item.movimientos += 1;
        item.productos.add(record.codigoProducto || record.producto || '—');
        if (tipo === 'por-chofer') {
          if (record.carga === 'Entrada') {
            item.entradas += 1;
            item.entradasTn += tn;
          } else {
            item.salidas += 1;
            item.salidasTn += tn;
          }
          item.tn += tn;
        } else {
          item.tn += tn;
        }
      } else {
        const key = `${record.codigoProducto || record.producto || 'SIN CÓDIGO'}§${unit}`;
        if (!map.has(key)) {
          map.set(key, {
            codigo: record.codigoProducto || '—',
            producto: record.producto || 'Sin producto',
            unidad: unit || '—',
            entradas: 0,
            entradasTn: 0,
            salidas: 0,
            salidasTn: 0,
          });
        }
        const item = map.get(key);
        if (record.carga === 'Entrada') {
          item.entradas += 1;
          item.entradasTn += tn;
        } else {
          item.salidas += 1;
          item.salidasTn += tn;
        }
      }
    }

    const rows = [...map.values()].map((item) => ({
      ...item,
      productos: item.productos ? item.productos.size : undefined,
      volumenTn: item.tn ?? item.entradasTn + item.salidasTn,
      balanceTn: item.entradasTn - item.salidasTn,
    }));
    return rows.sort((a, b) => {
      if (tipo === 'por-chofer' && a.sinChofer !== b.sinChofer) return a.sinChofer ? 1 : -1;
      return b.volumenTn - a.volumenTn;
    });
  }, [baseRecords, tipo]);

  const analysisSummary = useMemo(
    () => analysisRows.reduce((summary, row) => ({
      movimientos: summary.movimientos + (row.movimientos ?? row.entradas + row.salidas),
      entradas: summary.entradas + (row.entradas || 0),
      entradasTn: summary.entradasTn + (row.entradasTn || 0),
      salidas: summary.salidas + (row.salidas || 0),
      salidasTn: summary.salidasTn + (row.salidasTn || 0),
      tn: summary.tn + (row.tn || row.volumenTn || 0),
    }), { movimientos: 0, entradas: 0, entradasTn: 0, salidas: 0, salidasTn: 0, tn: 0 }),
    [analysisRows]
  );

// Saldo histórico por producto (usado como columna "Saldo").
  const saldoMap = useMemo(() => buildSaldoMap(records), [records]);

  // ----- Stock acumulado histórico (Σentradas - Σsalidas sobre TODO el historial) -----
  // Lo usan el Stock a la fecha (sección 03) y la Evolución mensual (sección 04).
  const acumuladoMap = useMemo(() => buildAcumuladoMap(records), [records]);

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
    if (['por-cliente', 'por-proveedor', 'por-chofer', 'por-producto'].includes(tipo)) {
      return {
        count: analysisRows.length,
        tn: analysisSummary.tn,
        ...analysisSummary,
      };
    }
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
  }, [tipo, plantaRows, movRows, analysisRows, analysisSummary]);

  // ----- Datos del gráfico de torta -----
  const pieData = useMemo(() => {
    if (tipo === 'general') return [];
    if (tipo === 'por-cliente' || tipo === 'por-proveedor') {
      return buildPie(
        analysisRows,
        (row) => row.tn,
        (row) => row.nombre,
        () => 'tn'
      );
    }
    if (tipo === 'por-chofer') {
      return buildPie(
        analysisRows.filter((row) => !row.sinChofer),
        (row) => row.tn,
        (row) => row.nombre,
        () => 'tn'
      );
    }
    if (tipo === 'por-producto') {
      return buildPie(
        analysisRows,
        (row) => row.volumenTn,
        (row) => `${row.codigo} · ${row.producto}`,
        () => 'tn'
      );
    }
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
  }, [tipo, plantaRows, movRows, analysisRows]);

// ==========================================================
  // Datos del INFORME GENERAL (gerencial, 5 secciones)
  // ==========================================================
  const generalData = useMemo(() => {
    if (tipo !== 'general') return null;

    // --- Sección 01: VENTAS (salidas del período, con su propio filtro) ---
    const ventasBase = filtrarPeriodo(baseSinPeriodo, ventasF).filter((r) => r.carga === 'Salida');
    const ventasRows = agregarSeccion(ventasBase);
    const tnSal = ventasBase.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    const movsSal = ventasBase.length;
    const clientes = new Set(ventasBase.map((r) => r.cliente).filter(Boolean)).size;
    const promSal = movsSal ? tnSal / movsSal : 0;

    // --- Sección 02: ENTRADAS (del período, con su propio filtro) ---
    let entradasBase = filtrarPeriodo(baseSinPeriodo, entradasF).filter((r) => r.carga === 'Entrada');
    if (razonSocial) {
      entradasBase = entradasBase.filter(
        (r) => String(r.razonSocial ?? '').trim() === razonSocial
      );
    }
    const entradasRows = agregarSeccion(entradasBase);
    const tnEnt = entradasBase.reduce((s, r) => s + pesoTn(r.pesoBalanza), 0);
    const movsEnt = entradasBase.length;
    const proveedores = new Set(entradasBase.map((r) => r.proveedor).filter(Boolean)).size;
    const promEnt = movsEnt ? tnEnt / movsEnt : 0;

    // --- Sección 03: STOCK A LA FECHA (por material, TODO el historial) ---
    const catalogo = new Map();
    const ultimo = new Map();
    for (const r of records) {
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
      stockFechaRows.filter((r) => r.unit === 'tn' && r.stock > 0.0001),
      (r) => r.stock,
      (r) => `${r.codigo} · ${r.producto}`,
      () => 'tn'
    );
    const stockTotalTn = stockFechaRows.filter((r) => r.unit === 'tn').reduce((s, r) => s + r.stock, 0);
    const negativos = stockFechaRows.filter((r) => r.stock < -0.0001);
    const ceros = stockFechaRows.filter((r) => Math.abs(r.stock) <= 0.0001);

    // --- Sección 04: EVOLUCIÓN MENSUAL (últimos 12 meses, TODO el historial) ---
    let maxMs = 0;
    for (const r of records) maxMs = Math.max(maxMs, toMillis(r.fechaRemito) || 0);
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
    for (const r of records) {
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
      ventas: {
        rows: ventasRows,
        pie: buildPie(ventasRows.filter((r) => r.unit === 'tn'), (r) => r.cant, (r) => `${r.codigo} · ${r.producto}`, (r) => r.unit),
        totalTn: tnSal,
        movs: movsSal,
        contrapartes: clientes,
        promedio: promSal,
        periodo: descripcionPeriodo(ventasF.mes, ventasF.anio, ventasF.desde, ventasF.hasta),
      },
      entradas: {
        rows: entradasRows,
        pie: buildPie(entradasRows.filter((r) => r.unit === 'tn'), (r) => r.cant, (r) => `${r.codigo} · ${r.producto}`, (r) => r.unit),
        totalTn: tnEnt,
        movs: movsEnt,
        contrapartes: proveedores,
        promedio: promEnt,
        periodo: descripcionPeriodo(entradasF.mes, entradasF.anio, entradasF.desde, entradasF.hasta),
      },
      stock: { rows: stockFechaRows, pie: stockPie, n: stockFechaRows.length, totalTn: stockTotalTn, negativos: negativos.length, ceros: ceros.length },
      evo: { meses, pico, promE: promEvoE, promS: promEvoS },
      alertas: { rows: alertasRows },
    };
  }, [tipo, baseSinPeriodo, ventasF, entradasF, razonSocial, acumuladoMap, records]);

  // ----- Etiquetas del informe -----
  const reportTitle = TIPOS.find((t) => t.value === tipo)?.label || 'Informe';
  const reportDisplayTitle = tipo === 'general' ? 'Informe General' : `Informe de ${reportTitle}`;
  const esMovimiento = MOVIMIENTO_TIPOS.has(tipo);
  const contraparteLabel = ['salidas', 'por-cliente'].includes(tipo)
    ? 'Cliente'
    : ['entradas', 'por-proveedor'].includes(tipo)
      ? 'Proveedor'
      : 'Cliente / proveedor';

  const donutCenterTop = tipo === 'por-planta'
    ? 'Stock (tn)'
    : tipo === 'por-chofer'
      ? 'Volumen movido (tn)'
      : 'Total (tn)';
  const donutCenterBottom = tipo === 'por-planta'
    ? fmtNum(totals.stock)
    : tipo === 'por-chofer'
      ? fmtNum(pieData.reduce((sum, item) => sum + item.value, 0))
      : fmtNum(totals.tn);
const periodoLabel = useMemo(() => {
    if (tipo === 'general') {
      return 'Período: por sección (01 Ventas · 02 Entradas)';
    }
    if (mes || anio || desde || hasta) {
      return `Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`;
    }
    return 'Período: todo el historial';
  }, [tipo, mes, anio, desde, hasta]);
  const filterLabel = useMemo(() => {
    const parts = [periodoLabel];
    if (productosSel.length > 0) parts.push(`Producto: ${productosSel.join(', ')}`);
    if (planta) parts.push(`Planta: ${planta}`);
    if (razonSocial) parts.push(`Razón social (solo Entradas): ${razonSocial}`);
    if (contraparte) parts.push(`${contraparteLabel}: ${contraparte}`);
    if (tipo === 'por-chofer' && chofer) {
      parts.push(`Chofer: ${chofer === SIN_CHOFER ? 'Sin chofer' : chofer}`);
    }
    return parts.join('  ·  ');
  }, [periodoLabel, productosSel, planta, razonSocial, contraparte, contraparteLabel, tipo, chofer]);

  const filtrosAplicados = useMemo(() => {
    const items = [];
    if (tipo === 'general') {
      const vActivo = Boolean(ventasF.mes || ventasF.anio || ventasF.desde || ventasF.hasta);
      const eActivo = Boolean(entradasF.mes || entradasF.anio || entradasF.desde || entradasF.hasta);
      if (vActivo) items.push(`Ventas (01): ${descripcionPeriodo(ventasF.mes, ventasF.anio, ventasF.desde, ventasF.hasta)}`);
      if (eActivo) items.push(`Entradas (02): ${descripcionPeriodo(entradasF.mes, entradasF.anio, entradasF.desde, entradasF.hasta)}`);
    } else if (mes || anio || desde || hasta) {
      items.push(`Período: ${descripcionPeriodo(mes, anio, desde, hasta)}`);
    }
    if (productosSel.length > 0) items.push(`Producto: ${productosSel.join(', ')}`);
    if (planta) items.push(`Planta: ${planta}`);
    if (razonSocial) items.push(`Razón social (solo Entradas): ${razonSocial}`);
    if (contraparte) items.push(`${contraparteLabel}: ${contraparte}`);
    if (tipo === 'por-chofer' && chofer) {
      items.push(`Chofer: ${chofer === SIN_CHOFER ? 'Sin chofer' : chofer}`);
    }
    return items;
  }, [tipo, mes, anio, desde, hasta, ventasF, entradasF, productosSel, planta, razonSocial, contraparte, contraparteLabel, chofer]);

  function clearFilters() {
    setProductosSel([]);
    setPlanta('');
    setRazonSocial('');
    setContraparte('');
    setChofer('');
    setDesde('');
    setHasta('');
    setMes('');
    setAnio('');
    setVentasF({ mes: '', anio: '', desde: '', hasta: '' });
    setEntradasF({ mes: '', anio: '', desde: '', hasta: '' });
  }

  // ==========================================================
  // Tablas (head / rows / foot) compartidas entre pantalla, Excel y PDF
  // ==========================================================
  const tableData = useMemo(() => {
    if (tipo === 'general') return { head: [], rows: [], foot: [] };
    if (tipo === 'por-cliente' || tipo === 'por-proveedor') {
      const label = tipo === 'por-cliente' ? 'Cliente' : 'Proveedor';
      const totalTn = analysisRows.reduce((sum, row) => sum + row.tn, 0);
      return {
        head: [label, 'Movimientos', 'Productos', 'Volumen (tn)', '% del total'],
        rows: analysisRows.map((row) => [
          row.nombre,
          row.movimientos,
          row.productos,
          fmtNum(row.tn),
          totalTn ? `${((row.tn / totalTn) * 100).toFixed(1)}%` : '0.0%',
        ]),
        foot: [{ text: `Total: ${analysisSummary.movimientos} movimientos · ${fmtNum(totalTn)} tn`, colSpan: 5 }],
      };
    }
    if (tipo === 'por-chofer') {
      return {
        head: ['Chofer', 'Viajes', 'Entradas (tn)', 'Salidas (tn)', 'Total movido (tn)', 'Productos'],
        rows: analysisRows.map((row) => [
          row.nombre,
          row.movimientos,
          fmtNum(row.entradasTn),
          fmtNum(row.salidasTn),
          fmtNum(row.tn),
          row.productos,
        ]),
        foot: [{
          text: `Total: ${analysisSummary.movimientos} viajes · ${fmtNum(analysisSummary.entradasTn)} tn entradas · ${fmtNum(analysisSummary.salidasTn)} tn salidas · ${fmtNum(analysisSummary.tn)} tn movidas`,
          colSpan: 6,
        }],
      };
    }
    if (tipo === 'por-producto') {
      return {
        head: ['Producto', 'Código', 'Unidad', 'Entradas', 'Entradas (tn)', 'Salidas', 'Salidas (tn)', 'Balance (tn)'],
        rows: analysisRows.map((row) => [
          row.producto,
          row.codigo,
          row.unidad,
          row.entradas,
          fmtNum(row.entradasTn),
          row.salidas,
          fmtNum(row.salidasTn),
          fmtNum(row.balanceTn),
        ]),
        foot: [{
          text: `Total: ${analysisSummary.entradas} entradas · ${fmtNum(analysisSummary.entradasTn)} tn · ${analysisSummary.salidas} salidas · ${fmtNum(analysisSummary.salidasTn)} tn`,
          colSpan: 8,
        }],
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
  }, [tipo, analysisRows, analysisSummary, plantaRows, movRows, totals, esMovimiento]);

  // ==========================================================
  // Exportación a Excel (.xlsx)
  // ==========================================================
  async function handleExportExcel() {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const hoy = formatDateTime(new Date());
      const nombreArchivo = tipo === 'general'
        ? 'Informe_General'
        : `Informe_${reportTitle.replace(/\s+/g, '_')}`;
      const wb = new ExcelJS.Workbook();
      wb.creator = COMPANY.name;
      wb.company = COMPANY.name;
      wb.subject = reportTitle;
      wb.title = reportDisplayTitle;
      wb.created = new Date();
      wb.modified = new Date();

      const logo = await getLogoDataUrl();
      const imageId = wb.addImage({
        base64: logo.slice(logo.indexOf(',') + 1),
        extension: 'png',
      });
      const companyDetails = [
        COMPANY.address,
        [COMPANY.phone, COMPANY.email, COMPANY.cuit && `CUIT ${COMPANY.cuit}`].filter(Boolean).join(' · '),
        COMPANY.web,
      ].filter(Boolean);

      const excelNumber = (value, header) => {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return value ?? '';
        const text = value.trim();
        if (/%$/.test(text) && /%/.test(header)) {
          const percentage = Number(text.slice(0, -1).replace(',', '.'));
          return Number.isFinite(percentage) ? percentage / 100 : value;
        }
        const isNumericColumn =
          /movimientos|viajes|productos|entradas hist\.|salidas hist\.|stock actual|vendido|recibido|entradas \(tn\)|salidas \(tn\)|balance \(tn\)|total movido \(tn\)|volumen \(tn\)|stock \(tn\)|diferencia \(tn\)/i.test(header);
        if (!isNumericColumn || !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) return value;
        const number = Number(text.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(number) ? number : value;
      };

      const buildSheet = ({
        name,
        title,
        headers,
        rows,
        footTexts = [],
        period = periodoLabel,
        filters = filterLabel,
        summary = [],
      }) => {
        const ws = wb.addWorksheet(name);
        ws.properties.defaultRowHeight = 19;
        ws.views = [{ state: 'frozen', ySplit: 13, showGridLines: false }];
        ws.pageSetup = {
          paperSize: ws.PAPER_SIZE_A4,
          orientation: headers.length >= 8 ? 'landscape' : 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.25 },
        };
        ws.headerFooter.oddFooter = `&L${COMPANY.name}&CInforme de ${title}&RPágina &P de &N`;
        ws.columns = headers.map((header, index) => {
          const longestValue = rows.reduce(
            (longest, row) => Math.max(longest, String(row[index] ?? '').length),
            String(header).length
          );
          return { width: Math.min(42, Math.max(index === 0 ? 24 : 14, longestValue + 2)) };
        });

        const lastColumn = headers.length;
        const lastLetter = ws.getColumn(lastColumn).letter;
        const headerRows = [
          [1, COMPANY.name, 18, '172554', 'FFFFFF'],
          [2, COMPANY.tagline, 22, '334155', 'FFFFFF'],
          [3, companyDetails[0] || '', 18, '475569', 'FFFFFF'],
          [4, companyDetails.slice(1).join(' · '), 18, '475569', 'FFFFFF'],
        ];
        headerRows.forEach(([rowNumber, value, height, color, fontColor]) => {
          ws.mergeCells(`C${rowNumber}:${lastLetter}${rowNumber}`);
          const cell = ws.getCell(`C${rowNumber}`);
          cell.value = pdfSafe(value);
          cell.font = {
            name: 'Aptos',
            size: rowNumber === 1 ? 17 : rowNumber === 2 ? 11 : 9,
            bold: rowNumber <= 2,
            color: { argb: `FF${fontColor}` },
          };
          cell.alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(rowNumber).height = height;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
        });
        ws.addImage(imageId, {
          tl: { col: 0.12, row: 0.15 },
          ext: { width: 68, height: 68 },
        });
        ws.getRow(5).height = 8;

        const titleCell = ws.getCell('A6');
        ws.mergeCells(`A6:${lastLetter}6`);
        titleCell.value = pdfSafe(title.toUpperCase());
        titleCell.font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: 'FF0F172A' } };
        titleCell.alignment = { vertical: 'middle' };
        ws.getRow(6).height = 28;

        const metadata = [
          ['Período', period],
          ['Generado', hoy],
          ['Filtros aplicados', filters || 'Sin filtros'],
        ];
        metadata.forEach(([label, value], index) => {
          const row = 7 + index;
          ws.getCell(`A${row}`).value = label;
          ws.getCell(`A${row}`).font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF475569' } };
          ws.mergeCells(`B${row}:${lastLetter}${row}`);
          const valueCell = ws.getCell(`B${row}`);
          valueCell.value = pdfSafe(value || '—');
          valueCell.font = { name: 'Aptos', size: 9, color: { argb: 'FF334155' } };
          valueCell.alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(row).height = index === 2 && String(value || '').length > 100 ? 30 : 19;
        });

        let rowCursor = 11;
        if (summary.length) {
          ws.mergeCells(`A${rowCursor}:${lastLetter}${rowCursor}`);
          const summaryTitle = ws.getCell(`A${rowCursor}`);
          summaryTitle.value = 'RESUMEN EJECUTIVO';
          summaryTitle.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          summaryTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
          summaryTitle.alignment = { vertical: 'middle' };
          ws.getRow(rowCursor).height = 19;
          rowCursor += 1;
          summary.forEach(([label, value]) => {
            ws.mergeCells(`A${rowCursor}:B${rowCursor}`);
            ws.mergeCells(`C${rowCursor}:${lastLetter}${rowCursor}`);
            const labelCell = ws.getCell(`A${rowCursor}`);
            const valueCell = ws.getCell(`C${rowCursor}`);
            labelCell.value = label;
            labelCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF475569' } };
            labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            valueCell.value = value;
            valueCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF0F172A' } };
            valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof value === 'number') valueCell.numFmt = Number.isInteger(value) ? '#,##0' : '#,##0.00;[Red]-#,##0.00';
            ws.getRow(rowCursor).height = 20;
            rowCursor += 1;
          });
        }
        rowCursor += 1;
        const tableHeaderRow = rowCursor;
        const tableRows = rows.map((row) =>
          row.map((value, index) => excelNumber(value, headers[index] || ''))
        );
        ws.addTable({
          name: `Report${wb.worksheets.length}`,
          ref: `A${tableHeaderRow}`,
          headerRow: true,
          style: { theme: 'TableStyleMedium2', showRowStripes: true },
          columns: headers.map((name) => ({ name, filterButton: true })),
          rows: tableRows,
        });
        const tableHeader = ws.getRow(tableHeaderRow);
        tableHeader.height = 28;
        tableHeader.eachCell((cell) => {
          cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = { bottom: { style: 'medium', color: { argb: 'FF0F766E' } } };
        });
        for (let index = 0; index < headers.length; index += 1) {
          const header = headers[index];
          const isPercent = /%/.test(header);
          const isAmount =
            /\(tn\)|vendido|recibido|stock actual|entradas hist\.|salidas hist\.|diferencia/i.test(header);
          if (isPercent || isAmount) {
            for (let row = tableHeaderRow + 1; row <= tableHeaderRow + rows.length; row += 1) {
              const cell = ws.getCell(row, index + 1);
              cell.numFmt = isPercent ? '0.0%' : '#,##0.00;[Red]-#,##0.00;–';
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
          }
        }

        if (footTexts.length) {
          const footerRow = tableHeaderRow + rows.length + 2;
          ws.mergeCells(`A${footerRow}:${lastLetter}${footerRow}`);
          const footer = ws.getCell(`A${footerRow}`);
          footer.value = footTexts.map(pdfSafe).join(' · ');
          footer.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF0F172A' } };
          footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
          footer.alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(footerRow).height = 26;
        }
        ws.views = [{ state: 'frozen', ySplit: tableHeaderRow, showGridLines: false }];
        ws.pageSetup.printArea = `A1:${lastLetter}${tableHeaderRow + rows.length + (footTexts.length ? 2 : 0)}`;
        ws.pageSetup.printTitlesRow = `${tableHeaderRow}:${tableHeaderRow}`;
        return ws;
      };

      if (tipo === 'general' && generalData) {
        buildSheet({
          name: 'Ventas',
          title: 'Informe General · Ventas (salidas)',
          headers: ['Producto', 'Código', 'Unidad', 'Vendido', 'Movimientos', '% del total'],
          rows: generalData.ventas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), r.movs, `${r.pct.toFixed(1)}%`]),
          footTexts: [`Total: ${fmtNum(generalData.ventas.totalTn)} tn`, `${generalData.ventas.movs} remitos`, `${generalData.ventas.contrapartes} clientes`],
          period: `Sección 01 · ${generalData.ventas.periodo}`,
          summary: [
            ['Ventas (tn)', generalData.ventas.totalTn],
            ['Remitos', generalData.ventas.movs],
            ['Clientes', generalData.ventas.contrapartes],
            ['Promedio por venta (tn)', generalData.ventas.promedio],
          ],
        });
        buildSheet({
          name: 'Entradas',
          title: 'Informe General · Entradas',
          headers: ['Producto', 'Código', 'Unidad', 'Recibido', 'Movimientos', '% del total'],
          rows: generalData.entradas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), r.movs, `${r.pct.toFixed(1)}%`]),
          footTexts: [`Total: ${fmtNum(generalData.entradas.totalTn)} tn`, `${generalData.entradas.movs} remitos`, `${generalData.entradas.contrapartes} proveedores`],
          period: `Sección 02 · ${generalData.entradas.periodo}`,
          summary: [
            ['Entradas (tn)', generalData.entradas.totalTn],
            ['Remitos', generalData.entradas.movs],
            ['Proveedores', generalData.entradas.contrapartes],
            ['Promedio por ingreso (tn)', generalData.entradas.promedio],
          ],
        });
        buildSheet({
          name: 'Stock',
          title: 'Informe General · Stock a la fecha',
          headers: ['Producto', 'Código', 'Unidad', 'Entradas hist.', 'Salidas hist.', 'Stock actual', 'Último mov.'],
          rows: generalData.stock.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.e), fmtNum(r.s), fmtNum(r.stock), r.ultimo]),
          footTexts: [`Stock total: ${fmtNum(generalData.stock.totalTn)} tn`, `${generalData.stock.n} materiales`],
          period: 'Acumulado histórico · sin filtros de período',
          summary: [
            ['Stock total (tn)', generalData.stock.totalTn],
            ['Materiales', generalData.stock.n],
            ['Stock negativo', generalData.stock.negativos],
            ['Sin existencias', generalData.stock.ceros],
          ],
        });
        buildSheet({
          name: 'Evolucion',
          title: 'Informe General · Evolución mensual',
          headers: ['Mes', 'Entradas (tn)', 'Salidas (tn)', 'Diferencia (tn)'],
          rows: generalData.evo.meses.map((m) => [m.label, fmtNum(m.e), fmtNum(m.s), fmtNum(m.e - m.s)]),
          footTexts: [`Pico de ventas: ${generalData.evo.pico?.label || '—'}`, `${fmtNum(generalData.evo.pico?.s || 0)} tn`],
          period: 'Últimos 12 meses con movimientos · historial completo',
          summary: [
            ['Promedio mensual de entradas (tn)', generalData.evo.promE],
            ['Promedio mensual de salidas (tn)', generalData.evo.promS],
            ['Mes pico de ventas', generalData.evo.pico?.label || '—'],
            ['Salidas del mes pico (tn)', generalData.evo.pico?.s || 0],
          ],
        });
        buildSheet({
          name: 'Alertas',
          title: 'Informe General · Alertas de stock',
          headers: ['Producto', 'Código', 'Unidad', 'Stock actual', 'Estado'],
          rows: generalData.alertas.rows.map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.stock), r.estado]),
          footTexts: generalData.alertas.rows.length
            ? [`Materiales a revisar: ${generalData.alertas.rows.length}`]
            : ['Sin alertas: ningún material con stock negativo o cero'],
          period: 'Estado actual calculado sobre el historial completo',
          summary: [
            ['Materiales a revisar', generalData.alertas.rows.length],
            ['Stock negativo', generalData.stock.negativos],
            ['Sin existencias', generalData.stock.ceros],
          ],
        });
      } else {
        const summary = tipo === 'por-chofer'
          ? [
              ['Choferes identificados', analysisRows.filter((row) => !row.sinChofer).length],
              ['Viajes', totals.movimientos],
              ['Entradas (tn)', totals.entradasTn],
              ['Salidas (tn)', totals.salidasTn],
              ['Total movido (tn)', totals.tn],
            ]
          : tipo === 'por-cliente' || tipo === 'por-proveedor'
            ? [
                [tipo === 'por-cliente' ? 'Clientes' : 'Proveedores', totals.count],
                ['Movimientos', totals.movimientos],
                ['Volumen (tn)', totals.tn],
              ]
            : tipo === 'por-producto'
              ? [
                  ['Productos', totals.count],
                  ['Entradas (tn)', totals.entradasTn],
                  ['Salidas (tn)', totals.salidasTn],
                  ['Balance (tn)', totals.entradasTn - totals.salidasTn],
                ]
              : tipo === 'por-planta'
                ? [
                    ['Plantas', totals.count],
                    ['Entradas (tn)', totals.entradas],
                    ['Salidas (tn)', totals.salidas],
                    ['Stock (tn)', totals.stock],
                  ]
                : [
                    ['Movimientos', totals.count],
                    ['Volumen (tn)', totals.tn],
                  ];
        buildSheet({
          name: reportTitle.slice(0, 31),
          title: reportDisplayTitle,
          headers: tableData.head,
          rows: tableData.rows,
          footTexts: tableData.foot.map((item) => item.text),
          summary,
        });
      }

      wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nombreArchivo}_${todayISO()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(tipo === 'general'
        ? 'Informe General exportado a Excel (5 hojas profesionales)'
        : 'Informe exportado a Excel');
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
    const res = await fetch(LOGO_PATH);
    if (!res.ok) throw new Error(`No se pudo cargar el logo de la empresa (HTTP ${res.status})`);
    const blob = await res.blob();
    logoCache = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        if (typeof fr.result !== 'string') {
          reject(new Error('No se pudo preparar el logo de la empresa'));
          return;
        }
        resolve(fr.result);
      };
      fr.onerror = () => reject(new Error('No se pudo leer el logo de la empresa'));
      fr.readAsDataURL(blob);
    });
    return logoCache;
  }

  // Anchos de columna (mm) por tipo de informe, para el PDF.
  // La suma de cada fila queda SIEMPRE dentro del área imprimible:
  //   portrait A4 = 210mm -> usable 190 · landscape = 297mm -> usable 277.
  const ANCHOS_PDF = {
    'por-chofer': [{ w: 50 }, { w: 16, a: 'right' }, { w: 28, a: 'right' }, { w: 28, a: 'right' }, { w: 32, a: 'right' }, { w: 20, a: 'right' }],
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
      const headH = 30;
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
      doc.setFontSize(6.2);
      doc.text(pdfSafe(COMPANY.address), margin + 27, margin + 20);
      const datosContacto = [
        COMPANY.phone,
        COMPANY.email,
        COMPANY.cuit && `CUIT ${COMPANY.cuit}`,
        COMPANY.web,
      ].filter(Boolean).join(' · ');
      if (datosContacto) doc.text(pdfSafe(datosContacto), margin + 27, margin + 24);

      // Título a la derecha: se achica si no entra en su mitad.
      const titulo = pdfSafe(reportDisplayTitle.toUpperCase());
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

      // Filtros completos del corte, envueltos sin omitir criterios seleccionados.
      let cursorY = margin + headH + 5.5;
      const filtrosGenerales = tipo === 'general'
        ? [
            `Ventas (01): ${descripcionPeriodo(ventasF.mes, ventasF.anio, ventasF.desde, ventasF.hasta)}`,
            `Entradas (02): ${descripcionPeriodo(entradasF.mes, entradasF.anio, entradasF.desde, entradasF.hasta)}`,
            ...productosSel.map((producto) => `Producto: ${producto}`),
            ...(planta ? [`Planta: ${planta}`] : []),
            ...(razonSocial ? [`Razón social (solo Entradas): ${razonSocial}`] : []),
            ...(contraparte ? [`${contraparteLabel}: ${contraparte}`] : []),
          ].join('  ·  ')
        : filterLabel;
      const filtrosTxt = pdfSafe(filtrosGenerales || 'Sin filtros aplicados');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const flLines = doc.splitTextToSize(filtrosTxt, usable - 10);
      const filterBoxHeight = 10 + flLines.length * 3.2;
      panel(margin, cursorY, usable, filterBoxHeight);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(8, 145, 178);
      doc.text('PERÍODO Y FILTROS APLICADOS', margin + 5, cursorY + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(flLines, margin + 5, cursorY + 8.5);
      cursorY += filterBoxHeight + 4;

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
          doc.roundedRect(margin, margin, usable, 18, 2.5, 2.5, 'FD');
          doc.setFillColor(...col.rgb);
          doc.roundedRect(margin + 1.5, margin + 2, 1.6, 14, 0.8, 0.8, 'F');
          if (logo) doc.addImage(logo, 'PNG', margin + 5, margin + 4, 10, 10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(COMPANY.name), margin + 15.5, margin + 6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe('Sistema de Control de Stock'), margin + 15.5, margin + 10.2);
          doc.setFontSize(5.5);
          doc.text(pdfSafe(COMPANY.address), margin + 15.5, margin + 13.4);
          doc.text(pdfSafe(COMPANY.web), margin + 15.5, margin + 16.2);
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
          const y = margin + 18 + 6;
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
          autoTable(doc, {
            startY: cursorY,
            head: [head.map(pdfSafe)],
            body: rows.map((r) => r.map((c) => pdfSafe(c))),
            theme: 'plain',
            styles: {
              fontSize: 7.5,
              cellPadding: { top: 2.4, right: 2.5, bottom: 2.4, left: 2.5 },
              textColor: [35, 35, 35],
              lineColor: [145, 145, 145],
              lineWidth: 0,
            },
            headStyles: { fillColor: [220, 220, 220], textColor: [20, 20, 20], fontStyle: 'bold', lineWidth: 0, minCellHeight: 8 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            didParseCell: (data) => {
              if (data.section === 'body') {
                if (data.row.index % 2 === 1) data.cell.styles.fillColor = [245, 245, 245];
                if (data.column.index === 0) {
                  data.cell.styles.fontStyle = 'bold';
                  data.cell.styles.textColor = [20, 20, 20];
                }
              }
              if (data.section === 'foot') {
                data.cell.styles.fillColor = [220, 220, 220];
                data.cell.styles.textColor = [20, 20, 20];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.cellPadding = { top: 3, right: 3, bottom: 3, left: 3 };
              }
            },
            didDrawCell: (data) => {
              if (data.section === 'body') {
                doc.setDrawColor(135, 135, 135);
                doc.setLineWidth(0.3);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
              }
            },
            columnStyles: Object.fromEntries(widths.map((spec, i) => [i, { cellWidth: spec?.w ?? spec, halign: spec?.a || 'left' }])),
            didDrawPage: () => cabeceraPagina(colKey, tituloSeccion),
            margin: { left: side, right: side, top: 34, bottom: 16 },
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
          pdfSafe('Nota: cada sección 01 (Ventas) y 02 (Entradas) tiene su propio filtro de período en su parte superior. El stock a la fecha (03) y la evolución mensual (04) siempre usan el historial completo cargado, sin filtros.'),
          margin,
          cursorY
        );

// ===== 01 VENTAS =====
        nuevaPaginaSeccion('01', 'VENTAS — SALIDAS DEL PERÍODO', `${g.ventas.periodo} · ${g.ventas.movs} remitos · ${g.ventas.contrapartes} clientes`, 'ventas');
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
        nuevaPaginaSeccion('02', 'ENTRADAS DE MATERIALES', `${g.entradas.periodo} · ${g.entradas.movs} remitos · ${g.entradas.contrapartes} proveedores`, 'entradas');
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
        nuevaPaginaSeccion('03', 'STOCK A LA FECHA — POR MATERIAL', 'Acumulado de todo el historial · sin filtros', 'stock');
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
                  d.cell.styles.textColor = [20, 20, 20];
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
      } else {
        const resumenPDF = tipo === 'por-chofer'
          ? [
              ['VIAJES', String(totals.movimientos)],
              ['CHOFERES IDENTIFICADOS', String(analysisRows.filter((row) => !row.sinChofer).length)],
              ['ENTRADAS (TN)', fmtNum(totals.entradasTn)],
              ['SALIDAS (TN)', fmtNum(totals.salidasTn)],
              ['TOTAL MOVIDO (TN)', fmtNum(totals.tn)],
            ]
          : tipo === 'por-cliente' || tipo === 'por-proveedor'
            ? [
                [tipo === 'por-cliente' ? 'CLIENTES' : 'PROVEEDORES', String(totals.count)],
                ['MOVIMIENTOS', String(totals.movimientos)],
                ['VOLUMEN (TN)', fmtNum(totals.tn)],
              ]
            : tipo === 'por-producto'
              ? [
                  ['PRODUCTOS', String(totals.count)],
                  ['ENTRADAS (TN)', fmtNum(totals.entradasTn)],
                  ['SALIDAS (TN)', fmtNum(totals.salidasTn)],
                  ['BALANCE (TN)', fmtNum(totals.entradasTn - totals.salidasTn)],
                ]
              : tipo === 'por-planta'
                ? [
                    ['PLANTAS', String(totals.count)],
                    ['ENTRADAS (TN)', fmtNum(totals.entradas)],
                    ['SALIDAS (TN)', fmtNum(totals.salidas)],
                    ['STOCK TOTAL (TN)', fmtNum(totals.stock)],
                  ]
                : [
                    ['MOVIMIENTOS', String(totals.count)],
                    ['VOLUMEN (TN)', fmtNum(totals.tn)],
                  ];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('RESUMEN EJECUTIVO', margin, cursorY + 3.5);
        cursorY += 6;
        const cardGap = 3;
        const cardsPerRow = Math.min(4, resumenPDF.length);
        const cardWidth = (usable - cardGap * (cardsPerRow - 1)) / cardsPerRow;
        const cardHeight = 17;
        resumenPDF.forEach(([label, value], index) => {
          const row = Math.floor(index / cardsPerRow);
          const column = index % cardsPerRow;
          const x = margin + column * (cardWidth + cardGap);
          const y = cursorY + row * (cardHeight + cardGap);
          panel(x, y, cardWidth, cardHeight);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.8);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(label), x + 3, y + 5.3);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(value), x + 3, y + 12.5);
        });
        cursorY += Math.ceil(resumenPDF.length / cardsPerRow) * (cardHeight + cardGap) + 2;

        if (tipo === 'por-chofer' && analysisRows.some((row) => row.sinChofer)) {
          const aviso = 'Los movimientos sin chofer informado permanecen en la tabla como “Sin chofer”; no se atribuyen a una persona ni se incluyen en el gráfico por chofer.';
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          const avisoLines = doc.splitTextToSize(pdfSafe(aviso), usable - 12);
          const avisoH = 7 + avisoLines.length * 3.3;
          doc.setFillColor(255, 251, 235);
          doc.setDrawColor(253, 230, 138);
          doc.roundedRect(margin, cursorY, usable, avisoH, 2.5, 2.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(180, 83, 9);
          doc.text('ACLARACIÓN', margin + 4, cursorY + 4.4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(120, 53, 15);
          doc.text(avisoLines, margin + 4, cursorY + 8);
          cursorY += avisoH + 3;
        }

        if (pieData.length > 0) {
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
      }

      if (!esGeneral) autoTable(doc, {
        startY: cursorY,
        head: [tableData.head.map(pdfSafe)],
        body: tableData.rows.map((row) => row.map((c) => pdfSafe(c))),
        foot: [tableData.foot.map((f) => ({ content: pdfSafe(f.text), colSpan: f.colSpan || 1 }))],
        theme: 'plain',
        styles: {
          fontSize: landscape ? 7.5 : 8.2,
          cellPadding: { top: 2.8, right: 2.8, bottom: 2.8, left: 2.8 },
          textColor: [35, 35, 35],
          lineColor: [145, 145, 145],
          lineWidth: 0,
          overflow: 'linebreak',
        },
        headStyles: { fillColor: [220, 220, 220], textColor: [20, 20, 20], fontStyle: 'bold', lineWidth: 0, minCellHeight: 9 },
        footStyles: { fillColor: [220, 220, 220], textColor: [20, 20, 20], fontStyle: 'bold', minCellHeight: 10 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.row.index % 2 === 1) data.cell.styles.fillColor = [245, 245, 245];
            if (data.column.index === 0) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = [20, 20, 20];
            }
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body') {
            doc.setDrawColor(135, 135, 135);
            doc.setLineWidth(0.3);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
        },
        columnStyles: Object.fromEntries(
          (ANCHOS_PDF[tipo] || ANCHOS_PDF.entradas).map((spec, i) => [
            i,
            { cellWidth: spec?.w ?? spec, halign: spec?.a || 'left' },
          ])
        ),
        horizontalPageBreak: true,
        didDrawPage: (data) => {
          if (data.pageNumber === 1) return;
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(margin, margin, usable, 20, 2.5, 2.5, 'FD');
          if (logo) doc.addImage(logo, 'PNG', margin + 3, margin + 3, 14, 14);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(COMPANY.name), margin + 20, margin + 8);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(pdfSafe(COMPANY.address), margin + 20, margin + 13);
          doc.text(pdfSafe(`${reportDisplayTitle} · ${periodoLabel}`), margin + 20, margin + 17);
        },
        margin: { top: 24, right: margin, bottom: 16, left: margin },
      });

      // --- Pie de página con numeración ---
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(pdfSafe(`${COMPANY.name} · ${reportDisplayTitle}`), margin, pageH - 7);
        doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 7, { align: 'right' });
      }

      const nombreArchivo = tipo === 'general'
        ? 'Informe_General'
        : `Informe_${reportTitle.replace(/\s+/g, '')}`;
      doc.save(`${nombreArchivo}_${todayISO()}.pdf`);
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
      <SectionHero
        icon={IconLayers}
        title="Informes"
        tag="Informes"
        subtitle="Reportes gerenciales con encabezado de empresa"
      >
        <button type="button" onClick={handleExportExcel} className="btn-ghost" title="Descargar informe en Excel">
          <IconFileSpreadsheet className="h-4 w-4" />
          Excel
        </button>
        <button type="button" onClick={handleExportPDF} className="btn-primary" title="Descargar informe en PDF">
          <IconPrinter className="h-4 w-4" />
          PDF
        </button>
      </SectionHero>

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
            <select
              value={tipo}
              onChange={(e) => {
                const nextTipo = e.target.value;
                setTipo(nextTipo);
                if (['salidas', 'por-cliente'].includes(nextTipo)) setRazonSocial('');
                setContraparte('');
                setChofer('');
              }}
              className="field"
            >
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
          {!['salidas', 'por-cliente'].includes(tipo) && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Razón social · solo Entradas
              </span>
              <select value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className="field">
                <option value="" className="bg-night-900">Todas</option>
                {razonSocialOptions.map((nombre) => (
                  <option key={nombre} value={nombre} className="bg-night-900">
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{contraparteLabel}</span>
            <select value={contraparte} onChange={(e) => setContraparte(e.target.value)} className="field">
              <option value="" className="bg-night-900">Todos</option>
              {contraparteOptions.map((c) => (
                <option key={c} value={c} className="bg-night-900">
                  {c}
                </option>
              ))}
            </select>
          </label>
          {tipo === 'por-chofer' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Chofer</span>
              <select value={chofer} onChange={(e) => setChofer(e.target.value)} className="field">
                <option value="" className="bg-night-900">Todos los choferes</option>
                {choferOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-night-900">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

{/* Período: en Informe General se filtra por sección (01/02); en el resto,
            Mes + Año (principal) y Desde/Hasta (detalle secundario). */}
        {tipo === 'general' ? (
          <div className="border-t border-white/10 pt-4">
            <p className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-400">
              <IconCalendar className="mt-0.5 h-4 w-4 shrink-0 text-falpat" />
              <span>
                El período del <strong className="text-slate-200">Informe General</strong> se filtra{' '}
                <strong className="text-slate-200">dentro de cada sección</strong>:&nbsp;01 Ventas y
                02 Entradas tienen su propio filtro de&nbsp;
                <span className="font-semibold text-slate-200">Mes/Año</span> y{' '}
                <span className="font-semibold text-slate-200">Desde → Hasta</span> en la parte
                superior de cada una.
              </span>
            </p>
          </div>
        ) : (
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
        )}
      </div>

      {/* ===== Informe (panel oscuro) ===== */}
      <div className="card font-display relative overflow-hidden !p-0 text-slate-200">
        {/* Línea superior degradada */}
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3), transparent)' }}
        />

        {/* Encabezado de empresa */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
              style={{ boxShadow: 'inset 0 0 24px color-mix(in srgb, var(--accent) 16%, transparent)' }}
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
            <h1 className="omx-brand-gradient text-base font-extrabold uppercase tracking-wide">
              {reportDisplayTitle}
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
          <GeneralBody
            g={generalData}
            ventasF={ventasF}
            setVentasF={setVentasF}
            entradasF={entradasF}
            setEntradasF={setEntradasF}
            anios={anios}
          />
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
              ) : tipo === 'por-chofer' ? (
                <>
                  <ResumenChip label="Choferes identificados" value={String(analysisRows.filter((row) => !row.sinChofer).length)} />
                  <ResumenChip label="Viajes" value={String(totals.movimientos)} />
                  <ResumenChip label="Entradas (tn)" value={fmtNum(totals.entradasTn)} tone="emerald" />
                  <ResumenChip label="Salidas (tn)" value={fmtNum(totals.salidasTn)} tone="volt" />
                </>
              ) : tipo === 'por-cliente' || tipo === 'por-proveedor' ? (
                <>
                  <ResumenChip label={tipo === 'por-cliente' ? 'Clientes' : 'Proveedores'} value={String(totals.count)} />
                  <ResumenChip label="Movimientos" value={String(totals.movimientos)} />
                  <ResumenChip label="Volumen (tn)" value={fmtNum(totals.tn)} accent />
                  <ResumenChip label="Período" value={descripcionPeriodo(mes, anio, desde, hasta)} />
                </>
              ) : tipo === 'por-producto' ? (
                <>
                  <ResumenChip label="Productos" value={String(totals.count)} />
                  <ResumenChip label="Entradas (tn)" value={fmtNum(totals.entradasTn)} tone="emerald" />
                  <ResumenChip label="Salidas (tn)" value={fmtNum(totals.salidasTn)} tone="volt" />
                  <ResumenChip label="Balance período (tn)" value={fmtNum(totals.entradasTn - totals.salidasTn)} accent />
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
            <div className="grid gap-4 px-6 py-6 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
              <ChartCard
                title={
                  tipo === 'por-planta' ? 'Distribución por planta'
                    : tipo === 'por-cliente' ? 'Salidas por cliente (tn)'
                      : tipo === 'por-proveedor' ? 'Entradas por proveedor (tn)'
                        : tipo === 'por-chofer' ? 'Toneladas por chofer identificado'
                        : tipo === 'por-producto' ? 'Volumen por producto (tn)'
                          : 'Distribución por producto'
                }
                icon={IconPieChart}
              >
                <GlamDoughnut
                  labels={pieData.map((d) => d.label)}
                  data={pieData.map((d) => d.value)}
                  colors={pieData.map((d) => d.color)}
                  centerTop={donutCenterTop}
                  centerBottom={donutCenterBottom}
                />
              </ChartCard>
              <div className="omx-stat flex flex-col border p-4 backdrop-blur">
                <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Distribución
                </h3>
                <div className="min-w-0 flex-1 space-y-2 overflow-y-auto">
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
              {tipo === 'por-chofer' && analysisRows.some((row) => row.sinChofer) && (
                <p className="-mt-4 px-6 pb-2 text-[11px] leading-5 text-amber-300">
                  Hay movimientos sin chofer informado; se muestran como “Sin chofer” en la tabla y no se incluyen en el gráfico por chofer.
                </p>
              )}
              {['por-cliente', 'por-proveedor', 'por-chofer', 'por-producto'].includes(tipo) && (
                <p className="-mt-4 px-6 pb-5 text-[11px] leading-5 text-slate-500">
                  Los gráficos y volúmenes se expresan en toneladas; movimientos guardados en kg, unidades, bolsas u otras medidas no se convierten ni se suman a tn.
                </p>
              )}
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
        ? 'linear-gradient(90deg,#d4af37,#f0d060)'
        : accent
          ? 'linear-gradient(90deg, var(--accent), var(--accent-2))'
          : 'linear-gradient(90deg,rgba(255,255,255,0.35),transparent)';
  return (
    <div className="omx-stat relative min-w-0 overflow-hidden border px-4 py-3 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]">
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

function ChipsRow({ stats, color = '#3b82f6' }) {
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

// Panel de filtros de período propio de cada sección del Informe General.
function SeccionFiltro({ estado, onChange, anios }) {
  const activo = Boolean(estado.mes || estado.anio || estado.desde || estado.hasta);
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Filtros de la sección
          {activo && (
            <span className="ml-2 font-semibold normal-case tracking-normal text-falpat">
              · {descripcionPeriodo(estado.mes, estado.anio, estado.desde, estado.hasta)}
            </span>
          )}
        </p>
        {activo && (
          <button
            type="button"
            onClick={() => onChange({ mes: '', anio: '', desde: '', hasta: '' })}
            className="text-[11px] font-semibold text-falpat hover:underline"
          >
            Limpiar filtro
          </button>
        )}
      </div>
      <FiltroPeriodo
        mes={estado.mes}
        anio={estado.anio}
        desde={estado.desde}
        hasta={estado.hasta}
        anios={anios}
        onMes={(m) => onChange({ ...estado, mes: m })}
        onAnio={(a) => onChange({ ...estado, anio: a })}
        onDesde={(d) => onChange({ ...estado, desde: d })}
        onHasta={(h) => onChange({ ...estado, hasta: h })}
      />
    </div>
  );
}

function GeneralBody({ g, ventasF, setVentasF, entradasF, setEntradasF, anios }) {
  return (
    <div className="space-y-5 px-4 py-5 sm:px-6">
      {/* ===== 01 VENTAS ===== */}
      <SectionShell
        num="01"
        titulo="Ventas — Salidas del período"
        sub={`${g.ventas.periodo} · ${g.ventas.movs} remitos · ${g.ventas.contrapartes} clientes · promedio ${fmtNum(g.ventas.promedio)} tn por venta`}
        colorKey="ventas"
      >
        <SeccionFiltro estado={ventasF} onChange={setVentasF} anios={anios} />
        <ChipsRow
          color={SECCION_COLORS.ventas.hex}
          stats={[
            ['Vendido (tn)', fmtNum(g.ventas.totalTn)],
            ['Remitos de salida', String(g.ventas.movs)],
            ['Clientes', String(g.ventas.contrapartes)],
            ['Promedio por venta', `${fmtNum(g.ventas.promedio)} tn`],
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
          <ChartCard title="Distribución de ventas por producto" icon={IconArrowUpRight}>
            <GlamDoughnut
              labels={g.ventas.pie.map((d) => d.label)}
              data={g.ventas.pie.map((d) => d.value)}
              colors={g.ventas.pie.map((d) => d.color)}
              centerTop="Ventas totales"
              centerBottom={fmtNum(g.ventas.totalTn)}
            />
          </ChartCard>
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
            <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Distribución de ventas
            </h3>
            <div className="w-full space-y-2 overflow-y-auto">
              {g.ventas.pie.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500">Sin datos</p>
              ) : (
                g.ventas.pie.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={d.label}>
                      {d.label}
                    </span>
                    <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-white">
                      {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                    </span>
                    <span className="w-12 text-right font-mono tabular-nums text-slate-500">{d.pct.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <MiniTable
          head={['Producto', 'Código', 'Unidad', 'Vendido', 'Movs', '% total']}
          rows={g.ventas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`])}
        />
      </SectionShell>

      {/* ===== 02 ENTRADAS ===== */}
      <SectionShell
        num="02"
        titulo="Entradas de materiales"
        sub={`${g.entradas.periodo} · ${g.entradas.movs} remitos · ${g.entradas.contrapartes} proveedores · promedio ${fmtNum(g.entradas.promedio)} tn por ingreso`}
        colorKey="entradas"
      >
        <SeccionFiltro estado={entradasF} onChange={setEntradasF} anios={anios} />
        <ChipsRow
          color={SECCION_COLORS.entradas.hex}
          stats={[
            ['Recibido (tn)', fmtNum(g.entradas.totalTn)],
            ['Remitos de entrada', String(g.entradas.movs)],
            ['Proveedores', String(g.entradas.contrapartes)],
            ['Promedio por ingreso', `${fmtNum(g.entradas.promedio)} tn`],
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
          <ChartCard title="Distribución de entradas por producto" icon={IconArrowDownLeft}>
            <GlamDoughnut
              labels={g.entradas.pie.map((d) => d.label)}
              data={g.entradas.pie.map((d) => d.value)}
              colors={g.entradas.pie.map((d) => d.color)}
              centerTop="Entradas totales"
              centerBottom={fmtNum(g.entradas.totalTn)}
            />
          </ChartCard>
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
            <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Distribución de entradas
            </h3>
            <div className="w-full space-y-2 overflow-y-auto">
              {g.entradas.pie.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500">Sin datos</p>
              ) : (
                g.entradas.pie.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={d.label}>
                      {d.label}
                    </span>
                    <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-white">
                      {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                    </span>
                    <span className="w-12 text-right font-mono tabular-nums text-slate-500">{d.pct.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <MiniTable
          head={['Producto', 'Código', 'Unidad', 'Recibido', 'Movs', '% total']}
          rows={g.entradas.rows.slice(0, 15).map((r) => [r.producto, r.codigo, r.unit, fmtNum(r.cant), String(r.movs), `${r.pct.toFixed(1)}%`])}
        />
      </SectionShell>

      {/* ===== 03 STOCK A LA FECHA ===== */}
      <SectionShell
        num="03"
        titulo="Stock a la fecha — por material"
        sub="Todo el historial cargado (sin filtros) · ordenado por nombre"
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
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
          <ChartCard title="Composición del stock actual" icon={IconBox}>
            <GlamDoughnut
              labels={g.stock.pie.map((d) => d.label)}
              data={g.stock.pie.map((d) => d.value)}
              colors={g.stock.pie.map((d) => d.color)}
              centerTop="Stock actual"
              centerBottom={fmtNum(g.stock.totalTn)}
            />
          </ChartCard>
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
            <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Composición del stock
            </h3>
            <div className="w-full space-y-2 overflow-y-auto">
              {g.stock.pie.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500">Sin datos</p>
              ) : (
                g.stock.pie.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={d.label}>
                      {d.label}
                    </span>
                    <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-white">
                      {d.unit ? fmtNum(d.value, d.unit) : fmtNum(d.value)}
                    </span>
                    <span className="w-12 text-right font-mono tabular-nums text-slate-500">{d.pct.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <ChartCard title="Entradas vs Salidas por mes" icon={IconLayers}>
            <GlamBars
              labels={g.evo.meses.map((m) => m.label)}
              datasets={[
                {
                  label: 'Entradas',
                  data: g.evo.meses.map((m) => m.e),
                  backgroundColor: 'rgba(16,185,129,0.85)',
                },
                {
                  label: 'Salidas',
                  data: g.evo.meses.map((m) => m.s),
                  backgroundColor: 'rgba(56,189,248,0.85)',
                },
              ]}
            />
          </ChartCard>
          <ChartCard title="Evolución de salidas (ventas)" icon={IconScale}>
            <GlamLine
              labels={g.evo.meses.map((m) => m.label)}
              data={g.evo.meses.map((m) => m.s)}
              color="#d4af37"
              rgb="212,175,55"
            />
          </ChartCard>
        </div>
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
