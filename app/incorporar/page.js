'use client';

// ============================================================
// app/incorporar/page.js
// Sección Incorporar: carga masiva de Entradas y Salidas desde los
// Excel de carga (formato REMITOS / OBSERVACION / FECHA / CODIGO /
// DESCRIPCION / CANTIDAD KG).
//
// Flujo: elegís el tipo → descargás la plantilla modelo (referencia)
// → subís la planilla → previsualizás y validás → importar.
// Los registros nuevos se guardan en UN solo commit en la rama del
// ambiente activo (dev local, main en producción). Las filas ya
// cargadas se detectan y se ignoran automáticamente.
// ============================================================
import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  leerFilasExcel,
  parsearFilas,
  separarNuevos,
  resumenPorProducto,
} from '@/lib/importar';
import { formatDate } from '@/lib/utils';
import {
  IconUpload,
  IconDownload,
  IconFileSpreadsheet,
  IconCheck,
  IconAlert,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconX,
} from '@/components/Icons';

const TIPOS = [
  {
    value: 'Entrada',
    label: 'Entradas',
    detalle: 'OBSERVACION = proveedor · REMITOS = remito del proveedor',
    icono: IconArrowDownLeft,
    acento: 'text-falpat-soft',
    borde: 'hover:border-falpat/40',
    plantilla: '/plantillas/Plantilla-Entradas.xlsx',
  },
  {
    value: 'Salida',
    label: 'Salidas',
    detalle: 'OBSERVACION = cliente · REMITOS = remito de FALPAT',
    icono: IconArrowUpRight,
    acento: 'text-volt',
    borde: 'hover:border-amber-400/40',
    plantilla: '/plantillas/Plantilla-Salidas.xlsx',
  },
];

const PREVIEW_MAX = 50;

function fmtNum(n) {
  return Number.isFinite(n)
    ? n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
    : '—';
}

export default function IncorporarPage() {
  const { records, loading, error, reload, showToast } = useApp();
  const inputRef = useRef(null);

  const [tipo, setTipo] = useState('Entrada');
  const [archivoNombre, setArchivoNombre] = useState('');
  const [analisis, setAnalisis] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [resultado, setResultado] = useState(null);

  const tipoActual = TIPOS.find((t) => t.value === tipo);
  const resumen = useMemo(
    () => (analisis ? resumenPorProducto(analisis.nuevos) : []),
    [analisis]
  );

  function reset() {
    setAnalisis(null);
    setArchivoNombre('');
    setErrorArchivo('');
    setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function elegirTipo(value) {
    if (value === tipo) return;
    setTipo(value);
    reset();
  }

  async function onArchivo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorArchivo('');
    setResultado(null);
    setAnalisis(null);
    setLeyendo(true);
    try {
      const rows = await leerFilasExcel(file);
      const { records: parseados, descartadas } = parsearFilas(rows, tipo);
      if (parseados.length === 0 && descartadas.length === 0) {
        throw new Error('No se encontraron filas con datos en la primera hoja.');
      }
      const { nuevos, duplicados } = separarNuevos(parseados, records);
      setAnalisis({ total: parseados.length, descartadas, nuevos, duplicados });
      setArchivoNombre(file.name);
    } catch (err) {
      setErrorArchivo(err.message || 'No se pudo leer el archivo.');
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    if (!analisis || analisis.nuevos.length === 0) return;
    setImportando(true);
    try {
      const res = await fetch('/api/db/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carga: tipo, records: analisis.nuevos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error ${res.status} al importar.`);
      setResultado(data);
      setAnalisis(null);
      setArchivoNombre('');
      if (inputRef.current) inputRef.current.value = '';
      showToast(`Importación OK: ${data.insertados} ${tipo.toLowerCase()}s guardadas`);
      reload();
    } catch (err) {
      setErrorArchivo(err.message || 'No se pudo importar.');
    } finally {
      setImportando(false);
    }
  }

  if (loading && !analisis) {
    return <div className="card mx-auto max-w-5xl h-64 animate-pulse" />;
  }

  if (error) {
    return (
      <div className="card mx-auto max-w-2xl border-red-500/30 p-8 text-center">
        <p className="text-sm text-slate-300">Error al leer los datos: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-sub mb-1">Carga masiva desde planillas Excel</p>
          <h1 className="section-title !text-2xl">Incorporar datos</h1>
        </div>
        <a href={tipoActual.plantilla} download className="btn-ghost" title="Descargar planilla modelo">
          <IconDownload className="h-4 w-4" />
          Plantilla {tipoActual.label}
        </a>
      </div>

      {/* Paso 1: tipo de carga */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-falpat/15 font-mono text-xs font-bold text-falpat-soft">1</span>
          <h2 className="section-title !text-base">Tipo de carga</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TIPOS.map((t) => {
            const Icono = t.icono;
            const activo = t.value === tipo;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => elegirTipo(t.value)}
                aria-pressed={activo}
                className={
                  'flex items-center gap-4 rounded-xl border p-4 text-left transition ' +
                  (activo
                    ? 'border-falpat/50 bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(45,212,255,0.2)]'
                    : `border-white/10 bg-white/[0.02] ${t.borde}`)
                }
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-night-900 ${t.acento}`}>
                  <Icono className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold uppercase tracking-wider text-slate-100">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{t.detalle}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Las dos planillas usan las mismas columnas:{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">REMITOS</code>,{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">OBSERVACION</code>,{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">FECHA</code>,{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">CODIGO DEL PRODUCTO</code>,{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">DESCRIPCION</code>,{' '}
          <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">CANTIDAD KG</code>. Lo que cambia es
          quién va en OBSERVACION y a qué pertenece el remito. Usá la plantilla como referencia: tiene una hoja
          CARGA vacía, una hoja EJEMPLO y una hoja AYUDA con el catálogo y las unidades.
        </p>
      </div>

      {/* Paso 2: archivo */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-falpat/15 font-mono text-xs font-bold text-falpat-soft">2</span>
          <h2 className="section-title !text-base">Planilla</h2>
        </div>
        <label
          className={
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition hover:bg-white/[0.03] ' +
            (archivoNombre ? 'border-falpat/40' : 'border-white/15')
          }
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onArchivo} className="hidden" disabled={leyendo} />
          <IconFileSpreadsheet className="h-7 w-7 text-falpat" />
          {leyendo ? (
            <span className="text-sm text-slate-400">Leyendo archivo…</span>
          ) : archivoNombre ? (
            <>
              <span className="text-sm font-semibold text-slate-100">{archivoNombre}</span>
              <span className="text-[11px] text-slate-500">Clic para cambiar el archivo</span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-slate-200">
                Subir planilla de {tipoActual.label.toLowerCase()}
              </span>
              <span className="text-[11px] text-slate-500">Formato .xlsx — la primera hoja es la que se lee</span>
            </>
          )}
        </label>

        {errorArchivo && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorArchivo}</span>
          </div>
        )}
      </div>

      {/* Resultado de la importación anterior */}
      {resultado && (
        <div className="card flex items-start gap-3 border-emerald-500/30 bg-emerald-500/10 !p-4">
          <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="text-sm text-emerald-100">
            Importación completada: <strong>{resultado.insertados}</strong> {tipo.toLowerCase()}s nuevas guardadas
            {resultado.duplicados > 0 && <> · {resultado.duplicados} repetidas ignoradas</>} · total en la base:{' '}
            {resultado.total.toLocaleString('es-AR')} registros.
            <span className="mt-1 block text-[11px] text-emerald-200/70">
              Guardado en un único commit en la rama del ambiente actual (dev local / main en producción).
            </span>
          </div>
        </div>
      )}

      {/* Paso 3: preview */}
      {analisis && (
        <div className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-falpat/15 font-mono text-xs font-bold text-falpat-soft">3</span>
              <h2 className="section-title !text-base">Revisar e importar</h2>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition hover:text-slate-200"
            >
              <IconX className="h-3.5 w-3.5" />
              Descartar análisis
            </button>
          </div>

          {/* Conteos */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Filas leídas" value={fmtNum(analisis.total)} cls="text-slate-100" />
            <Stat label={`Nuevas (${tipo})`} value={fmtNum(analisis.nuevos.length)} cls="text-emerald-400" />
            <Stat label="Ya cargadas" value={fmtNum(analisis.duplicados.length)} cls="text-amber-400" />
            <Stat label="Con error" value={fmtNum(analisis.descartadas.length)} cls={analisis.descartadas.length ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {analisis.duplicados.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {analisis.duplicados.length} fila(s) ya existen en la base (misma fecha, remito, producto,
                cantidad y {tipo === 'Entrada' ? 'proveedor' : 'cliente'}) y se van a ignorar.
              </span>
            </div>
          )}

          {analisis.descartadas.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-200">
              <p className="font-semibold uppercase tracking-wider text-red-300">Filas con error ({analisis.descartadas.length})</p>
              <ul className="mt-1.5 space-y-0.5">
                {analisis.descartadas.slice(0, 10).map((d) => (
                  <li key={d} className="font-mono text-[12px]">{d}</li>
                ))}
              </ul>
              {analisis.descartadas.length > 10 && (
                <p className="mt-1 text-[11px] text-red-300/80">…y {analisis.descartadas.length - 10} más.</p>
              )}
            </div>
          )}

          {/* Resumen por producto */}
          {resumen.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Resumen de filas nuevas por producto</p>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.04] text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-3 py-2 font-semibold">Código</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.slice(0, 12).map((r) => (
                      <tr key={`${r.codigo}§${r.producto}§${r.unidad}`} className="border-t border-white/5">
                        <td className="px-3 py-1.5 font-mono text-xs text-falpat-soft">{r.codigo}</td>
                        <td className="px-3 py-1.5 text-slate-300">{r.producto}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-200">
                          {fmtNum(r.cantidad)} {r.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resumen.length > 12 && (
                <p className="mt-1 text-[11px] text-slate-600">…y {resumen.length - 12} productos más.</p>
              )}
            </div>
          )}

          {/* Detalle de filas nuevas */}
          {analisis.nuevos.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Filas nuevas (primeras {Math.min(PREVIEW_MAX, analisis.nuevos.length)})
              </p>
              <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-night-800">
                    <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-3 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Remito</th>
                      <th className="px-3 py-2 font-semibold">Cód.</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">{tipo === 'Entrada' ? 'Proveedor' : 'Cliente'}</th>
                      <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.nuevos.slice(0, PREVIEW_MAX).map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{formatDate(r.fechaRemito)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-300">{tipo === 'Entrada' ? r.nroRemitoProveedor : r.nroRemitoFalpat}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-falpat-soft">{r.codigoProducto || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-300">{r.producto}</td>
                        <td className="px-3 py-1.5 text-slate-400">{tipo === 'Entrada' ? r.proveedor : r.cliente}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-slate-200">{r.pesoBalanza}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4">
            <p className="mr-auto text-[11px] text-slate-500">
              Se guardan solo las filas nuevas, en un único commit.
            </p>
            <button type="button" onClick={reset} className="btn-ghost" disabled={importando}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={importar}
              disabled={importando || analisis.nuevos.length === 0}
              className="btn-primary"
            >
              <IconUpload className="h-4 w-4" />
              {importando
                ? 'Importando…'
                : analisis.nuevos.length === 0
                  ? 'Nada para importar'
                  : `Importar ${fmtNum(analisis.nuevos.length)} registro${analisis.nuevos.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
      <div className={`font-mono text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
