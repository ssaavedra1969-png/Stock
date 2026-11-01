'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

const SECTION_TITLES = {
  '/': 'Inicio',
  '/reportes': 'Reportes',
  '/informes': 'Informes',
  '/incorporar': 'Importar Excel',
  '/tickets': 'Cargar Entrada',
};

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function useClock() {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return now;
}

function weatherIcon(code, isNight) {
  if (code === 0) return isNight ? '🌙' : '☀️';
  if (code <= 3) return isNight ? '☁️' : '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌧️';
  if (code <= 65) return '🌧️';
  if (code <= 75) return '🌨️';
  if (code <= 82) return '🌦️';
  if (code <= 99) return '⛈️';
  return isNight ? '🌙' : '☀️';
}

function useWeather() {
  const [weather, setWeather] = useState({ temp: null, code: 0, city: '', loading: true });

  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      const [weatherRes, geoRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`),
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es`),
      ]);
      if (!weatherRes.ok) throw new Error('weather fetch failed');
      const weatherData = await weatherRes.json();
      let city = '';
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.state || '';
      }
      setWeather({
        temp: Math.round(weatherData.current.temperature_2m),
        code: weatherData.current.weather_code,
        city,
        loading: false,
      });
    } catch {
      setWeather((w) => ({ ...w, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(-34.6037, -58.3816),
        { timeout: 8000 }
      );
    } else {
      fetchWeather(-34.6037, -58.3816);
    }
  }, [fetchWeather]);

  return weather;
}

export default function Topbar() {
  const pathname = usePathname();
  const now = useClock();
  const weather = useWeather();

  const title = SECTION_TITLES[pathname] || 'Stock';

  // 12-hour format
  let hrs = now ? now.getHours() : 0;
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  hrs = hrs ? hrs : 12;
  const hoursStr = String(hrs).padStart(2, '0');
  const minutesStr = now ? String(now.getMinutes()).padStart(2, '0') : '00';
  const secondsStr = now ? String(now.getSeconds()).padStart(2, '0') : '00';

  const dayStr = now ? String(now.getDate()).padStart(2, '0') : '01';
  const monthStr = now ? MONTHS[now.getMonth()] : 'ENE';

  const isNight = now ? (now.getHours() >= 19 || now.getHours() < 7) : true;
  const icon = weatherIcon(weather.code, isNight);
  const tempText = weather.temp !== null ? `${weather.temp}°C` : '—°C';
  const cityText = weather.city || 'Weather';

  return (
    <header className="sticky top-0 z-30 flex h-[135px] shrink-0 items-center justify-between w-full px-8 bg-slate-950/20 backdrop-blur-xl border-b border-slate-900/60 select-none">
      {/* Sección izquierda: Solo el título */}
      <div className="flex items-center">
        <h1 className="text-2xl font-black tracking-tight text-white font-sans antialiased">
          {title}
        </h1>
      </div>

      {/* Sección central: Mega panel flip con segundos */}
      <div className="flex items-center justify-center flex-1 mx-6">
        <div className="flip-dashboard-panel-max">
          {/* Módulo de clima flip gigante */}
          <div className="flex flex-col border-r-2 border-slate-700/60 pr-6">
            <div className="flex items-center gap-2">
              <div className="flip-leaf-card-giant flip-weather-icon-giant">
                <span style={{ filter: 'drop-shadow(0 0 4px #fbbf24)' }}>{icon}</span>
              </div>
              <div className="flip-leaf-card-giant flip-weather-temp-giant" style={{ color: 'var(--accent)' }}>{tempText}</div>
            </div>
            <div className="flip-label-sub-giant">{cityText}</div>
          </div>

          {/* Indicador AM/PM */}
          <div className="flip-ampm-box-giant">{ampm}</div>

          {/* Núcleo de horas, minutos y segundos gigantes */}
          <div className="flex items-center gap-4">
            {/* Bloque de horas */}
            <div className="flex flex-col">
              <div className="flex gap-1.5">
                <div className="flip-leaf-card-giant">{hoursStr[0]}</div>
                <div className="flip-leaf-card-giant">{hoursStr[1]}</div>
              </div>
              <div className="flip-label-sub-giant">Hour</div>
            </div>

            {/* Dos puntos divisorios */}
            <span className="font-black text-4xl pb-6 px-1 animate-pulse" style={{ color: 'var(--accent)' }}>:</span>

            {/* Bloque de minutos */}
            <div className="flex flex-col">
              <div className="flex gap-1.5">
                <div className="flip-leaf-card-giant">{minutesStr[0]}</div>
                <div className="flip-leaf-card-giant">{minutesStr[1]}</div>
              </div>
              <div className="flip-label-sub-giant">Minutes</div>
            </div>

            {/* Dos puntos divisorios */}
            <span className="font-black text-4xl pb-6 px-1 animate-pulse" style={{ color: 'var(--accent)' }}>:</span>

            {/* Bloque de segundos */}
            <div className="flex flex-col">
              <div className="flex gap-1.5">
                <div className="flip-leaf-card-giant">{secondsStr[0]}</div>
                <div className="flip-leaf-card-giant">{secondsStr[1]}</div>
              </div>
              <div className="flip-label-sub-giant">Seconds</div>
            </div>
          </div>

          {/* Bloque de calendario gigante */}
          <div className="flex flex-col gap-1.5 border-l-2 border-slate-700/60 pl-6">
            <div className="flip-leaf-card-giant flip-cal-month-giant">{monthStr}</div>
            <div className="flip-leaf-card-giant flip-cal-day-giant">{dayStr}</div>
          </div>
        </div>
      </div>

      {/* Sección derecha: Espacio balanceado */}
      <div className="w-[100px] hidden lg:block"></div>
    </header>
  );
}
