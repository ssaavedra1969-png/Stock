'use client';

// ============================================================
// components/ModalForm.js
// Modal "AGREGAR REGISTRO" con formulario condicional:
// - Toggle Entrada / Salida.
// - Campos que cambian según el tipo de carga.
// - Autocompletado con sugerencias de la caché local.
// - Validación: todos los campos obligatorios excepto los que
//   corresponden solo al tipo de carga contrario.
// ============================================================
import { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import Autocomplete from './Autocomplete';
import { cn, todayISO } from '@/lib/utils';
import {
  IconX,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconCalendar,
  IconFileText,
  IconTruck,
  IconUser,
  IconScale,
  IconBuilding,
  IconBox,
} from './Icons';

const EMPTY_FORM = {
  producto: '',
  fechaRemito: todayISO(),
  patente: '',
  chofer: '',
  nroRemitoProveedor: '',
  nroRemitoFalpat: '',
  pesoProveedor: '',
  pesoBalanza: '',
  planta: '',
  cliente: '',
};

function Field({ label, icon, required, error, children }) {
  return (
    <div>
      <label className="label">
        {icon && <span className="mr-1.5 inline-block translate-y-0.5">{icon}</span>}
        {label}
        {required && <span className="ml-1 text-falpat">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function ModalForm() {
  const { modalOpen, closeModal, addRecord, uniqueValues } = useContext(AppContext);
  const [carga, setCarga] = useState('Entrada');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const requiredFields = useMemo(() => {
    const common = [
      'producto',
      'fechaRemito',
      'patente',
      'chofer',
      'nroRemitoFalpat',
      'pesoBalanza',
      'planta',
    ];
    return carga === 'Entrada'
      ? [...common, 'nroRemitoProveedor', 'pesoProveedor']
      : [...common, 'cliente'];
  }, [carga]);

  // Reset al abrir y cierre por teclado / bloqueo de scroll
  useEffect(() => {
    if (modalOpen) {
      setForm({ ...EMPTY_FORM, fechaRemito: todayISO() });
      setErrors({});
      setCarga('Entrada');
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  function setField(key) {
    return (e) => {
      const value = typeof e === 'string' ? e : e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
      if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    };
  }

  function switchCarga(next) {
    setCarga(next);
    setErrors({});
    setForm((f) => ({
      ...f,
      nroRemitoProveedor: '',
      pesoProveedor: '',
      cliente: '',
    }));
  }

  function validate() {
    const errs = {};
    for (const key of requiredFields) {
      if (!String(form[key] ?? '').trim()) errs[key] = 'Campo obligatorio';
    }
    if (!form.fechaRemito) errs.fechaRemito = 'Seleccioná una fecha';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        carga,
        producto: form.producto.trim(),
        fechaRemito: new Date(`${form.fechaRemito}T12:00:00`),
        patente: form.patente.trim().toUpperCase(),
        chofer: form.chofer.trim(),
        nroRemitoFalpat: form.nroRemitoFalpat.trim(),
        pesoBalanza: form.pesoBalanza.trim(),
        planta: form.planta.trim(),
        ...(carga === 'Entrada'
          ? {
              nroRemitoProveedor: form.nroRemitoProveedor.trim(),
              pesoProveedor: form.pesoProveedor.trim(),
            }
          : { cliente: form.cliente.trim() }),
      };
      await addRecord(payload);
      closeModal();
    } catch (err) {
      console.error('Error al guardar:', err);
      setErrors((er) => ({
        ...er,
        form: err.message || 'No se pudo guardar el registro.',
      }));
    } finally {
      setSubmitting(false);
    }
  }

  const isEntrada = carga === 'Entrada';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo registro de stock"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="glass-strong relative z-10 flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden animate-slide-up sm:mx-0 sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <IconBox className="h-5 w-5 text-falpat" />
              Nuevo registro
            </h2>
            <p className="section-sub mt-0.5">Stock de materiales · GRUPO FALPAT SRL</p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:border-white/25 hover:text-slate-100"
            aria-label="Cerrar"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            {/* Producto */}
            <Field
              label="Producto"
              icon={<IconBox className="h-4 w-4 text-slate-500" />}
              required
              error={errors.producto}
            >
              <Autocomplete
                options={uniqueValues.producto}
                value={form.producto}
                onChange={setField('producto')}
                error={errors.producto}
                placeholder="Elegí o escribí un producto nuevo"
              />
            </Field>

            {/* Toggle Entrada / Salida */}
            <div>
              <label className="label">Tipo de carga</label>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                <button
                  type="button"
                  onClick={() => switchCarga('Entrada')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider transition',
                    isEntrada
                      ? 'bg-falpat text-night-950 shadow-glow'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <IconArrowUpRight className="h-4 w-4" />
                  Entrada
                </button>
                <button
                  type="button"
                  onClick={() => switchCarga('Salida')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider transition',
                    !isEntrada
                      ? 'bg-volt text-night-950 shadow-[0_0_18px_-4px_rgba(255,214,10,0.6)]'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <IconArrowDownLeft className="h-4 w-4" />
                  Salida
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Los pesos se registran en toneladas (tn).
              </p>
            </div>

            {/* Campos según tipo de carga */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={isEntrada ? 'Fecha remito (Falpat)' : 'Fecha remito (Falpat SRL)'}
                icon={<IconCalendar className="h-4 w-4 text-slate-500" />}
                required
                error={errors.fechaRemito}
              >
                <input
                  type="date"
                  value={form.fechaRemito}
                  onChange={setField('fechaRemito')}
                  className={cn('field', errors.fechaRemito && 'field-error')}
                />
              </Field>

              <Field
                label="Patente"
                icon={<IconTruck className="h-4 w-4 text-slate-500" />}
                required
                error={errors.patente}
              >
                <Autocomplete
                  options={uniqueValues.patente}
                  value={form.patente}
                  onChange={setField('patente')}
                  error={errors.patente}
                  placeholder="Ej: AB123CD"
                />
              </Field>

              <Field
                label="Chofer"
                icon={<IconUser className="h-4 w-4 text-slate-500" />}
                required
                error={errors.chofer}
              >
                <Autocomplete
                  options={uniqueValues.chofer}
                  value={form.chofer}
                  onChange={setField('chofer')}
                  error={errors.chofer}
                  placeholder="Nombre y apellido"
                />
              </Field>

              <Field
                label={isEntrada ? 'Nro remito (Falpat)' : 'Nro remito (Falpat SRL)'}
                icon={<IconFileText className="h-4 w-4 text-slate-500" />}
                required
                error={errors.nroRemitoFalpat}
              >
                <input
                  type="text"
                  value={form.nroRemitoFalpat}
                  onChange={setField('nroRemitoFalpat')}
                  placeholder="Ej: 0001-002345"
                  className={cn('field', errors.nroRemitoFalpat && 'field-error')}
                />
              </Field>

              {isEntrada ? (
                <>
                  <Field
                    label="Nro remito (Proveedor)"
                    icon={<IconFileText className="h-4 w-4 text-slate-500" />}
                    required
                    error={errors.nroRemitoProveedor}
                  >
                    <input
                      type="text"
                      value={form.nroRemitoProveedor}
                      onChange={setField('nroRemitoProveedor')}
                      placeholder="Ej: F-000123"
                      className={cn('field', errors.nroRemitoProveedor && 'field-error')}
                    />
                  </Field>

                  <Field
                    label="Peso (Proveedor)"
                    icon={<IconScale className="h-4 w-4 text-slate-500" />}
                    required
                    error={errors.pesoProveedor}
                  >
                    <input
                      type="text"
                      value={form.pesoProveedor}
                      onChange={setField('pesoProveedor')}
                      placeholder="Toneladas (tn)"
                      className={cn('field', errors.pesoProveedor && 'field-error')}
                    />
                  </Field>
                </>
              ) : (
                <Field
                  label="Cliente"
                  icon={<IconBuilding className="h-4 w-4 text-slate-500" />}
                  required
                  error={errors.cliente}
                >
                  <Autocomplete
                    options={uniqueValues.cliente}
                    value={form.cliente}
                    onChange={setField('cliente')}
                    error={errors.cliente}
                    placeholder="Nombre del cliente"
                  />
                </Field>
              )}

              <Field
                label="Peso (Balanza)"
                icon={<IconScale className="h-4 w-4 text-slate-500" />}
                required
                error={errors.pesoBalanza}
              >
                <Autocomplete
                  options={uniqueValues.pesoBalanza}
                  value={form.pesoBalanza}
                  onChange={setField('pesoBalanza')}
                  error={errors.pesoBalanza}
                  placeholder="Toneladas (tn)"
                />
              </Field>

              <Field
                label="Planta"
                icon={<IconBuilding className="h-4 w-4 text-slate-500" />}
                required
                error={errors.planta}
              >
                <Autocomplete
                  options={uniqueValues.planta}
                  value={form.planta}
                  onChange={setField('planta')}
                  error={errors.planta}
                  placeholder="Nombre de la planta"
                />
              </Field>
            </div>

            {errors.form && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {errors.form}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/20 px-5 py-4 sm:px-7">
            <button type="button" onClick={closeModal} className="btn-ghost" disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-night-950/40 border-t-night-950" />
                  Guardando…
                </>
              ) : (
                'Guardar registro'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
