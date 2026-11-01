'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export const TEMAS = [
  { id: 'neon-green', label: 'Verde fosforescente' },
  { id: 'orange', label: 'Naranja' },
  { id: 'yellow', label: 'Amarillo' },
  { id: 'cyan', label: 'Celeste' },
  { id: 'pink', label: 'Rosa' },
  { id: 'multi', label: 'Multicolor' },
];

const STORAGE_KEY = 'falpat-theme';
const TEMA_DEFAULT = 'neon-green';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(TEMA_DEFAULT);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (TEMAS.some((t) => t.id === guardado)) setTema(guardado);
    } catch {
      // localStorage no disponible: se mantiene el tema por defecto
    }
  }, []);

  function cambiarTema(id) {
    if (!TEMAS.some((t) => t.id === id)) return;
    setTema(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage no disponible: solo se aplica en memoria
    }
  }

  return (
    <ThemeContext.Provider value={{ tema, cambiarTema, temas: TEMAS }}>
      <div className="app-optimmax min-h-screen" data-theme={tema}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
