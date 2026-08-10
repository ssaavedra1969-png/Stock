'use client';

// ============================================================
// components/MultiSelect.js
// Selector múltiple con buscador, checkboxes y chips removibles.
// Selección vacía = "Todos" (sin filtro por este campo).
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn, normalizeText } from '@/lib/utils';
import { IconCheck, IconChevronDown, IconSearch, IconX } from '@/components/Icons';

export default function MultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Todos',
  searchPlaceholder = 'Buscar…',
  itemLabel = 'opciones',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const nq = normalizeText(q);
    if (!nq) return options;
    return options.filter((o) => normalizeText(o).includes(nq));
  }, [options, q]);

  function toggle(v) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]
        : `${value.length} ${itemLabel} seleccionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQ('');
        }}
        className={cn(
          'field flex w-full items-center justify-between gap-2 !py-2 !pr-3 text-left',
          value.length === 0 ? 'text-slate-500' : 'text-slate-100'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <IconChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-falpat/30 bg-falpat/10 px-2 py-0.5 text-[11px] font-semibold text-falpat-soft"
            >
              <span className="truncate" title={v}>
                {v}
              </span>
              <button
                type="button"
                onClick={() => toggle(v)}
                className="shrink-0 rounded-full text-falpat-soft/70 transition hover:bg-white/10 hover:text-falpat-soft"
                aria-label={`Quitar ${v}`}
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-night-800 shadow-2xl">
          <div className="relative border-b border-white/10 p-2">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="field !py-1.5 !pl-8 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Sin resultados</p>
            ) : (
              filtered.map((o) => {
                const sel = value.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(o)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition',
                      sel ? 'bg-falpat/10 text-falpat-soft' : 'text-slate-200 hover:bg-white/[0.05]'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                        sel
                          ? 'border-falpat bg-falpat text-night-950'
                          : 'border-white/25 text-transparent'
                      )}
                    >
                      <IconCheck className="h-3 w-3" />
                    </span>
                    <span className="truncate" title={o}>
                      {o}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {value.length > 0 && (
            <div className="border-t border-white/10 p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
