// ============================================================
// lib/utils.js - Utilidades compartidas (fechas y texto)
// ============================================================

// Fecha local de hoy en formato YYYY-MM-DD (para <input type="date">)
export function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Convierte cualquier formato de valor de fecha a milisegundos.
 * Soporta: Date, Timestamp de Firestore, {seconds}, números, ISO strings.
 */
export function toMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  if (value.seconds != null) return value.seconds * 1000;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// Formato dd/mm/aaaa
export function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return '—';
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Formato dd/mm/aaaa hh:mm
export function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return '—';
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

// Texto normalizado: minusculas y sin tildes (util para busquedas)
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Convierte un peso ("29,8 tn", "35.4 tn") a número en toneladas.
// Los valores que NO son toneladas ("1000 u", "70 bolsas", "1 tambores")
// devuelven 0 para no contaminar los totales de toneladas.
export function parseWeight(value) {
  if (value == null) return 0;
  const s = String(value);
  if (!/tn/i.test(s)) return 0;
  const cleaned = s.replace(/[^\d.,\-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Une clases condicionalmente
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

// Meses en español (índice 0 = Enero).
export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function mesLabel(mes) {
  const m = Number(mes);
  return MESES[m - 1] || '';
}

// "2026-06-01" -> "01/06/2026" (sin pasar por Date para evitar saltos de zona horaria).
export function formatInputDate(value) {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// Descripción legible del período seleccionado (mes/año principal, desde/hasta detalle).
export function descripcionPeriodo(mes, anio, desde, hasta) {
  if (mes && anio) return `${mesLabel(mes)} ${anio}`;
  if (mes) return `Mes: ${mesLabel(mes)}`;
  if (anio) return `Año ${anio}`;
  if (desde || hasta) {
    const d = desde ? formatInputDate(desde) : 'inicio';
    const h = hasta ? formatInputDate(hasta) : 'hoy';
    return `${d} → ${h}`;
  }
  return 'Todo el historial';
}

// Año y mes (1-12) de un registro, sin romper con fechas inválidas.
export function anioMes(fecha) {
  const ms = toMillis(fecha);
  if (!ms) return null;
  const d = new Date(ms);
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}
