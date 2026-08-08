'use client';

// ============================================================
// components/Icons.js
// Iconos SVG inline (estilo lucide, trazo = currentColor).
// Evita dependencias externas y mantiene el bundle liviano.
// ============================================================

const base = (props) => ({
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...props,
});

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="falpat-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#2dd4ff" />
          <stop offset="1" stopColor="#ffd60a" />
        </linearGradient>
      </defs>
      <path
        d="M16 1.5l12.5 7v14L16 30.5 3.5 22.5v-14L16 1.5z"
        fill="url(#falpat-grad)"
        fillOpacity="0.12"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.5"
      />
      <path
        d="M11 23V9h10v2.8h-6.8v3.2h5.6v2.8h-5.6V23H11z"
        fill="url(#falpat-grad)"
      />
      <circle cx="24.5" cy="7.5" r="2" fill="#ffd60a" />
    </svg>
  );
}

export function IconLayout({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

export function IconArrowUpRight({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

export function IconArrowDownLeft({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <line x1="17" y1="7" x2="7" y2="17" />
      <polyline points="17 17 7 17 7 7" />
    </svg>
  );
}

export function IconClock({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 13.5" />
    </svg>
  );
}

export function IconPlus({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconSearch({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconX({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconTrash({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconPencil({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function IconChevronDown({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconChevronUp({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

export function IconRefresh({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconAlert({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconBox({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

export function IconLayers({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function IconCalendar({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconTruck({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

export function IconUser({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconScale({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="6" y1="7" x2="18" y2="7" />
      <path d="M6 7l-3 7a3 3 0 0 0 6 0L6 7z" />
      <path d="M18 7l-3 7a3 3 0 0 0 6 0l-3-7z" />
    </svg>
  );
}

export function IconFileText({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function IconBuilding({ className }) {
  return (
    <svg {...base({ className })} aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <line x1="9" y1="22" x2="9" y2="17" />
      <line x1="15" y1="22" x2="15" y2="17" />
      <line x1="8" y1="6" x2="10" y2="6" />
      <line x1="8" y1="10" x2="10" y2="10" />
      <line x1="14" y1="6" x2="16" y2="6" />
      <line x1="14" y1="10" x2="16" y2="10" />
    </svg>
  );
}
