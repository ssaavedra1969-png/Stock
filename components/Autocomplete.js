'use client';

// ============================================================
// components/Autocomplete.js
// Input con dropdown de sugerencias.
// - Busqueda fuzzy + filtro por coincidencia mientras se escribe.
// - Debounce de 300ms.
// - Navegación con teclado (↑/↓/Enter/Escape).
// - Trabaja 100% sobre la caché local del AppContext (sin
//   lecturas adicionales a Firestore).
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '@/lib/fuzzy';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconBox } from './Icons';

const MAX_RESULTS = 10;

export default function Autocomplete({
  label,
  options = [],
  value = '',
  onChange,
  error,
  required,
  placeholder = 'Escribí o seleccioná…',
  autoFocus,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [debounced, setDebounced] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  // Sincroniza el estado interno cuando cambia el valor desde afuera
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounce de 300ms para el filtrado
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(
    () => fuzzyFilter(options, debounced).slice(0, MAX_RESULTS),
    [options, debounced]
  );

  useEffect(() => {
    setHighlight(0);
  }, [filtered, debounced]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function select(opt) {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' && !open && filtered.length) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-1 text-falpat">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            // No se abre automáticamente al enfocar: solo si ya hay texto.
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={cn('field', error && 'field-error')}
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          aria-label={open ? 'Ocultar sugerencias' : 'Mostrar sugerencias'}
        >
          <IconChevronDown
            className={cn('h-4 w-4 transition', open && 'rotate-180 text-falpat')}
          />
        </button>
      </div>

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      {open && (
        <div className="absolute z-50 mt-2 w-full animate-drop-in overflow-hidden rounded-xl border border-white/10 bg-night-850/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {filtered.length === 0 ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm text-slate-500">
              <IconBox className="h-4 w-4 shrink-0" />
              {options.length === 0
                ? 'Todavía no hay opciones guardadas.'
                : 'Sin coincidencias.'}
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
              {filtered.map((opt, i) => (
                <li key={opt + i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => select(opt)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition',
                      i === highlight
                        ? 'bg-falpat/15 text-falpat-soft'
                        : 'text-slate-200 hover:bg-white/[0.04]'
                    )}
                  >
                    <span className="truncate">{opt}</span>
                    {i === highlight && (
                      <span className="ml-auto h-1 w-1 shrink-0 rounded-full bg-falpat" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
