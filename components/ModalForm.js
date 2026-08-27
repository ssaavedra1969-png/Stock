'use client';

// ============================================================
// components/ModalForm.js
// Modal "AGREGAR / EDITAR REGISTRO" con formulario condicional:
// - Toggle Entrada / Salida arriba de todo.
// - Campos agrupados en secciones para que la carga sea clara.
// - Autocompletado con sugerencias de la caché local.
// - Validación: todos los campos obligatorios excepto los que
//   corresponden solo al tipo de carga contrario.
// ============================================================
import { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import Autocomplete from './Autocomplete';
import { cn, todayISO, toMillis } from '@/lib/utils';
import {
  unidadPorCodigo,
  unidadPorNombre,
  normalizar,
  CATALOGO_PRODUCTOS,
  cantidadConUnidad,
} from '@/lib/productos';
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
  codigoProducto: '',
  fechaRemito: todayISO(),
  patente: '',
  chofer: '',
  nroRemitoProveedor: '',
  nroRemitoFalpat: '',
  pesoProveedor: '',
  pesoBalanza: '',
  planta: '',
  cliente: '',
  proveedor: '',
};

// "2026-01-02T12:00:00.000Z" -> "2026-01-02" (para <input type="date">)
function toDateInput(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromRecord(rec) {
  return {
    producto: rec.producto || '',
    codigoProducto: rec.codigoProducto || '',
    fechaRemito: toDateInput(rec.fechaRemito) || todayISO(),
    patente: rec.patente || '',
    chofer: rec.chofer || '',
    nroRemitoProveedor: rec.nroRemitoProveedor || '',
    nroRemitoFalpat: rec.nroRemitoFalpat || '',
    pesoProveedor: rec.pesoProveedor || '',
    pesoBalanza: rec.pesoBalanza || '',
    planta: rec.planta || '',
    cliente: rec.cliente || '',
    proveedor: rec.proveedor || '',
  };
}

function Field({ label, icon, required, error, children, hint }) {
  return (
    <div>
      <label className="label">
        {icon && <span className="mr-1.5 inline-block translate-y-0.5">{icon}</span>}
        {label}
        {required && <span className="ml-1 text-falpat">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// Encabezado de sección para agrupar los campos del formulario.
function Section({ icon, title, children }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-falpat/25 bg-falpat/10 text-falpat">
          {icon}
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function ModalForm() {
  const {
    modalOpen,
    closeModal,
    addRecord,
    updateRecord,
    editingRecord,
    uniqueValues,
    defaultCarga,
  } = useContext(AppContext);
  const [carga, setCarga] = useState('Entrada');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(editingRecord);

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
      ? [...common, 'nroRemitoProveedor', 'pesoProveedor', 'proveedor']
      : [...common, 'cliente'];
  }, [carga]);

  // Reset al abrir y cierre por teclado / bloqueo de scroll
  useEffect(() => {
    if (modalOpen) {
      setCarga(defaultCarga || editingRecord?.carga || 'Entrada');
      setForm(editingRecord ? fromRecord(editingRecord) : { ...EMPTY_FORM, fechaRemito: todayISO() });
      setErrors({});
    }
  }, [modalOpen, editingRecord, defaultCarga]);

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

  // Al elegir un producto del catálogo, completa el código automáticamente
  // (si el campo código está vacío) para no repetir la tarea a mano.
  function onProductoChange(e) {
    const value = typeof e === 'string' ? e : e.target.value;
    setForm((f) => {
      const next = { ...f, producto: value };
      if (!f.codigoProducto.trim()) {
        const match = CATALOGO_PRODUCTOS.find(
          (p) => p.codigo && normalizar(p.nombre) === normalizar(value)
        );
        if (match) next.codigoProducto = match.codigo;
      }
      return next;
    });
    if (errors.producto) setErrors((er) => ({ ...er, producto: undefined }));
  }

  // El peso de balanza se puede tipear solo el número: si el producto
  // pertenece al catálogo, se completa la unidad correcta al final.
  function onPesoBalanzaChange(e) {
    const value = typeof e === 'string' ? e : e.target.value;
    setForm((f) => {
      const numero = value.trim().replace(',', '.');
      if (!/^\d+([.,]\d+)?$/.test(numero)) return { ...f, pesoBalanza: value };
      const unidad = unidadPorCodigo(f.codigoProducto || '') || unidadPorNombre(f.producto);
      const formateado = cantidadConUnidad(numero.replace(',', '.'), unidad);
      return { ...f, pesoBalanza: formateado };
    });
    if (errors.pesoBalanza) setErrors((er) => ({ ...er, pesoBalanza: undefined }));
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
        codigoProducto: form.codigoProducto.trim().toUpperCase(),
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
              proveedor: form.proveedor.trim(),
            }
          : { cliente: form.cliente.trim() }),
      };
      if (isEdit) {
        await updateRecord(editingRecord.id, payload);
      } else {
        await addRecord(payload);
      }
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
  const unidadActual = unidadPorCodigo(form.codigoProducto) || unidadPorNombre(form.producto);

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

      <div className="glass-strong relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <IconBox className="h-5 w-5 text-falpat" />
              {isEdit ? 'Editar registro' : 'Nuevo registro'}
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
          <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-8">
            {/* 1. Tipo de movimiento */}
            <Section icon={<IconArrowUpRight className="h-3.5 w-3.5" />} title="Tipo de movimiento">
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
              <p className="text-xs text-slate-500">
                {isEntrada
                  ? 'Ingreso de material a la planta (con remito del proveedor).'
                  : 'Despacho de material desde la planta (con cliente).'}
              </p>
            </Section>

            {/* 2. Producto */}
            <Section icon={<IconBox className="h-3.5 w-3.5" />} title="Producto">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Producto"
                  icon={<IconBox className="h-4 w-4 text-slate-500" />}
                  required
                  error={errors.producto}
                >
                  <Autocomplete
                    options={uniqueValues.producto}
                    value={form.producto}
                    onChange={onProductoChange}
                    error={errors.producto}
                    placeholder="Elegí o escribí un producto nuevo"
                    autoFocus={!isEdit}
                  />
                </Field>

                <Field
                  label="Código de producto"
                  icon={<IconBox className="h-4 w-4 text-slate-500" />}
                  error={errors.codigoProducto}
                  hint={unidadActual ? `Medida: ${unidadActual}` : undefined}
                >
                  <Autocomplete
                    options={CATALOGO_PRODUCTOS.map((p) => p.codigo).filter(Boolean)}
                    value={form.codigoProducto}
                    onChange={setField('codigoProducto')}
                    placeholder="Ej: P620 (opcional)"
                  />
                </Field>
              </div>
            </Section>

            {/* 3. Datos del movimiento */}
            <Section icon={<IconTruck className="h-3.5 w-3.5" />} title="Datos del movimiento">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              </div>
            </Section>

            {/* 4. Remitos */}
            <Section icon={<IconFileText className="h-3.5 w-3.5" />} title="Remitos">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                ) : (
                  <div className="hidden sm:block" aria-hidden="true" />
                )}
              </div>
            </Section>

            {/* 5. Pesos */}
            <Section icon={<IconScale className="h-3.5 w-3.5" />} title="Pesos">
              <p className="-mt-1 text-xs text-slate-500">
                Materiales a granel en toneladas (tn); el resto en su unidad.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {isEntrada && (
                  <Field
                    label="Peso (Proveedor)"
                    icon={<IconScale className="h-4 w-4 text-slate-500" />}
                    required
                    error={errors.pesoProveedor}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.pesoProveedor}
                      onChange={setField('pesoProveedor')}
                      placeholder="Ej: 31.900"
                      className={cn('field', errors.pesoProveedor && 'field-error')}
                    />
                  </Field>
                )}

                <Field
                  label="Peso (Balanza)"
                  icon={<IconScale className="h-4 w-4 text-slate-500" />}
                  required
                  error={errors.pesoBalanza}
                  hint={unidadActual ? `Se guarda como ${unidadActual}` : 'Escribí solo el número, se agrega la unidad'}
                >
                  <Autocomplete
                    options={uniqueValues.pesoBalanza}
                    value={form.pesoBalanza}
                    onChange={onPesoBalanzaChange}
                    error={errors.pesoBalanza}
                    placeholder={unidadActual ? `Ej: 31.9 ${unidadActual}` : 'Ej: 31.9'}
                  />
                </Field>
              </div>
            </Section>

            {/* 6. Origen / Destino */}
            <Section
              icon={<IconBuilding className="h-3.5 w-3.5" />}
              title={isEntrada ? 'Origen de la carga' : 'Destino de la carga'}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {isEntrada ? (
                  <Field
                    label="Proveedor"
                    icon={<IconBuilding className="h-4 w-4 text-slate-500" />}
                    required
                    error={errors.proveedor}
                  >
                    <Autocomplete
                      options={uniqueValues.proveedor}
                      value={form.proveedor}
                      onChange={setField('proveedor')}
                      error={errors.proveedor}
                      placeholder="Nombre del proveedor"
                    />
                  </Field>
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
                  label="Centro de Distribución"
                  icon={<IconBuilding className="h-4 w-4 text-slate-500" />}
                  required
                  error={errors.planta}
                >
                  <select
                    value={form.planta}
                    onChange={setField('planta')}
                    className={cn('field', errors.planta && 'field-error')}
                  >
                    <option value="" disabled>
                      Seleccioná…
                    </option>
                    <option value="Campana">Campana</option>
                    <option value="Lujan">Lujan</option>
                  </select>
                </Field>
              </div>
            </Section>

            {errors.form && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {errors.form}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/20 px-5 py-4 sm:px-8">
            <button type="button" onClick={closeModal} className="btn-ghost" disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-night-950/40 border-t-night-950" />
                  Guardando…
                </>
              ) : isEdit ? (
                'Guardar cambios'
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
