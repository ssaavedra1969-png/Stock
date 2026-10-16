'use client';

// ============================================================
// app/tickets/page.js
// Sección Tickets: carga de PDFs de pesaje (remito + ticket de balanza).
//
// Flujo: seleccionás uno o varios PDF (o los arrastrás) → se procesan
// con OCR en el servidor → se previsualizan los datos extraídos → se
// puede descargar el Excel. Los PDF quedan en la carpeta "procesados"
// y los datos se incorporan a la base de conocimiento para detectar
// remitos repetidos y valores similares.
// ============================================================
import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  IconUpload,
  IconFileText,
  IconDownload,
  IconCheck,
  IconAlert,
  IconX,
  IconRefresh,
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
];

const PREVIEW_MAX = 100;

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

export default function TicketsPage() {
  const { showToast } = useApp();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const registros = useMemo(() => resultado?.registros || [], [resultado]);

  const alertas = useMemo(() => {
    if (!resultado) return [];
    const a = [];
    for (const r of registros) {
      if (r.Estado === 'DUPLICADO') a.push(r);
    }
    return a;
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

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function limpiar() {
    setFiles([]);
    setResultado(null);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function procesar() {
    if (files.length === 0) return;
    setProcesando(true);
    setErrorMsg('');
    setResultado(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.name);
      const res = await fetch('/api/tickets', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error ${res.status} al procesar.`);
      setResultado(data);
      const nuevos = data.nuevos ?? 0;
      const dup = data.duplicados ?? 0;
      showToast(`Procesado: ${nuevos} nuevo(s), ${dup} duplicado(s)`);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudieron procesar los archivos.');
      showToast('Error al procesar los tickets', 'error');
    } finally {
      setProcesando(false);
    }
  }

  async function descargarExcel() {
    if (!resultado) return;
    const XLSX = await import('xlsx');
    const headers = [...CAMPOS, 'Archivo', 'Estado'];
    const aoa = [headers, ...registros.map((r) => headers.map((h) => r[h] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    XLSX.writeFile(wb, `tickets_${ahora()}.xlsx`);
    showToast('Excel generado');
  }

  const hayResultado = !!resultado;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-sub mb-1">Lectura de remito + ticket de balanza (OCR)</p>
          <h1 className="section-title !text-2xl">Cargar tickets de pesaje</h1>
        </div>
        {(files.length > 0 || hayResultado) && (
          <button type="button" onClick={limpiar} className="btn-ghost" disabled={procesando}>
            <IconRefresh className="h-4 w-4" />
            Nueva carga
          </button>
        )}
      </div>

      {/* Paso 1: archivos */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-falpat/15 font-mono text-xs font-bold text-falpat-soft">1</span>
          <h2 className="section-title !text-base">Seleccionar archivos</h2>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          className={
            'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition ' +
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
          <IconFileText className="h-7 w-7 text-falpat" />
          <span className="text-sm font-semibold text-slate-200">
            Arrastrá los PDF acá o elegí uno o varios
          </span>
          <span className="text-[11px] text-slate-500">
            Podés cargar de a un archivo o seleccionar varios a la vez (.pdf, hasta 25 MB c/u)
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-ghost mt-2"
            disabled={procesando}
          >
            <IconUpload className="h-4 w-4" />
            Elegir archivos
          </button>
        </div>

        {files.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {files.length} archivo{files.length === 1 ? '' : 's'} seleccionado{files.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                >
                  <IconFileText className="h-4 w-4 shrink-0 text-falpat-soft" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{f.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">{fmtBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={procesando}
                    aria-label={`Quitar ${f.name}`}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-red-300"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Paso 2: procesar */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-falpat/15 font-mono text-xs font-bold text-falpat-soft">2</span>
          <h2 className="section-title !text-base">Procesar</h2>
        </div>
        <p className="text-[12px] leading-relaxed text-slate-500">
          Al procesar se extraen los datos (fecha, proveedor, remito, razón social, material, neto,
          peso neto, chofer y patente). Se valida si el remito ya fue cargado y se detectan valores
          similares. Los PDF se mueven a <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">procesados</code> y
          se actualiza la base de conocimiento.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={procesar}
            disabled={procesando || files.length === 0}
            className="btn-primary"
          >
            <IconUpload className="h-4 w-4" />
            {procesando
              ? 'Procesando…'
              : files.length === 0
                ? 'Sin archivos'
                : `Procesar ${files.length} archivo${files.length === 1 ? '' : 's'}`}
          </button>
        </div>
        {procesando && (
          <p className="text-right text-[11px] text-slate-500">
            El OCR puede demorar unos segundos por archivo. No cierres la ventana.
          </p>
        )}
      </div>

      {/* Resultado */}
      {hayResultado && (
        <div className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title !text-base">Resultado</h2>
            <button
              type="button"
              onClick={descargarExcel}
              disabled={registros.length === 0}
              className="btn-volt"
            >
              <IconDownload className="h-4 w-4" />
              Descargar Excel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Archivos" value={resultado.total ?? 0} cls="text-slate-100" />
            <Stat label="Nuevos" value={resultado.nuevos ?? 0} cls="text-emerald-400" />
            <Stat label="Duplicados" value={resultado.duplicados ?? 0} cls="text-amber-400" />
            <Stat label="Similares" value={resultado.similares ?? 0} cls="text-falpat-soft" />
            <Stat label="Errores" value={(resultado.errores || []).length} cls={(resultado.errores || []).length ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {alertas.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {alertas.length} remito(s) ya existían en la base (mismo proveedor + N° de remito) y se
                marcaron como duplicados.
              </span>
            </div>
          )}

          {(resultado.alertas || []).length > 0 && (
            <div className="rounded-xl border border-falpat/30 bg-falpat/10 p-3 text-[13px] text-sky-100">
              <p className="font-semibold uppercase tracking-wider text-sky-200">
                Valores similares detectados ({(resultado.alertas || []).length})
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {(resultado.alertas || []).map((a, i) => (
                  <li key={i} className="font-mono text-[12px]">
                    {a.archivo} · {a.campo}: “{a.valor}” ~ “{a.similar_a}” ({a.ratio}) [{a.accion}]
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(resultado.errores || []).length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-200">
              <p className="font-semibold uppercase tracking-wider text-red-300">
                Archivos con error ({(resultado.errores || []).length})
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {(resultado.errores || []).map((e, i) => (
                  <li key={i} className="font-mono text-[12px]">{e.archivo}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}

          {registros.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Datos extraídos (primeros {Math.min(PREVIEW_MAX, registros.length)})
              </p>
              <div className="table-scroll rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-night-800">
                    <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {CAMPOS.map((c) => (
                        <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>
                      ))}
                      <th className="px-3 py-2 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.slice(0, PREVIEW_MAX).map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {CAMPOS.map((c) => (
                          <td key={c} className="whitespace-nowrap px-3 py-1.5 text-slate-300">
                            {c === 'N Remito' || c === 'Pat. Chasis'
                              ? <span className="font-mono text-xs">{r[c] ?? '—'}</span>
                              : (r[c] ?? '—')}
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          {r.Estado === 'DUPLICADO' ? (
                            <span className="badge badge-salida">Duplicado</span>
                          ) : (
                            <span className="badge badge-entrada">Nuevo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {registros.length > PREVIEW_MAX && (
                <p className="mt-1 text-[11px] text-slate-600">
                  …y {registros.length - PREVIEW_MAX} más. Descargá el Excel para ver todos.
                </p>
              )}
            </div>
          )}

          {registros.length === 0 && (resultado.errores || []).length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>No se pudo extraer ningún registro. Revisá los errores de arriba.</span>
            </div>
          )}

          {resultado.informe && (
            <p className="flex items-center gap-2 text-[11px] text-slate-500">
              <IconCheck className="h-3.5 w-3.5 text-emerald-400" />
              Informe del lote guardado en: <span className="font-mono">{resultado.informe}</span>
            </p>
          )}
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
