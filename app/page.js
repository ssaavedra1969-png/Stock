'use client';

// ============================================================
// app/page.js
// Dashboard principal de GRUPO FALPAT SRL:
// - Tarjetas de conteo (Entradas / Salidas / Total / Último)
// - Filtro por producto
// - Tabla responsiva con los últimos 20 registros
// - Búsqueda en tiempo real
// - FAB "AGREGAR REGISTRO"
// ============================================================
import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDate, normalizeText, cn } from '@/lib/utils';
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
} from '@/components/Icons';

const MAX_TABLE_ROWS = 20;

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

function ProductPills({ productos, selected, onSelect }) {
  const items = ['Todos', ...productos];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition',
            selected === p
              ? 'border-falpat/60 bg-falpat/15 text-falpat-soft shadow-glow'
              : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function TableRow({ record, onDelete }) {
  const isEntrada = record.carga === 'Entrada';
  return (
    <tr className="border-b border-white/[0.05] transition last:border-0 hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-falpat-soft">
          <IconBox className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[150px] truncate">{record.producto || '—'}</span>
        </span>
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
      <td className="px-4 py-3 text-xs text-slate-400">
        {isEntrada ? (
          <span className="flex flex-col leading-tight">
            <span className="max-w-[130px] truncate font-mono text-slate-300">
              {record.nroRemitoProveedor || '—'}
            </span>
            <span className="max-w-[130px] truncate text-slate-500">
              {record.pesoProveedor || ''}
            </span>
          </span>
        ) : (
          <span className="max-w-[150px] truncate">{record.cliente || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <IconScale className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          {record.pesoBalanza}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-300">
          <IconBuilding className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="max-w-[130px] truncate">{record.planta}</span>
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onDelete(record.id)}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
          aria-label="Eliminar registro"
          title="Eliminar registro"
        >
          <IconTrash className="h-4 w-4" />
        </button>
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
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-16" /></td>
          <td className="px-4 py-4"><Skeleton className="h-5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-28" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-20" /></td>
          <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
          <td className="px-4 py-4"><Skeleton className="h-5 w-8" /></td>
        </tr>
      ))}
    </>
  );
}

export default function Home() {
  const { records, productos, loading, error, reload, deleteRecord, openModal, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [producto, setProducto] = useState('Todos');

  // Filtro por producto (afecta tarjetas + tabla)
  const byProduct = useMemo(
    () => (producto === 'Todos' ? records : records.filter((r) => r.producto === producto)),
    [records, producto]
  );

  // Búsqueda en tiempo real
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return byProduct;
    return byProduct.filter((r) => {
      const haystack = normalizeText(
        [
          r.producto,
          r.patente,
          r.chofer,
          r.nroRemitoFalpat,
          r.nroRemitoProveedor,
          r.cliente,
          r.planta,
          r.pesoBalanza,
        ].join(' ')
      );
      return haystack.includes(q);
    });
  }, [byProduct, query]);

  const visible = filtered.slice(0, MAX_TABLE_ROWS);

  const statsByProduct = useMemo(() => {
    const total = byProduct.length;
    const entradas = byProduct.filter((r) => r.carga === 'Entrada').length;
    const salidas = total - entradas;
    return { total, entradas, salidas, ultimo: byProduct[0] || null };
  }, [byProduct]);

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
          sub={producto === 'Todos' ? 'Registros almacenados' : `Filtro: ${producto}`}
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
                Mostrando {visible.length} de {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
            <SearchBar value={query} onChange={setQuery} />
          </div>
          <ProductPills productos={productos} selected={producto} onSelect={setProducto} />
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <tbody>
                <TableSkeleton />
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState filtered={query || producto !== 'Todos'} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <th className="px-4 py-3 font-bold">Producto</th>
                    <th className="px-4 py-3 font-bold">Fecha</th>
                    <th className="px-4 py-3 font-bold">Carga</th>
                    <th className="px-4 py-3 font-bold">Patente</th>
                    <th className="px-4 py-3 font-bold">Chofer</th>
                    <th className="px-4 py-3 font-bold">Nro Falpat</th>
                    <th className="px-4 py-3 font-bold">Proveedor / Cliente</th>
                    <th className="px-4 py-3 font-bold">Peso Balanza</th>
                    <th className="px-4 py-3 font-bold">Planta</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => (
                    <TableRow key={record.id} record={record} onDelete={handleDelete} />
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
