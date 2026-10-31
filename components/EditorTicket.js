'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  revisarRegistro,
  largoRemitoEsperado,
  normalizeRemito,
} from '@/lib/tickets/extract.mjs';
import { MATERIALES_OK } from '@/lib/tickets/extract.mjs';
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconFileText,
  IconArrowUpRight,
} from './Icons';

const PROVEEDORES = ['SPOSITO', 'LCE', 'CEMENTO AVELLANEDA'];
const RAZONES = ['ARENERA CANELONES', 'ALMAJO NORTE'];

const CAMPOS_FORM = [
  { key: 'Fecha', label: 'Fecha', placeholder: 'dd/mm/aaaa' },
  { key: 'N Remito', label: 'N° Remito', mono: true },
  { key: 'Proveedor', label: 'Proveedor', list: PROVEEDORES },
  { key: 'Razon Social', label: 'Razón Social', list: RAZONES },
  { key: 'Material', label: 'Material', list: [...MATERIALES_OK], ancho: 2 },
  { key: 'Neto', label: 'Neto (kg)', mono: true },
  { key: 'Peso Neto', label: 'Peso Neto (kg)', mono: true },
  { key: 'Chofer', label: 'Chofer', ancho: 2 },
  { key: 'Pat. Chasis', label: 'Patente chasis', mono: true },
];

function listaId(campo) {
  return `ticket-lista-${campo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// Si el remito no tiene el largo habitual, pregunta antes de guardar pero
// permite continuar. La confirmación queda en el registro para que no vuelva
// a marcarse como observación.
function conRemitoConfirmado(form) {
  if (form?._confirmados?.['N Remito']) return form;
  const valor = String(form?.['N Remito'] ?? '').trim();
  if (!valor || valor.toUpperCase() === 'N/D') return form;
  const esperado = largoRemitoEsperado(form.Proveedor);
  if (!esperado) return form;
  const digitos = normalizeRemito(valor)?.length || 0;
  if (digitos === esperado) return form;
  const ok = window.confirm(
    `El N° de remito "${valor}" tiene ${digitos} dígito(s); lo normal para ${form.Proveedor} es ${esperado}. ¿Es correcto?`
  );
  if (!ok) return null;
  return { ...form, _confirmados: { ...(form._confirmados || {}), 'N Remito': true } };
}

/**
 * Input con lista desplegable que muestra TODAS las opciones al hacer foco,
 * independientemente del valor actual, y también permite tipear para filtrar.
 */
function InputConLista({ value, onChange, lista, placeholder, mono, error }) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);

  // Al abrir, inicializamos el filtro vacío para mostrar todas las opciones
  function handleFocus() {
    setFiltro('');
    setAbierto(true);
  }

  function handleBlur(e) {
    // Si el foco va a algún elemento dentro del wrapper, no cerramos
    if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget)) return;
    setAbierto(false);
  }

  function handleInput(e) {
    const v = e.target.value;
    onChange(v);
    setFiltro(v);
    setAbierto(true);
  }

  function seleccionar(opcion) {
    onChange(opcion);
    setAbierto(false);
    setFiltro('');
    inputRef.current?.blur();
  }

  const opciones = lista.filter((o) =>
    filtro ? o.toLowerCase().includes(filtro.toLowerCase()) : true
  );

  return (
    <div ref={wrapperRef} className="relative" onBlur={handleBlur}>
      <input
        ref={inputRef}
        type="text"
        value={value ?? ''}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
        className={`field !py-2 text-xs w-full ${mono ? 'font-mono' : ''} ${error ? 'field-error' : ''}`}
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-night-900 shadow-xl">
          {opciones.map((opcion) => (
            <li
              key={opcion}
              onMouseDown={(e) => { e.preventDefault(); seleccionar(opcion); }}
              className={`cursor-pointer px-3 py-2 text-xs hover:bg-falpat/20 hover:text-white ${
                opcion === value ? 'bg-falpat/10 text-falpat-soft font-semibold' : 'text-slate-300'
              }`}
            >
              {opcion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditorTicket({
  registro,
  index,
  total,
  pendientes,
  centro,
  carga,
  materiales,
  razones,
  onClose,
  onSave,
  onNavigate,
}) {
  const [form, setForm] = useState(() => ({
    ...registro,
    _revision: { ...(registro._revision || {}) },
  }));

  useEffect(() => {
    setForm({
      ...registro,
      _revision: { ...(registro._revision || {}) },
    });
  }, [registro]);

  const errores = useMemo(() => revisarRegistro(form), [form]);
  const nErrores = Object.keys(errores).length;
  const materialNuevo = useMemo(() => {
    const valor = String(form.Material || '').trim();
    if (!valor) return false;
    return !(materiales || [...MATERIALES_OK]).some(
      (m) => String(m).trim().toLowerCase() === valor.toLowerCase()
    );
  }, [form.Material, materiales]);
  const razonNueva = useMemo(() => {
    const valor = String(form['Razon Social'] || '').trim();
    if (!valor) return false;
    return !((razones || RAZONES).some((r) => String(r).trim().toLowerCase() === valor.toLowerCase()));
  }, [form, razones]);
  const puedeAnterior = index > 0;
  const puedeSiguiente = index < total - 1;

  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    if (form._file) {
      const url = URL.createObjectURL(form._file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPdfUrl(
      form.Archivo ? `/api/tickets/pdf?file=${encodeURIComponent(form.Archivo)}` : ''
    );
  }, [form._file, form.Archivo]);

  const pdfSrc =
    pdfUrl && !form._file ? `${pdfUrl}#toolbar=1&navpanes=0&view=FitH` : pdfUrl;

  const guardar = useCallback(
    (irSiguiente) => {
      const confirmado = conRemitoConfirmado(form);
      if (!confirmado) return;
      if (confirmado !== form) setForm(confirmado);
      onSave(confirmado, irSiguiente);
    },
    [form, onSave]
  );

  function setCampo(campo, valor) {
    setForm((prev) => {
      let next = { ...prev, [campo]: valor };
      if (campo === 'Neto' || campo === 'Peso Neto') {
        if (valor === '' || valor === null || valor === undefined) {
          next = { ...next, [campo]: '' };
        } else {
          const num = Number(valor);
          next = { ...next, [campo]: isNaN(num) ? valor : num };
        }
      }
      if (campo === 'N Remito' || campo === 'Proveedor') {
        if (next._confirmados) {
          const confirmados = { ...next._confirmados };
          delete confirmados['N Remito'];
          if (Object.keys(confirmados).length) next._confirmados = confirmados;
          else delete next._confirmados;
        }
      }
      if (next._revision) {
        const revision = { ...next._revision };
        delete revision[campo];
        if (Object.keys(revision).length) next._revision = revision;
        else delete next._revision;
      }
      return next;
    });
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        guardar(event.shiftKey);
        return;
      }
      if (event.altKey && event.key === 'ArrowLeft' && puedeAnterior) {
        event.preventDefault();
        onNavigate(index - 1);
      }
      if (event.altKey && event.key === 'ArrowRight' && puedeSiguiente) {
        event.preventDefault();
        onNavigate(index + 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, puedeAnterior, puedeSiguiente, onClose, guardar, onNavigate]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-7xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-white/10 bg-night-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-entrada">
                Registro {index + 1} de {total}
              </span>
              {nErrores > 0 ? (
                <span className="badge border-red-400/30 bg-red-500/10 text-red-200">
                  <IconAlert className="h-3 w-3" />
                  {nErrores} por revisar
                </span>
              ) : (
                <span className="badge border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                  <IconCheck className="h-3 w-3" />
                  Sin observaciones
                </span>
              )}
              {form.Estado === 'DUPLICADO' && (
                <span className="badge badge-salida">Duplicado</span>
              )}
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {form.Archivo || 'Sin archivo'}
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
              <span>Centro: <b className="text-slate-200">{centro || 'pendiente'}</b></span>
              <span>Carga: <b className="text-slate-200">{carga || 'pendiente'}</b></span>
              <span>Pendientes: <b className="text-amber-300">{pendientes}</b></span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            title="Cerrar (Esc)"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          <section className="hidden min-h-0 flex-col border-r border-white/10 bg-black/30 lg:flex">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                PDF original
              </span>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-falpat-soft hover:text-white"
                >
                  Abrir <IconArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </div>
            {pdfUrl ? (
              <iframe
                key={pdfSrc}
                src={pdfSrc}
                title={`PDF ${form.Archivo}`}
                className="min-h-0 w-full flex-1 bg-white"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-slate-500">
                <IconFileText className="h-8 w-8" />
                <p className="text-xs">Este registro no tiene un PDF asociado.</p>
              </div>
            )}
          </section>

          <section className="min-h-0 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CAMPOS_FORM.map((campo) => {
                const error = errores[campo.key];
                const lista =
                  campo.key === 'Material'
                    ? materiales || campo.list
                    : campo.key === 'Razon Social'
                      ? razones || campo.list
                      : campo.list;
                return (
                  <label key={campo.key} className={campo.ancho === 2 ? 'sm:col-span-2' : ''}>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {campo.label}
                    </span>
                    {lista ? (
                      <InputConLista
                        value={form[campo.key] ?? ''}
                        onChange={(v) => setCampo(campo.key, v)}
                        lista={lista}
                        placeholder={campo.placeholder}
                        mono={campo.mono}
                        error={!!error}
                      />
                    ) : (
                      <input
                        type="text"
                        value={form[campo.key] ?? ''}
                        onChange={(event) => setCampo(campo.key, event.target.value)}
                        placeholder={campo.placeholder}
                        autoComplete="off"
                        className={`field !py-2 text-xs ${campo.mono ? 'font-mono' : ''} ${
                          error ? 'field-error' : ''
                        }`}
                      />
                    )}
                    {error && (
                      <span className="mt-1 block text-[10px] leading-snug text-red-300">
                        {error}
                      </span>
                    )}
                    {campo.key === 'Material' && materialNuevo && !error && (
                      <span className="mt-1 block text-[10px] leading-snug text-emerald-300">
                        Material nuevo: se agregará a la lista al guardar.
                      </span>
                    )}
                    {campo.key === 'Razon Social' && razonNueva && !error && (
                      <span className="mt-1 block text-[10px] leading-snug text-emerald-300">
                        Razón social nueva: se agregará a la lista al guardar.
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-falpat-soft hover:text-white lg:hidden"
              >
                <IconFileText className="h-3.5 w-3.5" />
                Abrir PDF original
                <IconArrowUpRight className="h-3 w-3" />
              </a>
            )}

            {nErrores > 0 && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-100">
                <div className="flex items-center gap-2 font-semibold">
                  <IconAlert className="h-3.5 w-3.5" />
                  Quedan {nErrores} observaciones
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {Object.entries(errores).map(([campo, motivo]) => (
                    <li key={campo}>
                      <b>{campo}:</b> {motivo}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-red-200/70">
                  Podés guardar igual: el registro seguirá marcado para revisión.
                </p>
              </div>
            )}

            <p className="mt-4 text-[10px] text-slate-600">
              Atajos: Ctrl+Enter guarda · Ctrl+Shift+Enter guarda y sigue · Alt+←/→ navega · Esc cierra
            </p>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(index - 1)}
              disabled={!puedeAnterior}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <IconChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => onNavigate(index + 1)}
              disabled={!puedeSiguiente}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              Siguiente
              <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => guardar(false)}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Guardar
            </button>
            <button
              type="button"
              onClick={() => guardar(true)}
              className="btn-primary !px-3 !py-1.5 !text-xs"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Guardar y siguiente
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
