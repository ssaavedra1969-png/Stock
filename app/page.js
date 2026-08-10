'use client';

// ============================================================
// app/page.js
// Panel principal de GRUPO FALPAT SRL (pantalla de ingreso/egreso):
// - Botones de acceso rápido "Registrar Entrada" / "Registrar Salida".
// - Navegador del último registro con flechas anterior/siguiente.
// - Tabla responsiva con TODOS los registros (ordenable + paginación).
// - Búsqueda en tiempo real.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate, normalizeText, cn, toMillis } from '@/lib/utils';
import SearchBar from '@/components/SearchBar';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconPlus,
  IconRefresh,
  IconAlert,
  IconTrash,
  IconBox,
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
  { key: 'pesoProveedor', label: 'Peso Proveedor', type: 'number' },
  { key: 'pesoBalanza', label: 'Peso Balanza', type: 'number' },
  { key: 'planta', label: 'Planta', type: 'text' },
];

// Valor numérico de un peso con unidad ("35.4 tn", "1000 u", "").
function numeroPeso(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function getSortValue(r, key) {
  if (key === 'fechaRemito') return toMillis(r.fechaRemito) || 0;
  if (key === 'pesoBalanza' || key === 'pesoProveedor') return numeroPeso(r[key]);
  if (key === 'proveedorCliente') return (r.carga === 'Entrada' ? r.proveedor : r.cliente) || '';
  return String(r[key] || '');
}

function SortHeader({ column, sort, onSort }) {
  const active = sort.key === column.key;
  const up = active && sort.dir === 'asc';
  const down = active && sort.dir === 'desc';
  return (
    <th className="px-2 py-3">
      <button
        type="button"
        onClick={() => onSort(column.key)}
        title={`Ordenar por ${column.label}`}
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
    <div className="flex flex-col items-center rounded-lg border border-white/10 bg-black/20 px-3 py-2">
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
        style={{ background: isEntrada ? '#2dd4ff' : '#ffd60a' }}
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
      <td className="px-2 py-3">
        <span className="block max-w-[110px] truncate text-xs font-semibold text-falpat-soft" title={record.producto}>
          {record.producto || '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-3">
        {record.codigoProducto ? (
          <span className="inline-flex rounded-md border border-falpat/30 bg-falpat/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-falpat-soft">
            {record.codigoProducto}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs tabular-nums text-slate-300">
        {formatDate(record.fechaRemito)}
      </td>
      <td className="whitespace-nowrap px-2 py-3">
        <BadgeCarga carga={record.carga} />
      </td>
      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-slate-100">
        {record.patente}
      </td>
      <td className="px-2 py-3">
        <span className="block max-w-[90px] truncate text-xs text-slate-300" title={record.chofer}>
          {record.chofer}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs text-slate-300">
        {record.nroRemitoFalpat}
      </td>
      <td className="px-2 py-3">
        <span className="block max-w-[85px] truncate font-mono text-xs text-slate-300" title={record.nroRemitoProveedor}>
          {record.nroRemitoProveedor || '—'}
        </span>
      </td>
      <td className="px-2 py-3">
        {isEntrada ? (
          <span
            className="block max-w-[100px] truncate text-xs font-semibold text-slate-200"
            title={record.proveedor}
          >
            {record.proveedor || '—'}
          </span>
        ) : (
          <span className="block max-w-[100px] truncate text-xs" title={record.cliente}>
            {record.cliente || '—'}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs text-slate-400">{record.pesoProveedor || '—'}</td>
      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs text-slate-300">{record.pesoBalanza}</td>
      <td className="px-2 py-3">
        <span className="block max-w-[75px] truncate text-xs text-slate-300" title={record.planta}>
          {record.planta}
        </span>
      </td>
      <td className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-2 py-3 text-right">
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
  const [query, setQuery] = useState('');
  const [cargaFiltro, setCargaFiltro] = useState('Todos');
  const [sort, setSort] = useState({ key: 'fechaRemito', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [navIndex, setNavIndex] = useState(0);

  // Cualquier cambio de búsqueda/orden/tamaño vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [query, sort, pageSize, cargaFiltro]);

  // Mantiene el navegador dentro del rango cuando cambian los datos.
  useEffect(() => {
    setNavIndex((i) => (records.length === 0 ? 0 : Math.min(i, records.length - 1)));
  }, [records]);

  // Búsqueda en tiempo real
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return records.filter((r) => {
      if (cargaFiltro !== 'Todos' && r.carga !== cargaFiltro) return false;
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
          r.planta,
          r.pesoBalanza,
        ].join(' ')
      );
      return haystack.includes(q);
    });
  }, [records, query, cargaFiltro]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = getSortValue(a, key);
      const vb = getSortValue(b, key);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
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
            Panel de <span className="text-gradient-falpat">Stock</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {error && <ErrorPanel message={error} onRetry={reload} />}

      {/* Barra superior: acciones (izquierda) + resumen (derecha) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openModal('Entrada')}
            className="btn-primary whitespace-nowrap !px-4 !py-2.5 !text-[13px]"
            title="Registrar una entrada de material"
            aria-label="Registrar entrada"
          >
            <IconArrowUpRight className="h-3.5 w-3.5" />
            Registrar entrada
          </button>
          <button
            type="button"
            onClick={() => openModal('Salida')}
            className="btn-volt whitespace-nowrap !px-4 !py-2.5 !text-[13px]"
            title="Registrar una salida de material"
            aria-label="Registrar salida"
          >
            <IconArrowDownLeft className="h-3.5 w-3.5" />
            Registrar salida
          </button>
        </div>

        <div className="flex items-center gap-2">
          <MiniStat label="Entradas" value={stats.entradas} accent="text-falpat-soft" />
          <MiniStat label="Salidas" value={stats.salidas} accent="text-volt" />
          <MiniStat label="Total" value={stats.total} />
        </div>
      </div>

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
      <div className="card overflow-hidden !p-0">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Movimientos de stock</h2>
              <p className="section-sub mt-0.5">
                {rangeLabel} registros · deslizá la tabla con la barra de abajo para ver todas las columnas
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
            <EmptyState filtered={Boolean(query)} />
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full min-w-[1180px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    {COLUMNS.map((col) => (
                      <SortHeader key={col.key} column={col} sort={sort} onSort={onSort} />
                    ))}
                    <th className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-2 py-3" />
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
                Mostrando {rangeLabel} registros · los datos se sincronizan automáticamente
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
