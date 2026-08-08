// ============================================================
// lib/fuzzy.js - Busqueda fuzzy liviana para el autocompletado
// Sin dependencias externas. Penaliza: exacto < prefijo <
// contiene < subsecuencia. Devuelve null si no hay coincidencia.
// ============================================================
import { normalizeText } from './utils';

export function matchScore(option, query) {
  const o = normalizeText(option);
  const q = normalizeText(query);
  if (!q) return 0;
  if (o === q) return -1;
  if (o.startsWith(q)) return 0;
  if (o.includes(q)) return 1;

  // Coincidencia por subsecuencia (ej: "cbal" -> "casa balanza")
  let qi = 0;
  for (let i = 0; i < o.length; i++) {
    if (o[i] === q[qi]) qi += 1;
    if (qi === q.length) return 2;
  }
  return null;
}

// Filtra y ordena las opciones por cercania a la consulta
export function fuzzyFilter(options = [], query = '') {
  const scored = [];
  for (const opt of options) {
    const score = matchScore(opt, query);
    if (score !== null) {
      scored.push({ opt, score });
    }
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.opt.localeCompare(b.opt, 'es', { sensitivity: 'base' })
  );
  return scored.map((s) => s.opt);
}
