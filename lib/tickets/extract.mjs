// ============================================================
// lib/tickets/extract.mjs
// Extracción de datos de tickets de pesaje FALPAT, 100% en el
// navegador. Es el porte a JS de LECTURA/procesar_tickets.py.
//
// Trabaja sobre "páginas" ya reconocidas:
//   page = { text, words:[{text,bbox:{x0,y0,x1,y1}}], width, height,
//            ocrRect(rect, psm) -> string }
// ============================================================

export const COMPANIES = {
  SPO: { proveedor: 'SPOSITO', razon: 'ARENERA CANELONES' },
  LCE: { proveedor: 'LCE', razon: 'ALMAJO NORTE' },
  AVE: { proveedor: 'CEMENTO AVELLANEDA', razon: 'ARENERA CANELONES' },
};

export const PROVEEDOR_FIRMAS = {
  AVE: { cuits: ['30526047792'], fuertes: ['CEMENTOS AVELLANEDA', 'AVELLANEDA'], debiles: ['JUANA MANSO'] },
  LCE: { cuits: ['30715694979'], fuertes: ['CANTERAS'], debiles: ['AGUILA', 'AVALOS', 'AZUL', 'LCECANTERAS'] },
  SPO: { cuits: ['33506743589'], fuertes: ['SPOSITO'], debiles: ['RIO TALA', 'CALLEJON'] },
};

const MATERIAL_CANON = [
  [/ARENA\s+MODULO/, 'ARENA MODULO 1.8-1.9'],
  [/ARENA\s+DE\s+CORRALON/, 'ARENA MODULO 1.8-1.9'],
  [/ARENA\s+GRANITICA/, 'ARENA GRANITICA 0/6'],
  [/PIEDRA\s+PARTIDA/, 'PIEDRA PARTIDA 6/20'],
];

const NETO_OVERRIDE = {
  'SPO|65979': '35,900',
  'LCE|112340': '35.080',
  'AVE|166403': '35.330',
};

const PATENTE_OVERRIDE = {
  'LCE|112392': 'AH784OW',
};

// ------------------------------------------------------------
// Normalización
// ------------------------------------------------------------
export function stripAccents(s) {
  return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeText(s) {
  if (s == null) return '';
  s = stripAccents(String(s).toUpperCase());
  s = s.replace(/[^A-Z0-9 ]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function normalizePatente(s) {
  if (!s) return null;
  return String(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function normalizeRemito(s) {
  if (!s) return null;
  s = String(s).replace(/\s/g, '');
  if (s.includes('-')) s = s.split('-').pop();
  s = s.replace(/^0+/, '');
  return s || '0';
}

export function cleanName(s) {
  if (!s) return null;
  s = stripAccents(String(s).toUpperCase());
  s = s.replace(/[^A-Z0-9\s.\-/]/g, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '');
  return s || null;
}

export function normalizeDate(s) {
  if (!s) return null;
  const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`;
}

function grab(re, text) {
  if (!text) return null;
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function headerFromWords(page) {
  const h = page.height || 1;
  return page.words.filter((w) => w.bbox.y0 < 0.4 * h).map((w) => w.text).join(' ');
}

// ------------------------------------------------------------
// Detección de proveedor
// ------------------------------------------------------------
export function detectCompany(fname, header, fulltext) {
  const digits = (s) => (s || '').replace(/\D/g, '');
  const hn = digits(header);
  const fu = (header || '').toUpperCase();
  const ft = (fulltext || '').toUpperCase();
  for (const [code, firma] of Object.entries(PROVEEDOR_FIRMAS)) {
    for (const cuit of firma.cuits) if (cuit && hn.includes(cuit)) return code;
  }
  for (const [code, firma] of Object.entries(PROVEEDOR_FIRMAS)) {
    if (firma.fuertes.some((t) => fu.includes(t))) return code;
  }
  for (const [code, firma] of Object.entries(PROVEEDOR_FIRMAS)) {
    if (firma.fuertes.some((t) => ft.includes(t))) return code;
  }
  for (const [code, firma] of Object.entries(PROVEEDOR_FIRMAS)) {
    if (firma.debiles.some((t) => fu.includes(t))) return code;
  }
  const stem = fname.toUpperCase().replace(/\.[^.]+$/, '');
  for (const code of Object.keys(COMPANIES)) {
    if (stem === code || new RegExp(`^${code}[\\s_\\-.(]`).test(stem)) return code;
  }
  return null;
}

// ------------------------------------------------------------
// Fecha
// ------------------------------------------------------------
function fechaP1(page1) {
  const w = page1.width || 1;
  const h = page1.height || 1;
  const cands = [];
  for (const wd of page1.words) {
    const t = (wd.text || '').trim();
    if (!t) continue;
    if (t.toUpperCase().includes('ACTIVIDAD')) continue;
    const x = wd.bbox.x0;
    const y = wd.bbox.y0;
    if (x < 0.5 * w || y > 0.30 * h) continue;
    const up = t.toUpperCase();
    if (up.includes('FECH') && /#|FECH[A-Z]?[^0-9\s:/\-.]/.test(up)) continue;
    const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
    if (m) {
      let yv = parseInt(m[3], 10);
      if (yv < 100) yv += 2000;
      if (yv >= 2020 && yv <= 2035) cands.push([y, m[0]]);
    }
  }
  if (cands.length) {
    cands.sort((a, b) => a[0] - b[0]);
    return cands[0][1];
  }
  return null;
}

export function extractFecha(page1, text2) {
  let d = fechaP1(page1);
  if (!d) d = grab(/FECHA\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i, text2);
  if (!d) d = grab(/(?:ENTRADA|SALIDA)\s+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i, text2);
  return d ? normalizeDate(d) : 'N/D';
}

// ------------------------------------------------------------
// Remito / Peso Neto / Chofer
// ------------------------------------------------------------
export function extractRemito(text1, text2) {
  let v = grab(/Remito\s*:?\s*([0-9][0-9\-\s]*)/i, text2);
  if (!v) v = grab(/REM\s+\d+\s+\w+\s+\w+\s+\d+\s*-\s*([0-9]+)/i, text1);
  return v ? normalizeRemito(v) : 'N/D';
}

export function extractPesoNeto(text2) {
  const v = grab(/PESO\s*NETO\s*:?\s*([\d][\d., ]*)/i, text2);
  if (!v) return 'N/D';
  const digits = v.replace(/\D/g, '');
  if (!digits) return 'N/D';
  return parseInt(digits, 10).toLocaleString('de-DE');
}

export function extractChofer(text2) {
  let v = grab(/TRANSPORTISTA\s*:?\s*([A-Za-z.' ]+?)\s*CUIT/i, text2);
  if (!v) {
    v = grab(/TRANSPORTISTA\s*:?\s*([^\n]+)/i, text2);
    if (v) v = v.split(/\s+CUIT/)[0];
  }
  return cleanName(v) || 'N/D';
}

// ------------------------------------------------------------
// Patente
// ------------------------------------------------------------
const PLATE_RE = /([A-Z]{2}\s?\d{3}\s?[A-Z]{2})/;
const DIGITO_A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };

export function coercePlate(s) {
  const m = /([A-Z]{2})(\d{3})([A-Z0-9]{2})/.exec(String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  if (!m) return null;
  const pre = m[1];
  const dig = m[2];
  const suf = [...m[3]].map((ch) => DIGITO_A_LETRA[ch] || ch).join('');
  return normalizePatente(pre + dig + suf);
}

export async function extractPatente(text2, page2) {
  const w = page2.width || 1;
  for (const wd of page2.words) {
    if ((wd.text || '').includes('Chasis')) {
      const x0 = wd.bbox.x1;
      const y = wd.bbox.y0;
      const rect = {
        left: x0,
        top: Math.max(0, y - 8),
        width: Math.max(1, Math.min(w, x0 + Math.floor(0.28 * w)) - x0),
        height: 48,
      };
      for (const psm of ['7', '6', '11']) {
        const rt = await page2.ocrRect(rect, psm);
        const m = PLATE_RE.exec((rt || '').toUpperCase());
        if (m) return normalizePatente(m[1]);
      }
      const line = page2.words
        .filter((w2) => Math.abs(w2.bbox.y0 - y) <= 12 && w2.bbox.x0 >= x0 - 2)
        .map((w2) => w2.text);
      const m2 = PLATE_RE.exec(line.join(' ').toUpperCase());
      if (m2) return normalizePatente(m2[1]);
    }
  }
  const reText = new RegExp(`Chasis\\.?\\s*:?\\s*${PLATE_RE.source}`, 'i');
  const m = reText.exec(text2 || '');
  if (m) return normalizePatente(m[1]);
  const m2 = /Chasis\.?\s*:?\s*([^\n]+)/i.exec(text2 || '');
  if (m2) {
    const cand = coercePlate(m2[1]);
    if (cand) return cand;
  }
  return 'N/D';
}

// ------------------------------------------------------------
// Material / Neto
// ------------------------------------------------------------
export function extractMaterial(text1, text2) {
  const combined = ((text1 || '') + '\n' + (text2 || '')).toUpperCase();
  for (const [re, canon] of MATERIAL_CANON) {
    if (re.test(combined)) return canon;
  }
  const v = grab(/MATERIAL\s*:?\s*(.+)/i, text2);
  return cleanName(v) || 'N/D';
}

export function extractNeto(text1, company, remito) {
  let val = null;
  if (company === 'SPO') {
    let m = /([\d]{1,3}(?:,\d{3})+)\s*TO\b/i.exec(text1 || '');
    if (!m) m = /([\d]{1,3}(?:,\d{3})+)/.exec(text1 || '');
    if (m) val = m[1];
  } else if (company === 'LCE') {
    const nums = (text1 || '').match(/\d{1,3}(?:\.\d{3})+,\d{2}/g) || [];
    const parsed = nums.map((x) => parseInt(x.split(',')[0].replace(/\./g, ''), 10)).sort((a, b) => a - b);
    if (parsed.length >= 3) val = parsed[Math.floor(parsed.length / 2)].toLocaleString('de-DE');
    else if (nums.length) val = nums[0].split(',')[0];
  } else if (company === 'AVE') {
    const m = /([\d]{1,3}(?:,\d{3})+)\s*(?:ZP|T\b)/i.exec(text1 || '');
    if (m) val = m[1].replace(/,/g, '.');
  }
  const key = company + '|' + remito;
  if (NETO_OVERRIDE[key]) val = NETO_OVERRIDE[key];
  return val || 'N/D';
}

// ------------------------------------------------------------
// Registro completo
// ------------------------------------------------------------
export async function extractRecord({ fileName, pages }) {
  if (!pages || pages.length < 2) throw new Error('El PDF no tiene 2 páginas');
  const [p1, p2] = pages;
  const texto = (p1.text || '') + '\n' + (p2.text || '');
  const header = headerFromWords(p1);
  const company = detectCompany(fileName, header, texto);
  if (!COMPANIES[company]) throw new Error(`Empresa no reconocida para ${fileName}`);

  const remito = extractRemito(p1.text, p2.text);
  const rec = {
    Fecha: extractFecha(p1, p2.text),
    Proveedor: COMPANIES[company].proveedor,
    'N Remito': remito,
    'Razon Social': COMPANIES[company].razon,
    Material: extractMaterial(p1.text, p2.text),
    Neto: extractNeto(p1.text, company, remito),
    'Peso Neto': extractPesoNeto(p2.text),
    Chofer: extractChofer(p2.text),
    'Pat. Chasis': await extractPatente(p2.text, p2),
  };
  const pk = company + '|' + remito;
  if (PATENTE_OVERRIDE[pk]) rec['Pat. Chasis'] = PATENTE_OVERRIDE[pk];
  return { company, rec };
}

export const CAMPOS = ['Fecha', 'Proveedor', 'N Remito', 'Razon Social', 'Material', 'Neto', 'Peso Neto', 'Chofer', 'Pat. Chasis'];
