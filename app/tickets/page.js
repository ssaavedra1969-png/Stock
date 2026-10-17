'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  IconUpload,
  IconFileText,
  IconDownload,
  IconCheck,
  IconAlert,
  IconX,
  IconRefresh,
  IconPencil,
  IconTrash,
} from '@/components/Icons';

const CAMPOS = [
  'Fecha',
  'Proveedor',
  'N Remito',
  'Razon Social',
  'Material',
  'Neto',
  'Peso Neto',
  'Chofer',
  'Pat. Chasis',
  'Centro',
  'Carga',
];

const CENTROS = ['Lujan', 'Campana'];
const CARGAS = ['Entrada', 'Salida'];

// Campos que deben venir sí o sí del ticket.
const CAMPOS_CLAVE = ['Fecha', 'N Remito', 'Material', 'Neto', 'Peso Neto', 'Chofer', 'Pat. Chasis'];

function sinDato(valor) {
  const v = valor === undefined || valor === null ? '' : String(valor).trim();
  return v === '' || v.toUpperCase() === 'N/D';
}

function tieneFaltantes(registro) {
  return CAMPOS_CLAVE.some((c) => sinDato(registro[c]));
}

const PREVIEW_MAX = 200;

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ahora() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ordenarPorFecha(registros) {
  return [...registros].sort((a, b) => {
    const fa = String(a.Fecha || a.fecha || '');
    const fb = String(b.Fecha || b.fecha || '');
    return fa.localeCompare(fb);
  });
}

export default function TicketsPage() {
  const { showToast, tickets, procesarTickets, limpiarTickets } = useApp();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [registrosEditados, setRegistrosEditados] = useState([]);
  const [huboEdiciones, setHuboEdiciones] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [valoresEdit, setValoresEdit] = useState({});
  const [incorporando, setIncorporando] = useState(false);
  const [centro, setCentro] = useState('');
  const [carga, setCarga] = useState('');
  const [carpeta, setCarpeta] = useState(null); // { handle, nombre } — carpeta STOCK
  const [eligiendoCarpeta, setEligiendoCarpeta] = useState(false);
  const [clavesPlanilla, setClavesPlanilla] = useState(null); // Set "Proveedor|Remito" del historial
  const [mostrarModalDuplicados, setMostrarModalDuplicados] = useState(false);

  const procesando = tickets.procesando;
  const resultado = tickets.resultado;
  const errorMsg = tickets.error;

  const registros = useMemo(() => {
    const lista = huboEdiciones ? registrosEditados : resultado?.registros || [];
    const claves = clavesPlanilla;
    const conEstado = claves
      ? lista.map((r) => ({
          ...r,
          Estado: claves.has(`${r.Proveedor || ''}|${r['N Remito'] || ''}`) ? 'DUPLICADO' : 'NUEVO',
        }))
      : lista;
    return ordenarPorFecha(conEstado);
  }, [resultado, registrosEditados, huboEdiciones, clavesPlanilla]);

  const nNuevos = useMemo(() => registros.filter((r) => r.Estado !== 'DUPLICADO').length, [registros]);
  const nDuplicados = registros.length - nNuevos;

  const alertas = useMemo(() => {
    if (!resultado) return [];
    return registros.filter((r) => r.Estado === 'DUPLICADO');
  }, [resultado, registros]);

  function addFiles(lista) {
    const nuevos = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name));
    if (nuevos.length === 0) {
      showToast('Solo se aceptan archivos PDF', 'error');
      return;
    }
    setFiles((prev) => {
      const vistos = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const merge = [...prev];
      for (const f of nuevos) {
        const k = `${f.name}|${f.size}|${f.lastModified}`;
        if (!vistos.has(k)) {
          vistos.add(k);
          merge.push(f);
        }
      }
      return merge;
    });
  }

  function onInput(event) {
    addFiles(event.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event) {
    event.preventDefault();
    setArrastrando(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  }

  useEffect(() => {
    if (files.length === 0 || procesando) return;
    procesar();
  }, [files]);

  useEffect(() => {
    if (alertas.length > 0) {
      setMostrarModalDuplicados(true);
    }
  }, [alertas]);

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function limpiar() {
    setFiles([]);
    limpiarTickets();
    setRegistrosEditados([]);
    setEditandoIdx(null);
    setValoresEdit({});
    setCentro('');
    setCarga('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function elegirCarpeta() {
    setEligiendoCarpeta(true);
    try {
      const { soportaCarpetas, elegirCarpetaServidor, prepararCarpeta, leerPlanillaDeCarpeta, clavesDeFilas } = await import(
        '@/lib/tickets/archivo.mjs'
      );
      if (!soportaCarpetas()) {
        showToast('Este navegador no permite elegir carpetas. Usá Chrome o Edge.', 'error');
        return;
      }
      const handle = await elegirCarpetaServidor();
      // Validamos que sea la carpeta STOCK (contiene Entrada, Salida y procesados).
      const { entrada, salida, procesados, esStock } = await prepararCarpeta(handle);
      if (!esStock) {
        throw new Error(
          `Elegiste "${handle.name}", pero no es la carpeta STOCK: no contiene Entrada, Salida y procesados juntas. Elegí la carpeta STOCK (la que tiene las tres subcarpetas).`
        );
      }
      setCarpeta({ handle, nombre: handle.name });
      const { rows } = await leerPlanillaDeCarpeta(handle);
      setClavesPlanilla(clavesDeFilas(rows && rows.length ? rows : [CAMPOS]));
      showToast(`Carpeta STOCK lista: ${handle.name} · todo automático (histórico + mover PDFs)`);
    } catch (err) {
      if (err?.name !== 'AbortError') showToast(err.message || 'No se pudo abrir la carpeta', 'error');
    } finally {
      setEligiendoCarpeta(false);
    }
  }

  async function procesar() {
    if (files.length === 0) return;
    setRegistrosEditados([]);
    setEditandoIdx(null);
    try {
      const data = await procesarTickets(files);
      const nuevos = data.nuevos ?? 0;
      const dup = data.duplicados ?? 0;
      showToast(`Procesado: ${nuevos} nuevo(s), ${dup} duplicado(s)`);
    } catch {
      showToast('Error al procesar los tickets', 'error');
    }
  }

  function iniciarEdicion(idx) {
    const r = registros[idx];
    setEditandoIdx(idx);
    setValoresEdit({ ...r });
  }

  function cancelarEdicion() {
    setEditandoIdx(null);
    setValoresEdit({});
  }

  function guardarEdicion(idx) {
    setRegistrosEditados((prev) => {
      const base = resultado?.registros || [];
      const lista = prev.length > 0 ? [...prev] : [...base];
      lista[idx] = { ...valoresEdit };
      return lista;
    });
    setHuboEdiciones(true);
    setEditandoIdx(null);
    setValoresEdit({});
    showToast('Registro actualizado');
  }

  function eliminarRegistro(idx) {
    setRegistrosEditados((prev) => {
      const base = resultado?.registros || [];
      const lista = prev.length > 0 ? [...prev] : [...base];
      lista.splice(idx, 1);
      return lista;
    });
    setHuboEdiciones(true);
    showToast('Registro eliminado');
  }

  function campoEditado(campo, valor) {
    setValoresEdit((prev) => ({ ...prev, [campo]: valor }));
  }

  async function incorporar() {
    if (registros.length === 0) return;
    if (!centro || !carga) {
      showToast('Seleccioná el Centro y la Carga antes de incorporar', 'error');
      return;
    }
    if (!carpeta?.handle) {
      showToast('Elegí la carpeta STOCK antes de incorporar', 'error');
      return;
    }
    setIncorporando(true);
    try {
      const { incorporarEnCarpeta, leerPlanillaDeCarpeta, clavesDeFilas } = await import('@/lib/tickets/archivo.mjs');
      const registrosConMeta = registros.map((r) => ({ ...r, Centro: centro, Carga: carga }));
      const data = await incorporarEnCarpeta(carpeta.handle, registrosConMeta);

      // Refrescar las claves del historial para la próxima tanda.
      const { rows } = await leerPlanillaDeCarpeta(carpeta.handle);
      setClavesPlanilla(clavesDeFilas(rows && rows.length ? rows : [CAMPOS]));

      let msg = `${data.agregados} fila(s) agregada(s) · Total: ${data.total}`;
      if (data.duplicados) msg += ` · ${data.duplicados} repetida(s) (PDF archivado igualmente)`;
      if (data.movidos.length) {
        msg += ` · ${data.movidos.length} PDF archivado(s)`;
        if (data.errores.length) msg += ` (${data.errores.length} con error)`;
      }
      showToast(msg);
      limpiar();
    } catch (err) {
      showToast(err.message || 'Error al incorporar', 'error');
    } finally {
      setIncorporando(false);
    }
  }

  const hayResultado = !!resultado;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Encabezado compacto */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="section-title !text-lg">Tickets de pesaje</h1>
        <div className="flex items-center gap-2">
          {(files.length > 0 || hayResultado) && (
            <button type="button" onClick={limpiar} className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={procesando}>
              <IconRefresh className="h-3.5 w-3.5" />
              Nueva
            </button>
          )}
        </div>
      </div>

      {/* Paso 1 — Cargar los tickets */}
      <Paso
        n="1"
        titulo="Cargá los tickets"
        ayuda="Arrastrá los PDF de pesaje o elegí los archivos. Se leen solos con OCR (puede tardar unos segundos)."
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          className={
            'flex items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-4 text-center transition ' +
            (arrastrando ? 'border-falpat/60 bg-white/[0.05]' : 'border-white/15 hover:bg-white/[0.03]')
          }
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={onInput}
            className="hidden"
            disabled={procesando}
          />
          <IconFileText className="h-5 w-5 text-falpat" />
          <span className="text-xs text-slate-300">
            Arrastrá PDF acá o{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-falpat-soft underline hover:text-falpat"
              disabled={procesando}
            >
              elegí archivos
            </button>
          </span>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${f.size}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300"
              >
                <IconFileText className="h-3 w-3 text-falpat-soft" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <span className="font-mono text-[10px] text-slate-500">{fmtBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={procesando}
                  className="text-slate-500 hover:text-red-300"
                >
                  <IconX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </Paso>

      {/* Paso 2 — Revisar y completar */}
      <Paso
        n="2"
        titulo="Revisá y completá"
        ayuda="Elegí STORK y el Centro y la Carga. Revisá que los datos leídos sean correctos."
      >
        <div className="space-y-2 border-t border-white/5 pt-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={elegirCarpeta}
              disabled={eligiendoCarpeta}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <IconUpload className="h-3.5 w-3.5" />
              {eligiendoCarpeta ? 'Abriendo…' : carpeta ? 'Cambiar STORK' : 'Elegir carpeta STORK'}
            </button>
            <span className="text-[11px] text-slate-400">
              {carpeta ? (
                <>
                  STORK: <span className="font-mono text-slate-200">{carpeta.nombre}</span> ·
                  {clavesPlanilla ? `${clavesPlanilla.size} registro(s) en el historial` : ''}
                </>
              ) : (
                <>
                  Elegí la carpeta <span className="font-mono text-slate-300">STORK</span> (la que tiene{' '}
                  <span className="font-mono text-slate-300">Entrada</span>,{' '}
                  <span className="font-mono text-slate-300">Salida</span> y{' '}
                  <span className="font-mono text-slate-300">procesados</span>).
                </>
              )}
            </span>
          </div>
        </div>

        {/* Centro y Carga */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="block w-44">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Centro <span className="text-red-400">*</span>
            </span>
            <select
              value={centro}
              onChange={(e) => setCentro(e.target.value)}
              className="field !py-2 text-xs"
            >
              <option value="">Elegí…</option>
              {CENTROS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Carga <span className="text-red-400">*</span>
            </span>
            <select
              value={carga}
              onChange={(e) => setCarga(e.target.value)}
              className="field !py-2 text-xs"
            >
              <option value="">Elegí…</option>
              {CARGAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="mb-2 text-[11px] text-slate-500">
            {centro && carga
              ? <span className="text-emerald-400">Listo para incorporar</span>
              : <span className="text-amber-400">Obligatorio para incorporar</span>}
          </p>
        </div>

        {/* Resultado */}
        {hayResultado && (
          <div className="space-y-3 border-t border-white/5 pt-3">
          <div className="grid grid-cols-5 gap-1.5">
            <Stat label="Archivos" value={resultado.total ?? 0} cls="text-slate-100" />
            <Stat label="Nuevos" value={nNuevos} cls="text-emerald-400" />
            <Stat label="Duplicados" value={nDuplicados} cls="text-amber-400" />
            <Stat label="Similares" value={resultado.similares ?? 0} cls="text-falpat-soft" />
            <Stat label="Errores" value={(resultado.errores || []).length} cls={(resultado.errores || []).length ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {alertas.length > 0 && !mostrarModalDuplicados && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{alertas.length} remito(s) ya existían en el historial.</span>
            </div>
          )}

          {(resultado.alertas || []).length > 0 && (
            <details className="rounded-lg border border-falpat/30 bg-falpat/10 p-2 text-xs text-sky-100">
              <summary className="cursor-pointer font-semibold uppercase tracking-wider text-sky-200">
                Similares ({(resultado.alertas || []).length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-2">
                {(resultado.alertas || []).map((a, i) => (
                  <li key={i} className="font-mono text-[11px]">
                    {a.archivo} · {a.campo}: &ldquo;{a.valor}&rdquo; ~ &ldquo;{a.similar_a}&rdquo; ({a.ratio})
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(resultado.errores || []).length > 0 && (
            <details className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
              <summary className="cursor-pointer font-semibold uppercase tracking-wider text-red-300">
                Errores ({(resultado.errores || []).length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-2">
                {(resultado.errores || []).map((e, i) => (
                  <li key={i} className="font-mono text-[11px]">{e.archivo}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}

          {registros.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {registros.length} registros por fecha — editá o eliminá antes de exportar
              </p>
              <div className="table-scroll rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-night-800">
                    <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                      {CAMPOS.map((c) => (
                        <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">{c}</th>
                      ))}
                      <th className="px-2 py-1.5 font-semibold">Estado</th>
                      <th className="px-2 py-1.5 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.slice(0, PREVIEW_MAX).map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {CAMPOS.map((c) => {
                          if (c === 'Centro' || c === 'Carga') {
                            const v = c === 'Centro' ? centro : carga;
                            return (
                              <td key={c} className="whitespace-nowrap px-2 py-1">
                                <span className={`text-[11px] ${v ? 'text-slate-300' : 'font-semibold text-amber-400'}`}>
                                  {v || 'pendiente'}
                                </span>
                              </td>
                            );
                          }
                          const crudo = r[c];
                          const falta = sinDato(crudo);
                          const mono = c === 'N Remito' || c === 'Pat. Chasis';
                          return (
                            <td key={c} className="whitespace-nowrap px-2 py-1 text-slate-300">
                              {editandoIdx === i ? (
                                <input
                                  type="text"
                                  value={valoresEdit[c] ?? ''}
                                  onChange={(e) => campoEditado(c, e.target.value)}
                                  className="w-20 rounded border border-white/10 bg-night-900 px-1 py-0.5 text-[11px] text-slate-200 outline-none focus:border-falpat/50"
                                />
                              ) : falta && r.Archivo ? (
                                <a
                                  href={`/api/tickets/pdf?file=${encodeURIComponent(r.Archivo)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Ver PDF: ${r.Archivo}`}
                                  className={`inline-block rounded bg-red-500/15 px-1 font-bold text-red-300 underline decoration-dotted underline-offset-2 hover:bg-red-500/25 ${mono ? 'font-mono text-[10px]' : 'text-[11px]'}`}
                                >
                                  N/D
                                </a>
                              ) : (
                                <span className={`${falta ? 'rounded bg-red-500/15 px-1 font-bold text-red-300' : ''} ${mono ? 'font-mono text-[10px]' : 'text-[11px]'}`}>
                                  {falta ? 'N/D' : crudo}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1">
                          {r.Estado === 'DUPLICADO' ? (
                            <span className="badge badge-salida !text-[9px] !px-1.5 !py-0.5">Duplicado</span>
                          ) : (
                            <span className="badge badge-entrada !text-[9px] !px-1.5 !py-0.5">Nuevo</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {editandoIdx === i ? (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => guardarEdicion(i)}
                                className="rounded p-0.5 text-emerald-400 hover:bg-white/5"
                                title="Guardar"
                              >
                                <IconCheck className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicion}
                                className="rounded p-0.5 text-slate-400 hover:bg-white/5"
                                title="Cancelar"
                              >
                                <IconX className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              {r.Archivo && tieneFaltantes(r) && (
                                <a
                                  href={`/api/tickets/pdf?file=${encodeURIComponent(r.Archivo)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-0.5 text-red-300 hover:bg-red-500/10"
                                  title="Ver PDF original (faltan datos)"
                                >
                                  <IconFileText className="h-3 w-3" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(i)}
                                className="rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-falpat-soft"
                                title="Editar"
                              >
                                <IconPencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarRegistro(i)}
                                className="rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-red-300"
                                title="Eliminar"
                              >
                                <IconTrash className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {registros.length > PREVIEW_MAX && (
                <p className="mt-1 text-[10px] text-slate-600">
                  …y {registros.length - PREVIEW_MAX} más.
                </p>
              )}
            </div>
          )}

          {registros.length === 0 && (resultado.errores || []).length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-100">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>No se pudo extraer ningún registro.</span>
            </div>
          )}
          </div>
        )}
      </Paso>

      {/* Paso 3 — Guardar en el servidor */}
      <Paso
        n="3"
        titulo="Guardá el histórico"
        ayuda="Se guarda el historial en Salida\Stock-Historico.xlsx y los PDF pasen solos de Entrada a procesados."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-400">
            {carpeta ? (
              <>
                STORK: <span className="font-mono text-slate-200">{carpeta.nombre}</span> · todo automático
              </>
            ) : (
              <>
                Elegí STORK en el paso 2 antes de incorporar.
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={incorporar}
            disabled={registros.length === 0 || incorporando || !carpeta || !centro || !carga}
            className="btn-primary"
          >
            <IconCheck className="h-4 w-4" />
            {incorporando
              ? 'Incorporando…'
              : registros.length > 0
                ? `Incorporar ${registros.length} registro${registros.length === 1 ? '' : 's'}`
                : 'Incorporar'}
          </button>
          <span className="text-[11px]">
            {(!centro || !carga) && <span className="text-amber-400">Falta elegir Centro y Carga. </span>}
            {!carpeta && <span className="text-amber-400">Falta elegir STORK en el paso 2. </span>}
            {registros.length === 0 && <span className="text-slate-500">Cargá tickets para empezar.</span>}
          </span>
        </div>
      </Paso>

      {procesando && <ProcessingOverlay archivos={files.length} />}

      {alertas.length > 0 && mostrarModalDuplicados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-night-900 border border-white/10 rounded-lg p-5 w-full max-w-2xl mx-4 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-amber-500/20 rounded-full p-2 shrink-0">
                <IconAlert className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 mb-1">
                  Remito(s) ya existente(s) en el historial
                </h2>
                <p className="text-sm text-slate-400">
                  Estos {alertas.length} remito(s) ya fueron cargados anteriormente. No se agregarán de nuevo.
                </p>
              </div>
            </div>
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="text-left border-b border-white/5 mb-1 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-1 font-semibold">Archivo</th>
                  <th className="pb-1 font-semibold">Proveedor</th>
                  <th className="pb-1 font-semibold">N Remito</th>
                  <th className="pb-1 font-semibold">Fecha</th>
                  <th className="pb-1 font-semibold">Material</th>
                  <th className="pb-1 font-semibold">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {alertas.map((a, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-1.5 text-slate-300 font-mono text-[11px]">{a.Archivo ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Proveedor ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a['N Remito'] ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Fecha ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Material ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Neto ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMostrarModalDuplicados(false)}
                className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 text-sm font-medium transition"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Paso({ n, titulo, ayuda, children }) {
  return (
    <section className="card !p-3 space-y-3">
      <header className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-falpat/20 font-mono text-xs font-bold text-falpat-soft">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{titulo}</h2>
          {ayuda && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{ayuda}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, cls }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2 text-center">
      <div className={`font-mono text-sm font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

const MENSAJES_OCR = [
  'Escaneando documentos…',
  'Leyendo textos con OCR…',
  'Detectando patentes…',
  'Buscando remitos…',
  'Calculando pesos…',
  'Validando duplicados…',
  'Casi listo…',
];

function ProcessingOverlay({ archivos }) {
  const [mensajeIdx, setMensajeIdx] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const msgInterval = setInterval(() => {
      setMensajeIdx((i) => (i + 1) % MENSAJES_OCR.length);
    }, 1200);
    const progInterval = setInterval(() => {
      const secs = (Date.now() - start) / 1000;
      setElapsed(secs);
      setProgreso(Math.min(secs * 8, 95));
    }, 200);
    return () => {
      clearInterval(msgInterval);
      clearInterval(progInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 backdrop-blur-sm">
      <div className="card !p-6 w-full max-w-sm mx-4 text-center space-y-4">
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-falpat/30 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-falpat/50 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <IconFileText className="h-6 w-6 text-falpat animate-bounce" />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-200">{MENSAJES_OCR[mensajeIdx]}</p>
          <p className="mt-1 text-xs text-slate-500">
            Procesando {archivos} archivo{archivos === 1 ? '' : 's'}…
          </p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-falpat via-emerald-400 to-amber-400 transition-all duration-200"
            style={{ width: `${progreso}%` }}
          />
        </div>

        <p className="font-mono text-[10px] text-slate-500">{elapsed.toFixed(1)}s</p>

        <p className="bg-gradient-to-r from-falpat via-emerald-400 to-amber-400 bg-clip-text text-[10px] font-bold text-transparent">
          Grupo Falpat SRL
        </p>

        <div className="flex justify-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-falpat animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
