'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import SectionHero from '@/components/SectionHero';
import { leerFilasExcel } from '@/lib/importar';
import { parsearExcelRemitosDev } from '@/lib/importar-remitos-dev';
import { IconFileSpreadsheet, IconUpload } from '@/components/Icons';

function displayDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function number(value) {
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export default function ImportarRemitosHistorico({ mode = 'dev' }) {
  const isProduction = mode === 'production';
  const endpoint = isProduction
    ? '/api/db/import-remitos-production'
    : '/api/db/import-remitos-dev';
  const { records, loading, reload, showToast } = useApp();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [environment, setEnvironment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedMatches, setSelectedMatches] = useState([]);

  useEffect(() => {
    fetch(endpoint)
      .then(async (response) => {
        const data = await response.json();
        setEnvironment({ ...data, status: response.status });
      })
      .catch((cause) => setEnvironment({ enabled: false, error: cause.message }));
  }, [endpoint]);

  const codeSummary = useMemo(() => {
    if (!analysis) return { matched: 0, unmatched: 0 };
    return [...analysis.records, ...analysis.existingMatches.map((item) => item.incoming)].reduce(
      (summary, record) => {
        if (record.codigoProducto) summary.matched += 1;
        else summary.unmatched += 1;
        return summary;
      },
      { matched: 0, unmatched: 0 }
    );
  }, [analysis]);

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setAnalysis(null);
    setSelectedMatches([]);
    setFileName(file.name);
    setBusy(true);
    try {
      const rows = await leerFilasExcel(file);
      setAnalysis(parsearExcelRemitosDev(rows, records));
    } catch (cause) {
      setError(cause.message || 'No se pudo analizar el archivo.');
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setBusy(false);
    }
  }

  async function importEntries() {
    if (
      !analysis ||
      analysis.errors.length ||
      analysis.remitoConflicts.length ||
      (!analysis.records.length && !selectedMatches.length)
    ) return;
    const reconciliations = analysis.existingMatches
      .filter((item) => selectedMatches.includes(item.existing.id))
      .map((item) => ({ id: item.existing.id, record: item.incoming }));
    const accepted = window.confirm(
      `Confirmás agregar ${analysis.records.length} Entrada(s) nueva(s) y completar ${reconciliations.length} registro(s) existente(s) en ${isProduction ? 'PRODUCCIÓN (main)' : 'la rama dev'}?`
    );
    if (!accepted) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmar: true,
          records: analysis.records,
          reconciliations,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
      setResult(data);
      setAnalysis(null);
      setFileName('');
      setSelectedMatches([]);
      if (inputRef.current) inputRef.current.value = '';
      await reload();
      showToast(
        `${data.insertados} Entrada(s) nueva(s) y ${data.actualizados} registro(s) existente(s) completado(s) en ${data.branch}`
      );
    } catch (cause) {
      setError(cause.message || `Falló la importación a ${isProduction ? 'producción' : 'dev'}.`);
    } finally {
      setBusy(false);
    }
  }

  const canImport =
    environment?.enabled &&
    (analysis?.records.length > 0 || selectedMatches.length > 0) &&
    analysis.errors.length === 0 &&
    analysis.remitoConflicts.length === 0 &&
    analysis.excludedRows.length === 0 &&
    !busy;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <SectionHero
        icon={IconUpload}
        title={isProduction ? 'Importar histórico de Entradas' : 'Prueba de importación de Entradas'}
        tag={isProduction ? 'Producción · main' : 'Solo desarrollo'}
        subtitle={`Previsualiza Stock-Historico.xlsx antes de guardar en ${isProduction ? 'producción' : 'dev'}`}
      />

      <section className="card space-y-4 border-amber-400/30">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-amber-400/10 p-2 text-amber-300">
            <IconFileSpreadsheet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              {isProduction ? 'Producción protegida' : 'Entorno protegido'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {isProduction
                ? 'La importación solo se habilita en Vercel cuando GITHUB_BRANCH es exactamente main.'
                : 'La importación se bloquea si la app corre en Vercel o si GITHUB_BRANCH no es exactamente dev.'}
              Solo se procesan filas con Carga = Entrada.
            </p>
            <p className={`mt-2 text-xs font-semibold ${environment?.enabled ? 'text-emerald-400' : 'text-amber-300'}`}>
              {environment
                ? environment.enabled
                  ? `Habilitado · entorno ${environment.environment} · rama ${environment.branch}`
                  : `Bloqueado · ${environment.error || `entorno ${environment.environment}, rama ${environment.branch}`}`
                : 'Verificando entorno…'}
            </p>
          </div>
        </div>
        <label className="omx-dropzone flex cursor-pointer flex-col items-center justify-center gap-2 p-7 text-center">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFile}
            disabled={!environment?.enabled || busy || loading}
            className="hidden"
          />
          <IconFileSpreadsheet className="h-7 w-7 text-falpat" />
          <span className="text-sm font-semibold text-slate-100">
            {busy ? 'Procesando…' : fileName || 'Elegir Stock-Historico.xlsx'}
          </span>
          <span className="text-[11px] text-slate-500">Se lee en el navegador; todavía no se guarda nada.</span>
        </label>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Importación completada: {result.insertados} Entrada(s) nueva(s) y {result.actualizados} registro(s) existente(s) completado(s) · total {isProduction ? 'producción' : 'dev'} {result.total} ·
          rama {result.branch}.{isProduction ? ' La base de producción fue actualizada.' : ' No se modificó producción.'}
        </div>
      )}

      {analysis && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Previsualización — no se guardó</h2>
              <p className="mt-1 text-xs text-slate-400">
                {analysis.records.length} Entrada(s) nueva(s), {analysis.existingMatches.length} posible(s) coincidencia(s) con registros existentes, de {analysis.totalRows} fila(s).
                {analysis.skippedDuplicates.length > 0 && ` ${analysis.skippedDuplicates.length} duplicada(s) exacta(s) omitida(s).`}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-lg border border-emerald-500/20 px-3 py-2 text-emerald-300">
                Código exacto: {codeSummary.matched}
              </span>
              <span className="rounded-lg border border-amber-500/20 px-3 py-2 text-amber-300">
                Sin código: {codeSummary.unmatched}
              </span>
            </div>
          </div>

          {analysis.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              <strong>Corregí estos errores antes de continuar:</strong>
              <ul className="mt-2 space-y-1">
                {analysis.errors.map((item) => (
                  <li key={item.row}>Fila {item.row}: {item.details.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.excludedRows.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Hay {analysis.excludedRows.length} fila(s) que no son Entrada. No se importará el archivo mixto.
            </div>
          )}

          {analysis.remitoConflicts.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              No se agregan automáticamente estos remitos porque ya existen y no se identificaron como una única carga manual:
              <ul className="mt-2 space-y-1">
                {analysis.remitoConflicts.map((item) => (
                  <li key={`${item.row}-${item.proveedor}-${item.remito}`}>
                    Fila {item.row}: {item.proveedor} · {item.remito} — {item.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.existingMatches.length > 0 && (
            <div className="space-y-2 rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-200">
                  Posibles registros ya cargados
                </h3>
                <p className="mt-1 text-[11px] text-slate-400">
                  Revisá cada coincidencia. Al seleccionar, solo se completan campos vacíos; los valores existentes nunca se reemplazan. Los registros antiguos pueden no tener origen identificado.
                </p>
              </div>
              {analysis.existingMatches.map((item) => {
                const fieldsToFill = Object.keys(item.completar);
                const selected = selectedMatches.includes(item.existing.id);
                const manual = item.origen === 'manual';
                return (
                  <label
                    key={`${item.row}-${item.existing.id}`}
                    className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-sky-400"
                      checked={selected}
                      disabled={fieldsToFill.length === 0 || busy}
                      onChange={(event) => {
                        setSelectedMatches((current) =>
                          event.target.checked
                            ? [...current, item.existing.id]
                            : current.filter((id) => id !== item.existing.id)
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-100">
                        Fila {item.row}: {item.incoming.proveedor} · Remito {item.incoming.nroRemitoProveedor}
                      </span>
                      <span className="mt-1 block text-slate-400">
                        {manual ? 'Carga manual identificada' : 'Registro previo · origen no identificado'}: {item.existing.producto || 'sin material'} · {displayDate(item.existing.fechaRemito)}
                      </span>
                      {!manual && (
                        <span className="mt-1 block text-amber-300">
                          Confirmá que esta coincidencia corresponde a la carga manual pendiente; no se puede asegurar el origen histórico.
                        </span>
                      )}
                      {fieldsToFill.length > 0 ? (
                        <span className="mt-1 block text-emerald-300">
                          Se completarían: {fieldsToFill.join(', ')}
                        </span>
                      ) : (
                        <span className="mt-1 block text-amber-300">
                          No hay campos vacíos para completar.
                        </span>
                      )}
                      {item.conflictos.length > 0 && (
                        <span className="mt-2 block rounded border border-amber-400/20 bg-amber-400/[0.06] p-2 text-amber-100">
                          Diferencias para revisar (no se sobrescribirán):
                          {item.conflictos.map((conflict) => (
                            <span key={conflict.campo} className="mt-1 block">
                              {conflict.campo}: registro &ldquo;{String(conflict.actual)}&rdquo; · PDF &ldquo;{String(conflict.pdf)}&rdquo;
                            </span>
                          ))}
                        </span>
                      )}
                      {selected && (
                        <span className="mt-1 block font-semibold text-sky-200">
                          Confirmaste completar únicamente los campos vacíos de este registro
                          {manual ? '.' : ' y aceptaste el origen sin identificar.'}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {analysis.records.length > 0 && (
            <div className="table-scroll rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-night-800">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                    {['Fila', 'Fecha', 'Proveedor', 'N Remito', 'Razon Social', 'Material', 'Código', 'Neto (kg)', 'Peso Neto (kg)', 'Chofer', 'Patente', 'Centro', 'Carga'].map((header) => (
                      <th key={header} className="whitespace-nowrap px-2 py-2">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.records.map((record) => (
                    <tr key={`${record._sourceRow}-${record.nroRemitoProveedor}`} className="border-t border-white/5">
                      <td className="px-2 py-2 text-slate-500">{record._sourceRow}</td>
                      <td className="whitespace-nowrap px-2 py-2">{displayDate(record.fechaRemito)}</td>
                      <td className="px-2 py-2">{record.proveedor}</td>
                      <td className="px-2 py-2 font-mono">{record.nroRemitoProveedor}</td>
                      <td className="px-2 py-2">{record.razonSocial}</td>
                      <td className="px-2 py-2">{record.producto}</td>
                      <td className={`px-2 py-2 font-mono ${record.codigoProducto ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {record.codigoProducto || '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{number(record._netoKg)}</td>
                      <td className="px-2 py-2 text-right font-mono">{number(record._pesoNetoKg)}</td>
                      <td className="px-2 py-2">{record.chofer}</td>
                      <td className="px-2 py-2 font-mono">{record.patente}</td>
                      <td className="px-2 py-2">{record.planta}</td>
                      <td className="px-2 py-2">{record.carga}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analysis.skippedDuplicates.length > 0 && (
            <details className="text-xs text-amber-200">
              <summary className="cursor-pointer">Ver filas duplicadas omitidas</summary>
              <ul className="mt-2 space-y-1">
                {analysis.skippedDuplicates.map((item) => (
                  <li key={`${item.row}-${item.remito}`}>Fila {item.row}: {item.proveedor} · {item.remito}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[11px] text-slate-500">
              Las cantidades para la base se normalizan a tn. Neto y Peso Neto se conservan como campos distintos.
            </p>
            <button type="button" className="btn-primary" onClick={importEntries} disabled={!canImport}>
              {selectedMatches.length > 0
                ? `Confirmar cambios solo en ${isProduction ? 'producción' : 'dev'} (${analysis.records.length} nueva(s) · ${selectedMatches.length} completar)`
                : `Confirmar e importar solo a ${isProduction ? 'producción' : 'dev'}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
