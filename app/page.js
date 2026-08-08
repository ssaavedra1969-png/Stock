'use client';

// ============================================================
// app/page.js
// Dashboard principal de GRUPO FALPAT SRL:
// - Tarjetas de conteo (Entradas / Salidas / Total / Último)
// - Tabla responsiva con los últimos 20 registros (ordenable por columna)
// - Búsqueda en tiempo real
// - FAB "AGREGAR REGISTRO"
// ============================================================
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate, normalizeText, cn, toMillis } from '@/lib/utils';
import StatsCard from '@/components/StatsCard';
import SearchBar from '@/components/SearchBar';
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconLayers,
  IconClock,
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
  IconPencil,
} from '@/components/Icons';

const MAX_TABLE_ROWS = 20;

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
    <th className="px-4 py-3">
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

function TableRow({ record, onEdit, onDelete }) {
  const isEntrada = record.carga === 'Entrada';
  return (
    <tr className="border-b border-white/[0.05] transition last:border-0 hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-falpat-soft">
          <IconBox className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[150px] truncate">{record.producto || '—'}</span>
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {record.codigoProducto ? (
          <span className="inline-flex rounded-md border border-falpat/30 bg-falpat/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-falpat-soft">
            {record.codigoProducto}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-300">
        {formatDate(record.fechaRemito)}
      </td>
      <td className="px-4 py-3">
        <BadgeCarga carga={record.carga} />
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-slate-100">
          <IconTruck className="h-3.5 w-3.5 text-slate-500" />
          {record.patente}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-300">
          <IconUser className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[150px] truncate">{record.chofer}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <IconFileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          {record.nroRemitoFalpat}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <IconFileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[120px] truncate">{record.nroRemitoProveedor || '—'}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        {isEntrada ? (
          <span className="max-w-[150px] truncate text-xs font-semibold text-slate-200">
            {record.proveedor || '—'}
          </span>
        ) : (
          <span className="max-w-[150px] truncate text-xs">{record.cliente || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{record.pesoProveedor || '—'}</td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <IconScale className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          {record.pesoBalanza}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-300">
          <IconBuilding className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[110px] truncate">{record.planta}</span>
        </span>
      </td>
      <td className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-4 py-3 text-right">
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
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-4 w-10" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="px-4 py-4"><Skeleton className="h-5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-28" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-4 py-4"><Skeleton className="h-5 w-8" /></td>
        </tr>
      ))}
    </>
  );
}

export default function Home() {
  const { records, loading, error, reload, deleteRecord, openEdit, openModal, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'fechaRemito', dir: 'desc' });

  // Búsqueda en tiempo real
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return records;
    return records.filter((r) => {
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
  }, [records, query]);

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

  const visible = sorted.slice(0, MAX_TABLE_ROWS);

  function onSort(key) {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'fechaRemito' ? 'desc' : 'asc' };
    });
  }

  const statsByProduct = useMemo(() => {
    const total = records.length;
    const entradas = records.filter((r) => r.carga === 'Entrada').length;
    const salidas = total - entradas;
    return { total, entradas, salidas, ultimo: records[0] || null };
  }, [records]);

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    try {
      await deleteRecord(id);
    } catch (err) {
      showToast(`Error al eliminar: ${err.message}`, 'error');
    }
  }

  const ultimo = statsByProduct.ultimo;

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
        <div className="flex items-center gap-3">
          <ModeBadge online={!error} />
          <button
            type="button"
            onClick={reload}
            className="btn-ghost"
            disabled={loading}
            title="Recargar datos"
          >
            <IconRefresh className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar
          </button>
        </div>
      </div>

      {error && <ErrorPanel message={error} onRetry={reload} />}

      {/* Tarjetas de conteo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total entradas"
          value={loading ? '…' : statsByProduct.entradas}
          sub="Materiales ingresados"
          icon={<IconArrowUpRight className="h-5 w-5" />}
          tone="cyan"
        />
        <StatsCard
          label="Total salidas"
          value={loading ? '…' : statsByProduct.salidas}
          sub="Materiales despachados"
          icon={<IconArrowDownLeft className="h-5 w-5" />}
          tone="volt"
        />
        <StatsCard
          label="Total movimientos"
          value={loading ? '…' : statsByProduct.total}
          sub="Registros almacenados"
          icon={<IconLayers className="h-5 w-5" />}
          tone="white"
        />
        <StatsCard
          label="Último movimiento"
          value={ultimo ? formatDate(ultimo.fechaRemito) : '—'}
          sub={
            ultimo
              ? `${ultimo.carga} · ${ultimo.producto} · ${ultimo.patente}`
              : 'Sin movimientos'
          }
          icon={<IconClock className="h-5 w-5" />}
          tone="cyan"
        />
      </div>

      {/* Tabla de últimos registros */}
      <div className="card overflow-hidden !p-0">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Últimos movimientos</h2>
              <p className="section-sub mt-0.5">
                Mostrando {visible.length} de {filtered.length} registro{filtered.length !== 1 ? 's' : ''} ·
                deslizá la tabla con la barra de abajo para ver todas las columnas
              </p>
            </div>
            <SearchBar value={query} onChange={setQuery} />
          </div>
        </div>

        {loading ? (
          <div className="table-scroll">
            <table className="w-full min-w-[1320px] border-collapse">
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
              <table className="w-full min-w-[1320px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    {COLUMNS.map((col) => (
                      <SortHeader key={col.key} column={col} sort={sort} onSort={onSort} />
                    ))}
                    <th className="sticky right-0 z-10 border-l border-white/10 bg-night-900 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => (
                    <TableRow key={record.id} record={record} onEdit={openEdit} onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/10 bg-black/20 px-5 py-3 text-xs text-slate-500">
              {filtered.length > MAX_TABLE_ROWS
                ? `Se muestran los últimos ${MAX_TABLE_ROWS} registros de ${filtered.length}.`
                : 'Vista local · los datos se sincronizan automáticamente.'}
            </div>
          </>
        )}
      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={openModal}
        className="fab fixed bottom-6 right-4 z-50 sm:right-6 lg:bottom-8 lg:right-8"
        aria-label="Agregar registro"
      >
        <IconPlus className="h-5 w-5" />
        <span className="hidden sm:inline">Agregar registro</span>
      </button>
    </div>
  );
}
