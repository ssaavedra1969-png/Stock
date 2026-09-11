'use client';

// ============================================================
// components/Charts.js
// Componentes de gráficos Chart.js con la estética "Glamour's":
// cards con glow dorado, doughnut con total en el centro,
// tooltips oscuros con borde dorado y leyenda inferior.
// ============================================================
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const GOLD = '#d4af37';
const GOLD_RGB = '212,175,55';

// ---- Estilos compartidos (misma estética que Glamour's) ----
const LEGEND = {
  position: 'bottom',
  labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, color: '#9ca3af', font: { size: 11 } },
};

const TOOLTIP = {
  backgroundColor: 'rgba(12,12,22,0.94)',
  borderColor: 'rgba(212,175,55,0.35)',
  borderWidth: 1,
  titleColor: '#f3f4f6',
  bodyColor: '#d1d5db',
  titleFont: { weight: '700' },
  padding: 12,
  cornerRadius: 10,
  displayColors: true,
  usePointStyle: true,
  boxPadding: 4,
};

const axisCommon = {
  grid: { display: false },
  ticks: { color: '#6b7280', font: { size: 10 } },
  border: { display: false },
};
const yAxis = {
  beginAtZero: true,
  grid: { color: 'rgba(255,255,255,0.05)' },
  border: { display: false },
  ticks: { color: '#6b7280', font: { size: 10 }, callback: (v) => v },
};

// Plugin: total en el centro del doughnut (como Glamour's).
export const centerTotalPlugin = {
  id: 'centerTotal',
  afterDraw(chart) {
    const cfg = chart.options.plugins.centerTotal;
    if (!cfg) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data.length) return;
    const { x, y } = meta.data[0];
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText(cfg.top || 'TOTAL', x, y - 13);
    ctx.fillStyle = '#d4af37';
    ctx.font = '800 20px Inter, sans-serif';
    ctx.fillText(cfg.bottom || '', x, y + 9);
    ctx.restore();
  },
};

// Compacta números grandes (ej. 12345 -> 12.3K).
const compact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (abs >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
};

// Card con profundidad estilo Glamour's: glow dorado decorativo + sombra.
export function ChartCard({ title, icon: Icon, children, style }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '18px',
        padding: '1.5rem',
        boxShadow: '0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 170,
          height: 170,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', position: 'relative' }}>
        {Icon && <Icon size={16} color={GOLD} />}
        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f3f4f6' }}>{title}</span>
      </div>
      <div style={{ position: 'relative', height: '300px', filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.45))' }}>{children}</div>
    </div>
  );
}

// Doughnut con total en el centro + leyenda inferior.
export function GlamDoughnut({ labels, data, colors, centerTop, centerBottom, height = 300 }) {
  const total = data.reduce((s, n) => s + (Number(n) || 0), 0);
  return (
    <div style={{ position: 'relative', height, filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.45))' }}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 0,
              borderRadius: 6,
              spacing: 3,
              hoverOffset: 14,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: LEGEND,
            tooltip: { ...TOOLTIP, callbacks: { label: (c) => ` ${c.label}: ${c.formattedValue}` } },
            centerTotal: { top: centerTop, bottom: centerBottom },
          },
        }}
        plugins={[centerTotalPlugin]}
      />
    </div>
  );
}

// Contenido con altura propia (sin glow repetido) para montar dentro de ChartCard.
export function GlamDoughnutIn({ labels, data, colors, centerTop, centerBottom }) {
  return (
    <GlamDoughnut
      labels={labels}
      data={data}
      colors={colors}
      centerTop={centerTop}
      centerBottom={centerBottom}
    />
  );
}

// Barras apiladas (entradas / salidas) por mes, estilo Glamour's.
export function GlamBars({ labels, datasets, stacked = true, height = 300 }) {
  return (
    <div style={{ position: 'relative', height, filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.45))' }}>
      <Bar
        data={{
          labels,
          datasets: datasets.map((d) => ({
            ...d,
            backgroundColor: d.backgroundGrad
              ? d.backgroundGrad
              : d.color
                ? d.color
                : GOLD,
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 30,
          })),
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: LEGEND, tooltip: TOOLTIP },
          scales: {
            x: { ...axisCommon, stacked },
            y: { ...yAxis, stacked },
          },
        }}
      />
    </div>
  );
}

// Línea con relleno degradado, estilo Glamour's.
export function GlamLine({ labels, data, color = GOLD, rgb = GOLD_RGB, height = 300 }) {
  const fill = (context) => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return `rgba(${rgb},0.08)`;
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, `rgba(${rgb},0.3)`);
    g.addColorStop(0.65, `rgba(${rgb},0.1)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  };
  return (
    <div style={{ position: 'relative', height, filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.45))' }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              label: '',
              data,
              borderColor: color,
              backgroundColor: fill,
              fill: true,
              tension: 0.45,
              pointRadius: 4,
              pointBackgroundColor: '#12121f',
              pointBorderColor: color,
              pointBorderWidth: 2,
              pointHoverRadius: 6,
              borderWidth: 2.5,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: TOOLTIP },
          scales: { x: axisCommon, y: yAxis },
        }}
      />
    </div>
  );
}

// Re-export de utilidades de formato para los ejes.
export function glCompact(n) {
  return compact(n);
}
