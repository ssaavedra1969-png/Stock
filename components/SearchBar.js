'use client';

// ============================================================
// components/SearchBar.js
// Barra de búsqueda que filtra la tabla en tiempo real.
// ============================================================
import { IconSearch, IconX } from './Icons';

export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Buscar patente, chofer, remito…'}
        className="field !pl-10 !pr-10"
        aria-label="Buscar registros"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          aria-label="Limpiar búsqueda"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
