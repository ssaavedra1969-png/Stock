'use client';

import { useTheme } from '@/context/ThemeContext';

export default function ThemeSwitcher() {
  const { tema, cambiarTema, temas } = useTheme();

  return (
    <div className="omx-theme-switch" role="group" aria-label="Tema de colores">
      {temas.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => cambiarTema(t.id)}
          className={`omx-theme-dot${tema === t.id ? ' active' : ''}`}
          data-theme-choice={t.id}
          title={t.label}
          aria-label={t.label}
          aria-pressed={tema === t.id}
        />
      ))}
    </div>
  );
}
