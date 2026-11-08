'use client';

// ============================================================
// app/page.js
// Panel principal de GRUPO FALPAT SRL (pantalla de ingreso/egreso):
// - Botones de acceso rápido "Registrar Entrada" / "Registrar Salida".
// - Navegador del último registro con flechas anterior/siguiente.
// - Tabla responsiva con TODOS los registros (ordenable + paginación).
// - Búsqueda en tiempo real.
// ============================================================
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate, normalizeText, cn, toMillis, anioMes, descripcionPeriodo } from '@/lib/utils';
import SearchBar from '@/components/SearchBar';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import FiltrosAplicados from '@/components/FiltrosAplicados';
import SectionHero from '@/components/SectionHero';
import { LOGO_PATH } from '@/lib/company';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconPlus,
  IconRefresh,
  IconAlert,
  IconTrash,
  IconBox,
  IconLayout,
  IconFileText,
  IconUser,
  IconTruck,
  IconScale,
  IconBuilding,
  IconChevronUp,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
} from '@/components/Icons';

// La tabla ya no tiene tope: se muestra todo lo cargado, con paginación.
const PAGE_SIZE_OPTIONS = [
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '250', value: 250 },
  { label: 'Todo', value: 'all' },
];
const DEFAULT_PAGE_SIZE = 100;

const COLUMNS = [
  { key: 'producto', label: 'Producto', type: 'text' },
  { key: 'codigoProducto', label: 'Código', type: 'text' },
  { key: 'fechaRemito', label: 'Fecha', type: 'date' },
  { key: 'carga', label: 'Carga', type: 'text' },
  { key: 'patente', label: 'Patente', type: 'text' },
  { key: 'chofer', label: 'Chofer', type: 'text' },
  { key: 'nroRemitoFalpat', label: 'Nro Falpat', type: 'text' },
  { key: 'nroRemitoProveedor', label: 'Remito Proveedor', type: 'text' },
  { key: 'proveedorCliente', label: 'Proveedor / Cliente', type: 'text' },
  { key: 'razonSocial', label: 'Razón Social', type: 'text' },
  { key: 'pesoProveedor', label: 'Peso Proveedor', type: 'number' },
  { key: 'pesoBalanza', label: 'Peso Balanza', type: 'number' },
  { key: 'planta', label: 'CD', type: 'text' },
];

// Valor numérico de un peso con unidad ("35.4 tn", "1000 u", "").
function numeroPeso(v) {
  const raw = String(v ?? '').replace(/[^\d.,+-]/g, '');
  if (!raw) return null;

  const separator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let normalized = raw;
  if (separator >= 0) {
    const digitsAfter = raw.length - separator - 1;
    const integer = raw.slice(0, separator).replace(/[.,]/g, '');
    const fraction = raw.slice(separator + 1).replace(/[.,]/g, '');
    normalized =
      digitsAfter === 3 && integer
        ? raw.replace(/[.,]/g, '')
        : `${integer}.${fraction}`;
  }
  const weight = Number(normalized);
  return Number.isFinite(weight) ? weight : null;
}

function getSortValue(r, key) {
  if (key === 'fechaRemito') return toMillis(r.fechaRemito);
  if (key === 'pesoBalanza' || key === 'pesoProveedor') return numeroPeso(r[key]);
  if (key === 'proveedorCliente') return r.carga === 'Entrada' ? r.proveedor || '' : r.cliente || '';
  const value = r[key];
  return value == null || String(value).trim() === '' ? null : String(value);
}

function getColumnText(record, key) {
  if (key === 'proveedorCliente') return record.carga === 'Entrada' ? record.proveedor || '—' : record.cliente || '—';
  if (key === 'razonSocial') return record.carga === 'Entrada' ? record.razonSocial || '—' : '—';
  if (key === 'fechaRemito') return formatDate(record.fechaRemito);
  return record[key] == null || record[key] === '' ? '—' : String(record[key]);
}

function SortHeader({
  column,
  sort,
  onSort,
  onAutoFit,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeBy,
}) {
  const active = sort.key === column.key;
  const up = active && sort.dir === 'asc';
  const down = active && sort.dir === 'desc';
  return (
    <th
      className="relative px-2 py-2"
      title={`Ordenar por ${column.label}. Arrastrá el borde derecho para cambiar el ancho o hacé doble clic para ajustar al contenido.`}
      onDoubleClick={(event) => {
        if (event.clientX < event.currentTarget.getBoundingClientRect().right - 8) return;
        event.preventDefault();
        event.stopPropagation();
        onAutoFit();
      }}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] transition hover:text-slate-200',
          active ? 'text-falpat-soft' : 'text-slate-500'
        )}
      >
        {column.label}
        <span className="flex flex-col leading-none">
          <IconChevronUp className={cn('h-2.5 w-2.5', up ? 'text-falpat' : 'text-slate-700')} />
          <IconChevronDown className={cn('h-2.5 w-2.5', down ? 'text-falpat' : 'text-slate-700')} />
        </span>
      </button>
      <div
        role="separator"
        aria-label={`Cambiar ancho de la columna ${column.label}`}
        aria-orientation="vertical"
        tabIndex={0}
        className="absolute inset-y-0 right-0 z-10 w-2 touch-none cursor-col-resize border-r border-white/20 hover:bg-falpat/40 focus:bg-falpat/50"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onLostPointerCapture={onResizeEnd}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          onResizeBy(event.key === 'ArrowRight' ? 16 : -16);
        }}
      />
    </th>
  );
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.05] ${className}`} />;
}

function ModeBadge({ online }) {
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ' +
        (online
          ? 'border-falpat/40 bg-falpat/10 text-falpat-soft'
          : 'border-red-500/40 bg-red-500/10 text-red-400')
      }
    >
      <span className="relative flex h-2 w-2">
        <span
          className={
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ' +
            (online ? 'bg-falpat' : 'bg-red-400')
          }
        />
        <span
          className={'relative inline-flex h-2 w-2 rounded-full ' + (online ? 'bg-falpat' : 'bg-red-400')}
        />
      </span>
      {online ? 'GitHub · sincronizado' : 'Sin conexión'}
    </span>
  );
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

function EmptyState({ filtered }) {
  const { openModal } = useApp();
  return (
    <div className="card flex flex-col items-center justify-center gap-4 border-dashed py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-falpat/30 bg-falpat/10 text-falpat">
        <IconBox className="h-8 w-8" />
      </div>
      <div>
        <p className="text-base font-semibold text-slate-100">
          {filtered ? 'Sin resultados para la búsqueda' : 'Todavía no hay registros'}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          {filtered
            ? 'Probá con otro término o borrá el filtro.'
            : 'Cargá el primer movimiento de stock usando el botón.'}
        </p>
      </div>
      {!filtered && (
        <button type="button" onClick={openModal} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Agregar registro
        </button>
      )}
    </div>
  );
}

function BadgeCarga({ carga }) {
  const isEntrada = carga === 'Entrada';
  return (
    <span className={isEntrada ? 'badge badge-entrada' : 'badge badge-salida'}>
      {isEntrada ? (
        <IconArrowUpRight className="h-3 w-3" />
      ) : (
        <IconArrowDownLeft className="h-3 w-3" />
      )}
      {carga}
    </span>
  );
}

function MiniStat({ label, value, accent = 'text-slate-100' }) {
  return (
    <div className="omx-stat flex flex-col items-center border px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`font-mono text-sm font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}

// Navegador del registro actual: permite recorrer con flechas el historial
// (anterior = registro más antiguo, siguiente = más reciente).
// Una sola línea compacta con todos los datos del registro.
function RecordNavigator({ record, index, total, onPrev, onNext, onEdit }) {
  if (!record) return null;
  const isEntrada = record.carga === 'Entrada';
  const navBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-falpat/40 hover:bg-falpat/10 hover:text-falpat-soft disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:bg-white/[0.03] disabled:hover:text-slate-300';
  return (
    <div className="card relative w-full overflow-hidden !px-4 !py-3">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ background: isEntrada ? '#3b82f6' : '#d4af37' }}
      />
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={index <= 0}
          className={navBtn}
          title="Registro más reciente"
          aria-label="Ir al registro más reciente"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <BadgeCarga carga={record.carga} />
          <span className="font-mono tabular-nums text-slate-400">{formatDate(record.fechaRemito)}</span>
          <span className="max-w-[180px] truncate text-sm font-bold text-slate-100">
            {record.producto || '—'}
          </span>
          {record.codigoProducto && (
            <span className="inline-flex rounded-md border border-falpat/30 bg-falpat/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-falpat-soft">
              {record.codigoProducto}
            </span>
          )}
          <span className="flex items-center gap-1.5 font-mono text-slate-300">
            <IconFileText className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {record.nroRemitoFalpat || '—'}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-slate-300">
            <IconFileText className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {record.nroRemitoProveedor || '—'}
          </span>
          <span className="flex items-center gap-1.5">
            <IconTruck className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="font-mono font-semibold uppercase tracking-wide text-slate-200">
              {record.patente || '—'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <IconUser className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="max-w-[110px] truncate text-slate-400" title={record.chofer}>
              {record.chofer || '—'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <IconUser className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="max-w-[130px] truncate text-slate-400" title={isEntrada ? record.proveedor : record.cliente}>
              {isEntrada ? record.proveedor : record.cliente || '—'}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-slate-400">
            <IconScale className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {record.pesoProveedor || '—'}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-slate-400">
            <IconScale className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {record.pesoBalanza || '—'}
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <IconBuilding className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {record.planta || '—'}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] tabular-nums text-slate-500">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="btn-ghost !px-2 !py-1 text-[11px]"
            title="Editar registro"
          >
            <IconPencil className="h-3.5 w-3.5" />
            Editar
          </button>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={index >= total - 1}
          className={navBtn}
          title="Registro anterior"
          aria-label="Ir al registro anterior"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TableRow({ record, onEdit, onDelete, onSelect }) {
  const isEntrada = record.carga === 'Entrada';
  return (
    <tr
      onClick={() => onSelect?.(record)}
      className="cursor-pointer border-b border-white/[0.05] transition last:border-0 hover:bg-white/[0.03]"
    >
      <td className="px-2 py-2">
        <span className="block w-full truncate text-xs font-semibold text-falpat-soft" title={record.producto}>
          {record.producto || '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2">
        {record.codigoProducto ? (
          <span className="inline-flex rounded-md border border-falpat/30 bg-falpat/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-falpat-soft">
            {record.codigoProducto}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs tabular-nums text-slate-300">
        {formatDate(record.fechaRemito)}
      </td>
      <td className="whitespace-nowrap px-2 py-2">
        <BadgeCarga carga={record.carga} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-slate-100">
        {record.patente}
      </td>
      <td className="px-2 py-2">
        <span className="block w-full truncate text-xs text-slate-300" title={record.chofer}>
          {record.chofer}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-300">
        {record.nroRemitoFalpat}
      </td>
      <td className="px-2 py-2">
        <span className="block w-full truncate font-mono text-xs text-slate-300" title={record.nroRemitoProveedor}>
          {record.nroRemitoProveedor || '—'}
        </span>
      </td>
      <td className="px-2 py-2">
        {isEntrada ? (
          <span
            className="block w-full truncate text-xs font-semibold text-slate-200"
            title={record.proveedor}
          >
            {record.proveedor || '—'}
          </span>
        ) : (
          <span className="block w-full truncate text-xs" title={record.cliente}>
            {record.cliente || '—'}
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        <span className="block w-full truncate text-xs text-slate-300" title={record.razonSocial}>
          {isEntrada ? record.razonSocial || '—' : '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-400">{record.pesoProveedor || '—'}</td>
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-300">{record.pesoBalanza}</td>
      <td className="px-2 py-2">
        <span className="block w-full truncate text-xs text-slate-300" title={record.planta}>
          {record.planta}
        </span>
      </td>
      <td className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-2 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-falpat/10 hover:text-falpat-soft"
            aria-label="Editar registro"
            title="Editar registro"
          >
            <IconPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(record.id)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
            aria-label="Eliminar registro"
            title="Eliminar registro"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-white/[0.05] last:border-0">
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-2 py-4"><Skeleton className="h-4 w-10" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="px-2 py-4"><Skeleton className="h-5 w-20" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-28" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-2 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-2 py-4"><Skeleton className="h-5 w-8" /></td>
        </tr>
      ))}
    </>
  );
}

export default function Home() {
  const { records, loading, error, reload, deleteRecord, openEdit, openModal, showToast } = useApp();
  const tableRef = useRef(null);
  const tableDragRef = useRef(null);
  const columnResizeRef = useRef(null);
  const suppressTableClickRef = useRef(false);
  const [query, setQuery] = useState('');
  const [cargaFiltro, setCargaFiltro] = useState('Todos');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [sort, setSort] = useState({ key: 'fechaRemito', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [navIndex, setNavIndex] = useState(0);
  const [columnWidths, setColumnWidths] = useState(null);

  // Años disponibles para el filtro de período.
  const anios = useMemo(
    () =>
      [...new Set(records.map((r) => anioMes(r.fechaRemito)?.anio).filter(Boolean))].sort(
        (a, b) => b - a
      ),
    [records]
  );

  // Cualquier cambio de búsqueda/orden/tamaño vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [query, sort, pageSize, cargaFiltro, mes, anio]);

  // Mantiene el navegador dentro del rango cuando cambian los datos.
  useEffect(() => {
    setNavIndex((i) => (records.length === 0 ? 0 : Math.min(i, records.length - 1)));
  }, [records]);

  // Búsqueda en tiempo real
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return records.filter((r) => {
      if (cargaFiltro !== 'Todos' && r.carga !== cargaFiltro) return false;
      const ym = anioMes(r.fechaRemito);
      if (anio && ym?.anio !== Number(anio)) return false;
      if (mes && ym?.mes !== Number(mes)) return false;
      if (!q) return true;
      const haystack = normalizeText(
        [
          r.producto,
          r.codigoProducto,
          r.patente,
          r.chofer,
          r.nroRemitoFalpat,
          r.nroRemitoProveedor,
          r.proveedor,
          r.cliente,
          r.razonSocial,
          r.planta,
          r.pesoBalanza,
          formatDate(r.fechaRemito),
        ].join(' ')
      );
      return haystack.includes(q);
    });
  }, [records, query, cargaFiltro, mes, anio]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = getSortValue(a, key);
      const vb = getSortValue(b, key);
      const missingA = va == null || String(va).trim() === '';
      const missingB = vb == null || String(vb).trim() === '';
      if (missingA !== missingB) return missingA ? 1 : -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base', numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const size = pageSize === 'all' ? sorted.length : pageSize;
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, pageCount);
  const from = (safePage - 1) * size;
  const visible = sorted.slice(from, from + size);
  const rangeLabel =
    sorted.length === 0
      ? 'Sin registros'
      : `${from + 1}–${Math.min(from + visible.length, sorted.length)} de ${sorted.length}`;

  function onSort(key) {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'fechaRemito' ? 'desc' : 'asc' };
    });
  }

  function autoFitColumn(index, column) {
    const table = tableRef.current;
    if (!table) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      showToast('No se pudo medir el contenido para ajustar la columna.', 'error');
      return;
    }

    const textCell = table.querySelector(`tbody tr td:nth-child(${index + 1})`);
    const textStyle = textCell ? window.getComputedStyle(textCell) : null;
    context.font = textStyle?.font || (column.type === 'number' ? '12px monospace' : '12px Arial');
    const letterSpacing = parseFloat(textStyle?.letterSpacing || '0') || 0;
    const contentWidth = sorted.reduce((maxWidth, record) => {
      const value = getColumnText(record, column.key);
      const measuredWidth =
        context.measureText(value).width + letterSpacing * Math.max(0, value.length - 1);
      return Math.max(maxWidth, measuredWidth);
    }, 0);
    const headerButton = table.querySelector(`thead th:nth-child(${index + 1}) button`);
    const headerStyle = headerButton ? window.getComputedStyle(headerButton) : null;
    context.font = headerStyle?.font || 'bold 10px Arial';
    const headerWidth = context.measureText(column.label.toUpperCase()).width + 20;
    const fittedWidth = Math.max(64, Math.ceil(Math.max(contentWidth, headerWidth) + 24));
    const currentWidths = getCurrentColumnWidths(table);
    currentWidths[index] = fittedWidth;
    setColumnWidths(currentWidths);
  }

  function getCurrentColumnWidths(table = tableRef.current) {
    if (!table) return [];
    if (columnWidths) return [...columnWidths];
    return Array.from(table.querySelectorAll('thead th'), (header) =>
      Math.ceil(header.getBoundingClientRect().width)
    );
  }

  function startColumnResize(index, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const table = tableRef.current;
    if (!table) return;
    const widths = getCurrentColumnWidths(table);
    columnResizeRef.current = {
      pointerId: event.pointerId,
      index,
      startX: event.clientX,
      startWidth: widths[index],
      widths,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveColumnResize(event) {
    const resize = columnResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const widths = [...resize.widths];
    widths[resize.index] = Math.max(64, resize.startWidth + event.clientX - resize.startX);
    setColumnWidths(widths);
    event.preventDefault();
    event.stopPropagation();
  }

  function stopColumnResize(event) {
    const resize = columnResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    columnResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  }

  function resizeColumnBy(index, amount) {
    const widths = getCurrentColumnWidths();
    if (!widths.length) return;
    widths[index] = Math.max(64, widths[index] + amount);
    setColumnWidths(widths);
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    try {
      await deleteRecord(id);
    } catch (err) {
      showToast(`Error al eliminar: ${err.message}`, 'error');
    }
  }

  const navRecord = records[navIndex] || null;

  // Resumen para las mini tarjetas del navegador.
  const stats = useMemo(() => {
    let entradas = 0;
    let salidas = 0;
    for (const r of records) {
      if (r.carga === 'Entrada') entradas += 1;
      else salidas += 1;
    }
    return { entradas, salidas, total: records.length };
  }, [records]);

  // Filtros activos para mostrar qué se está viendo.
  const filtrosAplicados = useMemo(() => {
    const items = [];
    if (cargaFiltro !== 'Todos') {
      items.push(`Carga: ${cargaFiltro === 'Entrada' ? 'Entradas' : 'Salidas'}`);
    }
    const periodo = descripcionPeriodo(mes, anio, '', '');
    if (periodo !== 'Todo el historial') items.push(`Período: ${periodo}`);
    if (query) items.push(`Búsqueda: "${query}"`);
    return items;
  }, [cargaFiltro, mes, anio, query]);

  function clearFilters() {
    setQuery('');
    setCargaFiltro('Todos');
    setMes('');
    setAnio('');
  }

  function startTableDrag(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target.closest('button, a, input, select, textarea, th')) return;
    tableDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTableDrag(event) {
    const drag = tableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) < 5) return;
    drag.moved = true;
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
    event.preventDefault();
  }

  function stopTableDrag(event) {
    const drag = tableDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    tableDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressTableClickRef.current = true;
      window.setTimeout(() => {
        suppressTableClickRef.current = false;
      }, 0);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHero
        icon={IconLayout}
        title="Inicio"
        tag="Stock"
        subtitle={`Resumen de movimientos · ${new Date().toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
      >
        <ModeBadge online={!error} />
        <button
          type="button"
          onClick={reload}
          className="btn-ghost"
          disabled={loading}
          title="Recargar datos"
        >
          <IconRefresh className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </SectionHero>

      {error && <ErrorPanel message={error} onRetry={reload} />}

      <section
        aria-labelledby="home-hero-title"
        className="relative isolate overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#07101b] shadow-[0_30px_90px_-55px_rgba(0,0,0,0.95)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 12% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 48%), radial-gradient(ellipse at 100% 100%, color-mix(in srgb, #facc15 9%, transparent), transparent 42%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.035),transparent_44%,rgba(255,255,255,0.015))]" />

        <div className="relative grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col items-start p-6 sm:p-9 lg:p-11">
            <div className="mb-7 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
                <Image
                  src={LOGO_PATH}
                  alt="Grupo FALPAT SRL"
                  width={44}
                  height={44}
                  className="h-full w-full object-contain"
                  priority
                />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-100">
                  Grupo FALPAT SRL
                </p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Gestión de materiales · Luján
                </p>
              </div>
            </div>

            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-falpat/25 bg-falpat/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-falpat-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-falpat shadow-glow" />
              Control operativo de stock
            </p>
            <h2
              id="home-hero-title"
              className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl xl:text-[3.25rem]"
            >
              Cada material y cada movimiento,{' '}
              <span className="bg-gradient-to-r from-falpat-soft via-white to-volt bg-clip-text text-transparent">
                bajo control.
              </span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Un socio confiable en tu obra. Registrá entradas y salidas, consultá
              remitos y seguí los movimientos de materiales en un solo lugar.
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500 sm:text-sm">
              En línea con el compromiso de FALPAT con la calidad, el soporte técnico
              y el acompañamiento logístico para cada proyecto.
            </p>

            <div className="mt-7 flex w-full flex-wrap gap-2.5">
              <Link
                href="/tickets"
                className="btn-primary whitespace-nowrap !px-4 !py-2.5 !text-[12px]"
                title="Leer remitos PDF para registrar una entrada"
              >
                <IconFileText className="h-3.5 w-3.5" />
                Cargar Entrada PDF
              </Link>
              <button
                type="button"
                onClick={() => openModal('Entrada')}
                className="btn-ghost whitespace-nowrap !px-4 !py-2.5 !text-[12px]"
                title="Registrar manualmente una entrada"
              >
                <IconArrowUpRight className="h-3.5 w-3.5" />
                Entrada manual
              </button>
              <button
                type="button"
                onClick={() => openModal('Salida')}
                className="btn-volt whitespace-nowrap !px-4 !py-2.5 !text-[12px]"
                title="Registrar una salida de material"
              >
                <IconArrowDownLeft className="h-3.5 w-3.5" />
                Registrar salida
              </button>
            </div>

            <a
              href="https://hormigon.grupofalpat.com.ar/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition hover:text-falpat-soft"
            >
              Conocé Grupo FALPAT
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <aside className="relative flex flex-col justify-between border-t border-white/[0.07] bg-black/20 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Vista general
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white">Operación diaria</h3>
                </div>
                <span className="rounded-lg border border-white/10 bg-white/[0.035] p-2 text-falpat-soft">
                  <IconBox className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <MiniStat label="Entradas" value={stats.entradas} accent="text-falpat-soft" />
                <MiniStat label="Salidas" value={stats.salidas} accent="text-volt" />
                <MiniStat label="Movimientos" value={stats.total} />
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <span className="mt-0.5 text-falpat-soft"><IconFileText className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Entradas con respaldo</p>
                    <p className="mt-1 text-[10px] leading-5 text-slate-500">Carga manual o lectura de remitos PDF.</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <span className="mt-0.5 text-volt"><IconArrowDownLeft className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Salidas registradas</p>
                    <p className="mt-1 text-[10px] leading-5 text-slate-500">Seguimiento de despachos y destinos.</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <span className="mt-0.5 text-sky-300"><IconScale className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Consulta y trazabilidad</p>
                    <p className="mt-1 text-[10px] leading-5 text-slate-500">Buscá, filtrá y revisá el historial de movimientos.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-slate-500">
              <IconBuilding className="h-3.5 w-3.5 shrink-0 text-falpat-soft" />
              <span>Ruta 6 y 34 km 156 · Luján, Buenos Aires</span>
            </div>
          </aside>
        </div>
      </section>

      {/* Visor del registro actual */}
      {loading ? (
        <div className="card mx-auto w-full space-y-3 lg:max-w-4xl">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="mx-auto w-full lg:max-w-4xl">
          <RecordNavigator
            record={navRecord}
            index={navIndex}
            total={records.length}
            onPrev={() => setNavIndex((i) => Math.max(0, i - 1))}
            onNext={() => setNavIndex((i) => Math.min(records.length - 1, i + 1))}
            onEdit={openEdit}
          />
        </div>
      )}

      {/* Tabla de últimos registros */}
      <div id="movimientos" className="card scroll-mt-36 overflow-hidden !p-0">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Movimientos de stock</h2>
              <p className="section-sub mt-0.5">
                {rangeLabel} registros · arrastrá con el botón izquierdo o deslizá horizontalmente con el touchpad
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1" title="Filtrar por tipo de carga">
                {[
                  { v: 'Todos', l: 'Todos' },
                  { v: 'Entrada', l: 'Entradas' },
                  { v: 'Salida', l: 'Salidas' },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setCargaFiltro(o.v)}
                    className={
                      'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
                      (cargaFiltro === o.v
                        ? 'bg-falpat/20 text-falpat-soft shadow'
                        : 'text-slate-400 hover:text-slate-200')
                    }
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <SearchBar value={query} onChange={setQuery} />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 lg:flex-row lg:items-end lg:justify-between">
            <FiltroPeriodo
              mes={mes}
              anio={anio}
              desde=""
              hasta=""
              anios={anios}
              onMes={setMes}
              onAnio={setAnio}
              showDetalle={false}
            />
            <FiltrosAplicados items={filtrosAplicados} onLimpiar={filtrosAplicados.length ? clearFilters : undefined} />
          </div>
        </div>

        {loading ? (
          <div className="table-scroll">
            <table className="w-full min-w-[1180px] border-collapse">
              <tbody>
                <TableSkeleton />
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              filtered={Boolean(query) || cargaFiltro !== 'Todos' || Boolean(mes) || Boolean(anio)}
            />
          </div>
        ) : (
          <>
            <div
              className="table-scroll cursor-grab active:cursor-grabbing"
              role="region"
              aria-label="Tabla de movimientos de stock"
              tabIndex={0}
              onPointerDown={startTableDrag}
              onPointerMove={moveTableDrag}
              onPointerUp={stopTableDrag}
              onPointerCancel={stopTableDrag}
              onClickCapture={(event) => {
                if (!suppressTableClickRef.current) return;
                event.preventDefault();
                event.stopPropagation();
                suppressTableClickRef.current = false;
              }}
              onWheel={(event) => {
                if (event.shiftKey && event.deltaX === 0 && event.deltaY !== 0) {
                  event.currentTarget.scrollLeft += event.deltaY;
                  event.preventDefault();
                }
              }}
            >
              <table
                ref={tableRef}
                className="stock-movements-table w-full min-w-[1180px] border-collapse text-left"
                style={columnWidths ? { tableLayout: 'fixed' } : undefined}
              >
                {columnWidths && (
                  <colgroup>
                    {columnWidths.map((width, index) => (
                      <col key={index} style={{ width }} />
                    ))}
                  </colgroup>
                )}
                <thead>
                  <tr className="border-b border-white/10">
                    {COLUMNS.map((col, index) => (
                      <SortHeader
                        key={col.key}
                        column={col}
                        sort={sort}
                        onSort={onSort}
                        onAutoFit={() => autoFitColumn(index, col)}
                        onResizeStart={(event) => startColumnResize(index, event)}
                        onResizeMove={moveColumnResize}
                        onResizeEnd={stopColumnResize}
                        onResizeBy={(amount) => resizeColumnBy(index, amount)}
                      />
                    ))}
                    <th className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => (
                    <TableRow
                      key={record.id}
                      record={record}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onSelect={(r) => setNavIndex(Math.max(0, records.indexOf(r)))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Mostrando {rangeLabel} registros · arrastrá el borde derecho para cambiar el ancho o hacé doble clic para mostrar el contenido
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Filas por página
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="field !w-auto !py-1.5 text-xs"
                  >
                    {PAGE_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    title="Página anterior"
                  >
                    Anterior
                  </button>
                  <span className="px-1 text-xs tabular-nums text-slate-400">
                    Pág. {safePage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    title="Página siguiente"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
