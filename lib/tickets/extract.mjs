// ============================================================
// lib/tickets/extract.mjs
// Extraccion de datos de tickets de pesaje FALPAT, 100% en el
// navegador. Es el porte a JS de LECTURA/procesar_tickets.py.
//
// Trabaja sobre "paginas" ya reconocidas:
//   page = { text, words:[{text,bbox:{x0,y0,x1,y1}}], width, height,
//            ocrRect(rect, psm) -> string }
//
// Estructura real de los PDF (2 paginas):
//   - Pagina 1: remito del PROVEEDOR (SPOSITO / CANTERAS-ALMAJO / CEMENTOS AVELLANEDA)
//               -> fecha del remito, N remito proveedor, cantidad (Neto)
//   - Pagina 2: TICKET DE BALANZA de FALPAT
//               -> fecha, N remito FALPAT, peso neto, chofer, patente
// ============================================================

import { BASE, MATERIALES, RAZONES_SOCIALES } from './base.mjs';

// Proveedor = quien emite el remito (emisor). Razon Social = la empresa dueña
// de la mercaderia, que figura en el documento y es OTRA empresa:
//   Proveedor           -> Razon Social
//   SPOSITO             -> ARENERA CANELONES
//   LCE (CANTERAS)      -> ALMAJO NORTE  (o ARENERA CANELONES, segun el remito)
//   CEMENTO AVELLANEDA  -> ARENERA CANELONES
// El mapeo de `razon` es solo el valor por defecto: se intenta leer del
// documento con extractRazonSocial (ver abajo).
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

// Coordenadas relativas a los formatos de remito que se reciben habitualmente.
// Los tickets de balanza comparten el diseño; el remito del proveedor cambia.
export const DOCUMENT_PROFILES = {
  SPO: {
    supplierRemito: { left: 0.64, top: 0.045, width: 0.35, height: 0.13 },
    supplierRazon: { left: 0.04, top: 0.21, width: 0.65, height: 0.10 },
    supplierMaterial: { left: 0.13, top: 0.29, width: 0.75, height: 0.10 },
    supplierNeto: { left: 0.80, top: 0.33, width: 0.18, height: 0.12 },
    supplierNetoCell: { left: 0.80, top: 0.33, width: 0.18, height: 0.12 },
    ticketRemito: { left: 0.02, top: 0.58, width: 0.54, height: 0.10 },
  },
  LCE: {
    supplierRemito: { left: 0.65, top: 0.055, width: 0.34, height: 0.14 },
    supplierRazon: { left: 0.20, top: 0.307, width: 0.52, height: 0.035 },
    supplierMaterial: { left: 0.03, top: 0.40, width: 0.95, height: 0.10 },
    supplierNeto: { left: 0.03, top: 0.40, width: 0.95, height: 0.10 },
    supplierNetoCell: { left: 0.80, top: 0.43, width: 0.18, height: 0.12 },
    ticketRemito: { left: 0.02, top: 0.61, width: 0.54, height: 0.10 },
  },
  AVE: {
    supplierRemito: { left: 0.66, top: 0.035, width: 0.33, height: 0.13 },
    supplierRazon: { left: 0.03, top: 0.14, width: 0.60, height: 0.10 },
    supplierMaterial: null,
    supplierNeto: { left: 0.72, top: 0.26, width: 0.27, height: 0.10 },
    supplierNetoCell: { left: 0.78, top: 0.26, width: 0.20, height: 0.10 },
    ticketRemito: { left: 0.02, top: 0.53, width: 0.56, height: 0.10 },
  },
};

function rectForPage(page, relativeRect) {
  if (!page?.width || !page?.height || !relativeRect) return null;
  return {
    left: Math.floor(page.width * relativeRect.left),
    top: Math.floor(page.height * relativeRect.top),
    width: Math.floor(page.width * relativeRect.width),
    height: Math.floor(page.height * relativeRect.height),
  };
}

async function ocrRegion(page, relativeRect, modes = ['6', '11'], enhanced = true) {
  const rect = rectForPage(page, relativeRect);
  if (!rect || !page?.ocrRect) return [];
  const readings = [];
  for (const psm of modes) {
    readings.push(await page.ocrRect(rect, psm, enhanced));
  }
  return readings;
}

function editDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

// Similitud 0..1 entre dos textos normalizados (1 = identico).
function similitudTexto(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

// Resuelve un texto contra una tabla canonica. Si no hay coincidencia exacta
// devuelve igual el valor mas parecido, marcado como similar/dudoso para que
// la UI muestre la advertencia.
export function resolverDesdeLista(valor, lista = [], umbral = 0.72) {
  const opciones = (lista || []).filter(Boolean);
  const leido = cleanName(valor) || String(valor ?? '').trim();
  if (!leido || leido.toUpperCase() === 'N/D' || !opciones.length) {
    return { valor: null, leido: leido || '', exacto: false, similar: false, dudoso: true, ratio: 0 };
  }
  // Si el texto normalizado ya es exacto, no hace falta Levenshtein.
  const norm = normalizeText(leido);
  let mejor = null;
  let mejorRatio = -1;
  for (const opcion of opciones) {
    const ratio = similitudTexto(norm, opcion);
    if (ratio > mejorRatio) {
      mejorRatio = ratio;
      mejor = opcion;
    }
  }
  const exacto = mejorRatio >= 0.999;
  return {
    valor: mejor,
    leido,
    exacto,
    similar: !exacto,
    dudoso: !exacto && mejorRatio < umbral,
    ratio: Math.max(0, Math.min(1, mejorRatio)),
  };
}

// ------------------------------------------------------------
// Normalizacion de texto
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

function validDate(d, mo, y) {
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return false;
  if (y < 2020 || y > 2035) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function normalizeDate(s) {
  if (!s) return null;
  const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (!validDate(d, mo, y)) return null;
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
// Numeros / pesos
// ------------------------------------------------------------
// Convierte "36 480", "36.480", "36,480", "36.480,00", "36,480.00" -> 36480.
export function parseNum(raw) {
  if (raw == null) return null;
  const t = String(raw).trim().replace(/[^\d.,]/g, '');
  if (!t) return null;
  let norm = t;
  const sep = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  if (sep >= 0) {
    const dec = t.length - sep - 1;
    const intPart = t.slice(0, sep).replace(/[.,]/g, '');
    if (dec === 3 && /^\d+$/.test(intPart)) {
      norm = t.replace(/[.,]/g, ''); // separador de miles
    } else {
      const frac = t.slice(sep + 1).replace(/[.,]/g, '');
      norm = `${intPart}.${frac}`; // ultimo separador = decimal
    }
  }
  const n = Math.round(parseFloat(norm));
  return Number.isFinite(n) ? n : null;
}

function fmtKg(n) {
  return Number(n).toLocaleString('de-DE');
}

// Repara grupos de miles con un digito OCR de mas: "35.4350,00" -> "35.435,00".
function repairGroups(s) {
  return String(s || '').replace(/(\d{1,3}[.,]\d{3})\d(?=[.,]\d{2})/g, '$1');
}

// Devuelve todos los numeros "pesables" (kg) encontrados en un texto.
function kgCandidates(text) {
  if (!text) return [];
  const out = [];
  const re = /\d{1,3}(?:[., ]\d{3})+(?:[.,]\d{2})?(?!\d)|\d{4,6}(?!\d)/g;
  let m;
  const src = repairGroups(text);
  while ((m = re.exec(src)) !== null) {
    const n = parseNum(m[0]);
    if (n != null) out.push(n);
  }
  return out;
}

// Primer peso plausible dentro del texto (se usa tras la etiqueta).
function firstWeight(s) {
  if (!s) return null;
  const m = /\d{1,3}(?:[., ]\d{3})+(?!\d)|\d{4,6}(?!\d)/.exec(repairGroups(s));
  return m ? parseNum(m[0]) : null;
}

// ------------------------------------------------------------
// Deteccion de proveedor
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
function dateFromLine(text, re) {
  const m = re.exec(text || '');
  if (!m) return null;
  return normalizeDate(m[1]);
}

// Corrige fechas OCR claramente imposibles contra la fecha del nombre del
// archivo (img-YYMMDD... o YYYYMMDD_...). Un nombre con fecha completa permite
// recuperar también el día y el mes cuando el OCR leyó mal toda la fecha.
function applyScanYear(dateStr, fileName) {
  if (!dateStr || !fileName) return dateStr;
  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
  if (!dm) return dateStr;
  const d = +dm[1], mo = +dm[2], y = +dm[3];
  const file = String(fileName);
  const mNamedDate = /^(\d{4})(\d{2})(\d{2})(?:[_\-.]|$)/.exec(file);
  const mImageDate = /img[-_]?(\d{2})(\d{2})(\d{2})/i.exec(file);
  if (!mNamedDate && !mImageDate) return dateStr;
  const scanY = mNamedDate ? +mNamedDate[1] : 2000 + +mImageDate[1];
  const scanMo = mNamedDate ? +mNamedDate[2] : +mImageDate[2];
  const scanD = mNamedDate ? +mNamedDate[3] : +mImageDate[3];
  if (!validDate(scanD, scanMo, scanY)) return dateStr;
  const a = Date.UTC(y, mo - 1, d);
  const b = Date.UTC(scanY, scanMo - 1, scanD);
  const days = Math.abs(a - b) / 86400000;
  if (days > 300) {
    return mNamedDate
      ? `${String(scanD).padStart(2, '0')}/${String(scanMo).padStart(2, '0')}/${scanY}`
      : `${dm[1]}/${dm[2]}/${scanY}`;
  }
  return dateStr;
}

function fechaOperacion(page1, page2, fileName) {
  const text2 = typeof page2 === 'string' ? page2 : page2?.text;
  const proveedor = applyScanYear(dateFromPage1(page1), fileName);
  const entrada = applyScanYear(
    dateFromLine(text2, /ENTRADA\s+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i),
    fileName
  );
  const emision = applyScanYear(
    dateFromLine(text2, /FECHA[.:]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i),
    fileName
  );
  const salida = applyScanYear(
    dateFromLine(text2, /SALIDA\s+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i),
    fileName
  );
  const fechasTicket = [entrada, emision, salida].filter(Boolean);
  const ocurrencias = new Map();
  for (const date of fechasTicket) {
    ocurrencias.set(date, (ocurrencias.get(date) || 0) + 1);
  }
  const operacion = fechasTicket.reduce((mejor, date) => {
    if (!mejor || ocurrencias.get(date) > ocurrencias.get(mejor)) return date;
    return mejor;
  }, null);
  return {
    date: operacion || proveedor,
    conflict:
      new Set(fechasTicket).size > 1 ||
      !!(operacion && proveedor && operacion !== proveedor),
  };
}

export async function extractFecha(page1, page2, fileName) {
  const { date } = fechaOperacion(page1, page2, fileName);
  return date || 'N/D';
}

function dateFromPage1(page1) {
  const w = page1.width || 1;
  const h = page1.height || 1;
  const cands = [];
  for (const wd of page1.words || []) {
    const t = (wd.text || '').trim();
    if (!t) continue;
    if (t.toUpperCase().includes('ACTIVIDAD')) continue;
    const x = wd.bbox.x0;
    const y = wd.bbox.y0;
    if (x < 0.45 * w || y > 0.35 * h) continue;
    const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
    if (!m) continue;
    const d = normalizeDate(m[0]);
    if (d) cands.push([y, d]);
  }
  if (cands.length) {
    cands.sort((a, b) => a[0] - b[0]);
    return cands[0][1];
  }
  const txt = page1.text || '';
  const m = /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/.exec(txt);
  return m ? normalizeDate(m[1]) : null;
}

// ------------------------------------------------------------
// Remito
// ------------------------------------------------------------
function coerceRemito(raw) {
  let s = String(raw || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/[^\d\-\s]/g, '')
    .replace(/\s/g, '');
  if (s.includes('-')) s = s.split('-').pop();
  s = s.replace(/^0+/, '');
  // LCE numera 112xxx: si el OCR duplica digitos (11223392) volver a 112392.
  if (s.length === 8 && s.startsWith('112')) s = '112' + s.slice(-3);
  return s.length >= 3 && s.length <= 10 ? s : null;
}

function remitoEsperado(company) {
  return { LCE: 6, AVE: 6, SPO: 5 }[company];
}

function remitoLceEncabezado(text) {
  const source = String(text || '');
  const match = /(?:N\s*[°º]?\s*)?(\d{3,4})\D{1,8}(\d{5,10})/i.exec(source);
  const digits = (match ? match[2] : /\b0*(\d{6,10})\b/.exec(source)?.[1] || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-6) : null;
}

export async function extractRemito(text2, company, page1, page2) {
  const esperado = remitoEsperado(company);
  const headerCandidates = (await ocrRegion(
    page1,
    DOCUMENT_PROFILES[company]?.supplierRemito
  )).map((text) =>
    company === 'LCE'
      ? remitoLceEncabezado(text)
      : remitoProveedorEncabezado(text, esperado)
  ).filter(Boolean);

  // Balanza (Pag.2): "Remito / Remita / Remite / Remit / Reamito ..."
  const m2 = /(?:[RH][ae][am]*m?it[aeo]?)\s*[-:;.,]*\s*([0-9OoIl|%(][0-9OoIl|%\-() \t]{3,})/i.exec(
    text2 || ''
  );
  const regionReadings = await ocrRegion(
    page2,
    DOCUMENT_PROFILES[company]?.ticketRemito
  );
  const balanzaCandidates = [m2?.[1], ...regionReadings]
    .map((text) => {
      if (!text) return null;
      const match = /(?:[RH][ae][am]*m?it[aeo]?)\s*[-:;.,]*\s*([0-9OoIl|%(][0-9OoIl|%\-() \t]{3,})/i.exec(text);
      return coerceRemito(match ? match[1] : text);
    })
    .filter((value) => value && (!esperado || value.length === esperado));
  const balanza = balanzaCandidates[0] || null;
  const validoBalanza = balanza;
  const remitoProveedor = headerCandidates[0] || null;
  const value =
    (company === 'AVE' && validoBalanza) ||
    remitoProveedor ||
    validoBalanza ||
    'N/D';
  // En AVE la tipografía del remito de la página 1 suele degradarse en OCR;
  // el número del ticket de balanza es la fuente fiable para este proveedor.
  return {
    value,
    conflict:
      new Set([...headerCandidates, ...balanzaCandidates]).size > 1 ||
      (!!remitoProveedor && !!balanza && remitoProveedor !== balanza),
  };
}

function remitoProveedorEncabezado(text, esperado) {
  const normalized = String(text || '')
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|]/g, '1');
  const match = /\b\d{3,4}\D{1,8}(\d{5,10})\b/.exec(normalized);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length >= esperado ? digits.slice(-esperado) : null;
}

// ------------------------------------------------------------
// Peso Neto (balanza, Pag.2)
// ------------------------------------------------------------
function lineWith(text, re) {
  if (!text) return null;
  for (const line of String(text).split(/\r?\n/)) {
    if (re.test(line)) return line;
  }
  return null;
}

const PESO_RE = /[PF]E[S5][O0D]/i;
const NETO_RE = /[NM][E3]T[O0D]/i;
const BRUTO_RE = /BRUT[O0D]/i;
const TARA_RE = /T[A4]R[A4]\b/i;

function pesoNetoDesdeTexto(text2) {
  // 1) Campo PESO NETO (tolera FESO/PESD/PES0, NETO/NETD/METO).
  const line = lineWith(text2, new RegExp(`${PESO_RE.source}\\s*${NETO_RE.source}`, 'i'));
  if (line) {
    const after = line.replace(new RegExp(`.*?${PESO_RE.source}\\s*${NETO_RE.source}\\s*[:;.,]?`, 'i'), '');
    const n = firstWeight(after);
    if (n != null && n >= 10000 && n <= 70000) return fmtKg(n);
  }
  // 2) Respaldo: PESO BRUTO - TARA.
  const lB = lineWith(text2, new RegExp(`${PESO_RE.source}\\s*${BRUTO_RE.source}`, 'i'));
  const lT = lineWith(text2, TARA_RE);
  if (lB && lT) {
    const bruto = firstWeight(lB.replace(new RegExp(`.*?${BRUTO_RE.source}\\s*[:;.,]?`, 'i'), ''));
    const tara = firstWeight(lT.replace(new RegExp(`.*?${TARA_RE.source}\\s*[:;.,]?`, 'i'), ''));
    if (bruto != null && tara != null && bruto > tara) {
      const n = bruto - tara;
      if (n >= 10000 && n <= 70000) return fmtKg(n);
    }
  }
  return 'N/D';
}

export async function extractPesoNeto(page2) {
  const text2 = typeof page2 === 'string' ? page2 : page2?.text;
  const pesoLeido = pesoNetoDesdeTexto(text2);
  if (pesoLeido !== 'N/D') return pesoLeido;
  if (typeof page2 === 'object' && page2?.ocrRect && page2.width && page2.height) {
    const rect = rectForPage(page2, {
      left: 0.50,
      top: 0.29,
      width: 0.47,
      height: 0.14,
    });
    for (const psm of ['6', '11']) {
      const crop = await page2.ocrRect(rect, psm, true);
      const after = String(crop || '').replace(
        new RegExp(`^[\\s\\S]*?${PESO_RE.source}\\s*${NETO_RE.source}\\s*[:;.,]?`, 'i'),
        ''
      );
      const n = firstWeight(after);
      if (n != null && n >= 10000 && n <= 70000) return fmtKg(n);
    }
  }
  return 'N/D';
}

function pesoKgFrom(str) {
  if (!str || str === 'N/D') return null;
  return parseNum(str);
}

// ------------------------------------------------------------
// Chofer
// ------------------------------------------------------------
const CUIT_TOKEN = /[CGSU][ULNI]{1,4}T\b/i;

// El chofer figura en la hoja del ticket de balanza (Pag.2) bajo el titulo
// TRANSPORTISTA; en algunos remitos del proveedor aparece como CHOFER. Las
// dos etiquetas valen (son el mismo dato). Si no esta en una hoja, se busca
// en la otra. Se toleran las letras que el OCR suele confundir.
const CHOFER_LABEL = /TRA[A-Z0-9]{0,7}T[I1]?S?TA|CH[O0][FP]ER|CN[O0][FP]ER/i;
const CHOFER_LABEL_CUT =
  /^.*?(?:TRA[A-Z0-9]{0,7}T[I1]?S?TA|CH[O0][FP]ER|CN[O0][FP]ER)\s*[:;.,]?\s*/i;
const CHOFER_BASURA = /GRUPO|FALPAT|FIRMA|BALANC|ENCARG|TRANSPORT/i;

export function extractChofer(...texts) {
  const cands = [];
  for (const text of texts) {
    if (!text) continue;
    const line = lineWith(text, CHOFER_LABEL);
    if (!line) continue;
    let v = line.replace(CHOFER_LABEL_CUT, '');
    v = v.replace(/\s*\(\s*EL\b[\s\S]*$/i, '');
    v = v.replace(/\s+EL\s+(?:(?:[I1]\s*){1,2}(?:T\s*)?A|O[F0]I[C0]I[A4]L)\b[\s\S]*$/i, '');
    // Cortar en el token tipo CUIT (CUIT/CLIT/CUNT/GUIT/SUIT...) o en los
    // digitos del CUIT si el token se perdio.
    let cut = v.split(/\s+(?:[CGSU][ULNI]{1,4}T)\b/i)[0];
    cut = cut.split(/\s+\d{2}\s*[-.]?\s*\d{8}\s*[-.]?\s*\d/i)[0];
    cut = cut.split(/\s+(?:IVA|WA|VA|MA|AE|E)\s*$/i)[0];
    let name = cleanName(cut);
    if (name) name = name.replace(/\s+EL\s+.*$/i, '').trim();
    // Descartar encabezados/pies que solo se parecen a la etiqueta.
    if (name && !CHOFER_BASURA.test(name) && (name.match(/[A-Z]/g) || []).length >= 3) {
      cands.push(name);
    }
  }
  if (!cands.length) return 'N/D';
  // El nombre mas completo es el que sirve: la balanza suele cortarlo
  // ("VIVAS LEONEL") y el remito del proveedor trae el completo
  // ("VIVAS ARNALDO LEONEL").
  cands.sort(
    (a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length
  );
  return cands[0];
}

async function extractChoferConRecorte(page2, page1) {
  const textos = [page2?.text || '', page1?.text || ''];
  const leido = extractChofer(...textos);
  if (leido !== 'N/D' && leido.split(/\s+/).length > 1) return leido;

  const candidatos = leido === 'N/D' ? [] : [leido];
  for (const page of [page2, page1]) {
    if (!page?.ocrRect || !page.width || !page.height) continue;
    const label = (page.words || []).find((word) => CHOFER_LABEL.test(word.text || ''));
    if (!label) continue;

    const left = Math.max(0, Math.floor(label.bbox.x0 - 8));
    const top = Math.max(0, Math.floor(label.bbox.y0 - 12));
    const right = Math.min(page.width, Math.ceil(page.width));
    const bottom = Math.min(page.height, Math.max(
      Math.ceil(label.bbox.y1 + 28),
      Math.ceil(label.bbox.y0 + 48)
    ));
    const rect = {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };

    for (const psm of ['7', '6']) {
      const crop = await page.ocrRect(rect, psm, true, false);
      const candidate = extractChofer(`${label.text} ${crop}`);
      if (candidate !== 'N/D' && candidate.split(/\s+/).length > 1) {
        candidatos.push(candidate);
      }
    }
  }
  if (!candidatos.length) return 'N/D';
  return candidatos.sort(
    (a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length
  )[0];
}

// ------------------------------------------------------------
// Patente
// ------------------------------------------------------------
// Formatos argentinos:
//   Mercosur: LL DDD LL  (2 letras, 3 digitos, 2 letras)  -> AH702XY
//   Viejo:    LLL DDD    (3 letras, 3 digitos)             -> ABC123
// Ante dudas de OCR se corrige cada posicion segun el formato.
const PLATE_RE = /([A-Z]{2}\s?\d{3}\s?[A-Z]{2})/;
const DIGITO_A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 3: 'E', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B', 9: 'G' };
const LETRA_A_DIGITO = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', E: '3', A: '4', S: '5', G: '6', T: '7', B: '8', P: '9', R: '9' };

function coerceWindow(win, kind) {
  let cost = 0;
  const out = [];
  for (let i = 0; i < win.length; i++) {
    const ch = win[i];
    const letterPos = kind === 'mercosur' ? i < 2 || i > 4 : i < 3;
    if (letterPos) {
      if (/[A-Z]/.test(ch)) out.push(ch);
      else {
        const l = DIGITO_A_LETRA[ch];
        if (!l) return null;
        out.push(l);
        cost++;
      }
    } else if (/[0-9]/.test(ch)) out.push(ch);
    else {
      const d = LETRA_A_DIGITO[ch];
      if (!d) return null;
      out.push(d);
      cost++;
    }
  }
  return { plate: out.join(''), cost, kind };
}

// Genera candidatos validos de patente dentro de un texto OCR.
export function plateCandidates(s) {
  const clean = String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!clean) return [];
  const out = [];
  const add = (c) => { if (c) out.push(c); };

  if (clean.length === 7) add(coerceWindow(clean, 'mercosur'));
  else if (clean.length === 8) {
    // Formato Mercosur: conservar las 2 letras de cada extremo y quitar
    // un caracter del medio (asi AH702ZXY -> AH702XY). Mas especulativo.
    for (let d = 2; d <= 5; d++) {
      const c = coerceWindow(clean.slice(0, d) + clean.slice(d + 1), 'mercosur');
      if (c) out.push({ ...c, del: true });
    }
    if (!out.some((x) => x.kind === 'mercosur')) {
      for (let d = 0; d < clean.length; d++) {
        const c = coerceWindow(clean.slice(0, d) + clean.slice(d + 1), 'mercosur');
        if (c) out.push({ ...c, del: true });
      }
    }
  } else if (clean.length === 6) add(coerceWindow(clean, 'old'));
  else {
    for (let i = 0; i + 7 <= clean.length; i++) add(coerceWindow(clean.slice(i, i + 7), 'mercosur'));
    for (let i = 0; i + 6 <= clean.length; i++) add(coerceWindow(clean.slice(i, i + 6), 'old'));
  }
  return out;
}

// Mejor patente de un unico texto: Mercosur manda; el formato viejo
// solo se usa si no hay ninguna lectura Mercosur valida.
export function coercePlate(s) {
  const c = plateCandidates(s);
  if (!c.length) return null;
  const m = c.filter((x) => x.kind === 'mercosur');
  const pool = m.length ? m : c;
  pool.sort((a, b) => a.cost - b.cost);
  return normalizePatente(pool[0].plate);
}

const CHASIS_RE = /CHAS[I1]S|GHAS[I1]S|CH0S[I1]S/i;

// Devuelve solo la zona posterior a "Chasis" y anterior a "Acopl"/"Pat.".
export function plateZone(s) {
  const m = CHASIS_RE.exec(s || '');
  if (!m) return '';
  let z = String(s).slice(m.index + m[0].length);
  const cut = z.search(/ACOPL|PAT\s*[.:]/i);
  if (cut >= 0) z = z.slice(0, cut);
  return z;
}

export async function extractPatente(text2, page2) {
  const w = page2.width || 1;
  const evidence = [];
  const wd = page2.words.find((x) => CHASIS_RE.test(x.text || ''));
  if (wd) {
    const x0 = wd.bbox.x1;
    const y = wd.bbox.y0;
    const rect = {
      left: x0,
      top: Math.max(0, y - 10),
      width: Math.max(1, Math.min(w, x0 + Math.floor(0.34 * w)) - x0),
      height: 56,
    };
    for (const psm of ['6', '7', '8', '11']) {
      evidence.push({ s: await page2.ocrRect(rect, psm), bonus: 1 });
    }
    // Tokens de la misma linea, a la derecha de "Chasis" y antes del acoplado.
    const line = page2.words
      .filter((w2) => Math.abs(w2.bbox.y0 - y) <= 14 && w2.bbox.x0 >= x0 - 2)
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((w2) => w2.text);
    const parts = [];
    for (const t of line) {
      if (/ACOPL|PAT\s*[.:]/i.test(t)) break;
      parts.push(t);
    }
    if (parts.length) evidence.push({ s: parts.join(' '), bonus: 1 });
  }
  // Lineas de texto que contienen "Chasis" (solo la zona de la patente).
  for (const l of (text2 || '').split(/\r?\n/)) {
    if (!CHASIS_RE.test(l)) continue;
    const z = plateZone(l);
    if (z) evidence.push({ s: z, bonus: 1 });
  }

  // Vota cada candidato; el costo castiga las correcciones de formato y
  // se ignora la evidencia repetida (mismo texto leido por dos vias).
  const votes = new Map();
  const seen = new Set();
  for (const ev of evidence) {
    // Solo la primera linea: el resto de la lectura es ruido de atras.
    const firstLine = String(ev.s || '').split(/\r?\n/).find((l) => l.trim()) || '';
    const key = firstLine.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const all = plateCandidates(firstLine);
    const merc = all.filter((x) => x.kind === 'mercosur');
    const pool = (merc.length ? merc : all).map((x) => ({
      plate: x.plate,
      eff: x.cost + (x.del ? 0.5 : 0),
    }));
    if (!pool.length) continue;
    const min = Math.min(...pool.map((x) => x.eff));
    for (const x of pool) {
      if (x.eff > min) continue;
      const p = normalizePatente(x.plate);
      votes.set(p, (votes.get(p) || 0) + ev.bonus / (1 + x.eff));
    }
  }
  let best = null;
  let bestScore = -1;
  for (const [p, s] of votes) if (s > bestScore) { bestScore = s; best = p; }
  return best || 'N/D';
}

// ------------------------------------------------------------
// Material (tolera errores tipicos de OCR)
// ------------------------------------------------------------
export function canonMaterial(raw, lista = MATERIALES) {
  const t = normalizeText(raw);
  if (!t) return null;
  const directo = resolverDesdeLista(raw, lista);
  if (directo.exacto) return directo.valor;
  if (/ARENA\s+FINA/.test(t)) return resolverLista('ARENA FINA', lista);
  if (
    /\bARENA\b/.test(t) &&
    /(?:\bF\s*[.,/ -]?\s*C\b|\bM[I1]N[I1]M[A4]\b|\bF[I1L][N1][A4]\b)/.test(t)
  ) {
    return resolverLista('ARENA FINA', lista);
  }
  if (
    /\bARE[NM]A\b/.test(t) &&
    /G[RA][AM][MN]?[I1]T/.test(t) &&
    (/\b0\s*(?:A|4|HASTA)?\s*6\b/.test(t) || /\bA\s*6\s*MM\b/.test(t))
  ) {
    return resolverLista('ARENA GRANITICA 0/6', lista);
  }
  if (/[PFB][I1]EDRA/.test(t)) {
    if (/\b(?:6|B)\s*(?:A|4|HASTA)?\s*12\b/.test(t)) return resolverLista('PIEDRA PARTIDA 6/12', lista);
    if (/\b(?:6|4|B|G|E)\s*(?:A|4|HASTA)?\s*20\b/.test(t)) return resolverLista('PIEDRA PARTIDA 6/20', lista);
    if (/\b10\s*(?:A|4|HASTA)?\s*30\b/.test(t)) return resolverLista('PIEDRA PARTIDA 10/30', lista);
    if (/\b0\s*(?:A|4|HASTA)?\s*6\b/.test(t)) return resolverLista('PIEDRA PARTIDA 0/6', lista);
    return null;
  }
  if (/FINA/.test(t) && /\b[A-Z]{3,8}\s+FINA\b/.test(t)) return resolverLista('ARENA FINA', lista);
  if (/CORRAL|CORRALOM|MODULO|HOCULG/.test(t)) return resolverLista('ARENA MODULO 1.8-1.9', lista);
  if (/^CTO(?:\s|$)/.test(t) || (/^CEMENTO\s+AVELLANEDA/.test(t) && !/^CEMENTOS\s+AVELLANEDA/.test(t))) {
    return resolverLista('CTO AVELLANEDA', lista);
  }
  return cleanName(raw);
}

// Asigna la entrada canonica de la lista ante un alias/patron ya reconocido,
// incluso si la lista aprendida cambio el nombre exacto.
function resolverLista(nombre, lista) {
  const resuelto = resolverDesdeLista(nombre, lista);
  return resuelto.valor || nombre;
}

// Texto crudo cuando no se pudo canonizar (se resuelve difuso despues).
function materialDeHtml(raw2, raw1) {
  return cleanName(raw2 || raw1) || 'N/D';
}

export function extractMaterial(text1, text2, supplierRow = '', company = '', lista = MATERIALES) {
  const line2 = lineWith(text2, /MATERIAL\s*[:;.]?\s*\S/i);
  const raw2 = line2?.replace(/.*?MATERIAL\s*[:;.]?\s*/i, '').trim() || '';
  const lines1 = (text1 || '').split(/\r?\n/).filter((line) => /PIEDRA|GRAN[I1]TICA|ARENA|^CTO(?:\s|$)|^CEMENTO\s+AVELLANEDA\b/i.test(line));
  // En LCE, la descripción de material de la tabla del remito es la fuente
  // específica; el ticket de balanza puede degradar la granulometría en OCR.
  const resolveCanonical = (raw) => {
    const material = canonMaterial(raw, lista);
    return lista.find((item) => normalizeText(item) === normalizeText(material)) || null;
  };
  const rowMaterial = resolveCanonical(supplierRow);
  const page1Material = lines1.map(resolveCanonical).find(Boolean);
  const primaryMaterial = rowMaterial || page1Material;
  const page2Material = resolveCanonical(raw2);
  const raw1 = lines1.find((line) => resolveCanonical(line)) || '';
  if (company === 'SPO' && page2Material) {
    const conflicto = !!(primaryMaterial && primaryMaterial !== page2Material);
    return {
      valor: page2Material,
      leido: conflicto ? `${primaryMaterial} / ${page2Material}` : raw2,
      similar: false,
      dudoso: conflicto,
      conflicto,
    };
  }
  if (company === 'SPO' && primaryMaterial) {
    return { valor: primaryMaterial, leido: primaryMaterial, similar: false, dudoso: false };
  }
  const conflicto =
    company !== 'SPO' && primaryMaterial && page2Material && primaryMaterial !== page2Material;
  const evidence = [primaryMaterial, page2Material].filter(Boolean);
  const distinct = [...new Set(evidence)];
  const valor = distinct.length === 1 ? distinct[0] : materialDeHtml(raw2, raw1);
  const resuelto = resolverDesdeLista(valor, lista);
  const leido = conflicto ? distinct.join(' / ') : resuelto.leido;
  return {
    valor: resuelto.valor || valor,
    leido,
    similar: resuelto.similar,
    dudoso: conflicto || resuelto.dudoso,
    conflicto: !!conflicto,
  };
}

// ------------------------------------------------------------
// Neto (cantidad declarada en el remito, Pag.1)
// ------------------------------------------------------------
export async function extractNeto(text1, company, remito, pesoKg, page1) {
  const key = company + '|' + remito;
  if (BASE.netos[key]) return BASE.netos[key];

  let nums = kgCandidates(text1);
  let pool = nums.filter((n) => n >= 28000 && n <= 45000);
  const profile = DOCUMENT_PROFILES[company];
  const region = profile?.supplierNeto;
  const rect = rectForPage(page1, region);
  if (rect && page1?.ocrRect) {
    const row = await page1.ocrRect(rect, '6', true, false);
    const rowCandidates = kgCandidates(row).filter((n) => n >= 28000 && n <= 45000);
    if (rowCandidates.length) {
      nums = [...nums, ...rowCandidates];
      pool = [...pool, ...rowCandidates];
    }
    if (company === 'LCE') {
      const readCell = async (top, height, psm) => {
        const cell = await page1.ocrRect(
          rectForPage(page1, { ...profile.supplierNetoCell, top, height }),
          psm,
          true
        );
        return [...new Set(
          kgCandidates(cell).filter((n) => n >= 28000 && n <= 45000)
        )];
      };
      const psm6 = await readCell(profile.supplierNetoCell.top, profile.supplierNetoCell.height, '6');
      const psm11 = await readCell(profile.supplierNetoCell.top, profile.supplierNetoCell.height, '11');
      if (psm6.length === 1 && psm11.length === 1 && psm6[0] === psm11[0]) {
        const [neto] = psm6;
        return pesoKg == null || Math.abs(neto - pesoKg) <= 2000 ? fmtKg(neto) : 'N/D';
      }
      const cellCandidates = [...new Set([...psm6, ...psm11])];
      const anchored = cellCandidates.filter(
        (neto) => pesoKg != null && Math.abs(neto - pesoKg) <= 2000
      );
      if (anchored.length === 1) return fmtKg(anchored[0]);
      return 'N/D';
    }
    if (company === 'AVE') {
      const cellReadings = [];
      for (const psm of ['6', '11']) {
        cellReadings.push(
          await page1.ocrRect(rectForPage(page1, profile.supplierNetoCell), psm, true)
        );
      }
      const candidates = cellReadings.flatMap((text) =>
        kgCandidates(text).filter((n) => n >= 28000 && n <= 45000)
      );
      const votes = new Map();
      for (const candidate of candidates) {
        votes.set(candidate, (votes.get(candidate) || 0) + 1);
      }
      const uniqueShared = [...votes.entries()]
        .filter(([, count]) => count === 2)
        .map(([candidate]) => candidate);
      if (uniqueShared.length === 1) {
        const [neto] = uniqueShared;
        return pesoKg == null || Math.abs(neto - pesoKg) <= 2000 ? fmtKg(neto) : 'N/D';
      }
      const anchored = [...new Set(candidates)].filter(
        (neto) => pesoKg != null && Math.abs(neto - pesoKg) <= 2000
      );
      if (anchored.length === 1) return fmtKg(anchored[0]);
    }
    const hasCloseWeight =
      pesoKg != null && pool.some((n) => Math.abs(n - pesoKg) <= 2000);
    if (company === 'LCE' && pesoKg != null && !hasCloseWeight) {
      const cell = await page1.ocrRect(rectForPage(page1, profile.supplierNetoCell), '11', true);
      const cellCandidates = kgCandidates(cell).filter((n) => n >= 28000 && n <= 45000);
      nums = [...nums, ...cellCandidates];
      pool = [...pool, ...cellCandidates];
    }
  }
  // El neto declarado va de ~35.000 kg (arena) a ~41.000 kg (piedra con semi).
  // Fuera de esta banda es casi seguro una mala lectura del OCR (taras,
  // subtotales, otros items): se descarta.
  if (!pool.length) return 'N/D';

  if (pesoKg != null) {
    // Con peso de balanza disponible, el Neto del remito debe quedar cerca
    // (el declarado y el pesado difieren en pocos cientos de kg). Una
    // diferencia grande delata otra cosa (bruto, tara, subtotal).
    const close = pool
      .filter((n) => Math.abs(n - pesoKg) <= 2000)
      .sort((a, b) => Math.abs(a - pesoKg) - Math.abs(b - pesoKg));
    if (close.length) return fmtKg(close[0]);
    return 'N/D';
  }
  // Sin ancla: solo aceptar si hay un unico candidato plausible.
  if (pool.length === 1) return fmtKg(pool[0]);
  // LCE: la tabla es MATERIAL | BRUTO | TARA | NETO -> el del medio.
  if (company === 'LCE') {
    const s = [...pool].sort((a, b) => a - b);
    return fmtKg(s[Math.floor(s.length / 2)]);
  }
  return 'N/D';
}

// ------------------------------------------------------------
// Razon Social (empresa dueña de la mercaderia; NO es el proveedor)
// ------------------------------------------------------------
// Se lee del documento y se canoniza a las dos razones sociales reales.
// Prioridad: el campo Razón Social del remito del proveedor, su recorte
// específico y, por último, una coincidencia completa en esa misma página.
function canonRazon(s, lista = RAZONES_SOCIALES) {
  const t = normalizeText(s);
  if (!t) return null;
  if (/ALMAJO/.test(t)) return resolverLista('ALMAJO NORTE', lista);
  if (/ARENERA/.test(t) && /CANELONES/.test(t)) return resolverLista('ARENERA CANELONES', lista);
  return null;
}

export function extractRazonSocial(
  text1,
  text2,
  fallback,
  lista = RAZONES_SOCIALES,
  supplierReadings = []
) {
  const l1 = lineWith(text1, /RAZ[O0]N\s*SOCIAL/i);
  if (l1) {
    const valorLinea = l1.replace(/.*?SOCIAL\s*[:;.]?\s*/i, '').trim();
    const v = canonRazon(valorLinea, lista);
    if (v) return { valor: v, leido: cleanName(valorLinea), similar: false, dudoso: false };
    const difuso = resolverDesdeLista(valorLinea, lista, 0.86);
    if (difuso.valor && !difuso.dudoso) return difuso;
  }

  const readings = Array.isArray(supplierReadings) ? supplierReadings : [supplierReadings];
  const directReadings = readings
    .map((reading) => ({ reading, value: canonRazon(reading, lista) }))
    .filter((item) => item.value);
  const uniqueReadings = [...new Set(directReadings.map((item) => item.value))];
  if (uniqueReadings.length === 1) {
    const match = directReadings.find((item) => item.value === uniqueReadings[0]);
    return {
      valor: uniqueReadings[0],
      leido: cleanName(match.reading),
      similar: false,
      dudoso: false,
    };
  }
  if (uniqueReadings.length > 1) {
    return {
      valor: null,
      leido: directReadings.map((item) => cleanName(item.reading)).join(' / '),
      similar: false,
      dudoso: true,
    };
  }

  const l2 = lineWith(text2, /PROVEEDOR/i);
  if (l2) {
    const valorLinea = l2.replace(/.*?PROVEEDOR\s*[:;.]?\s*/i, '').trim();
    const v = canonRazon(valorLinea, lista);
    if (v) return { valor: v, leido: cleanName(valorLinea), similar: false, dudoso: false };
  }
  return { valor: fallback ?? null, leido: '', similar: false, dudoso: true };
}

// ------------------------------------------------------------
// Registro completo
// ------------------------------------------------------------
export async function extractRecord({ fileName, pages, base }) {
  if (!pages || pages.length < 2) throw new Error('El PDF no tiene 2 páginas');
  const [p1, p2] = pages;
  const texto = (p1.text || '') + '\n' + (p2.text || '');
  const header = headerFromWords(p1);
  const company = detectCompany(fileName, header, texto);
  if (!COMPANIES[company]) throw new Error(`Empresa no reconocida para ${fileName}`);

  const pesoNeto = await extractPesoNeto(p2);
  const pesoKg = pesoKgFrom(pesoNeto);

  const chofer = await extractChoferConRecorte(p2, p1);
  const patenteOCR = await extractPatente(p2.text, p2);
  const remitoResult = await extractRemito(p2.text, company, p1, p2);
  const remito = remitoResult.value;
  const fecha = fechaOperacion(p1, p2, fileName);
  const listaRazones = (base && base.razonesSociales) || RAZONES_SOCIALES;
  const listaMateriales = (base && base.materiales) || MATERIALES;
  const razonReadings = await ocrRegion(
    p1,
    DOCUMENT_PROFILES[company]?.supplierRazon,
    ['7', '6', '11'],
    company !== 'LCE'
  );
  const razonResult = extractRazonSocial(
    p1.text,
    p2.text,
    null,
    listaRazones,
    razonReadings
  );
  const materialRegion = DOCUMENT_PROFILES[company]?.supplierMaterial;
  const materialRect = rectForPage(p1, materialRegion);
  const supplierRow = materialRect && p1?.ocrRect
    ? await p1.ocrRect(materialRect, '11', true, false)
    : '';
  const ticketMaterialRect =
    p2.width && p2.height
      ? {
          left: Math.floor(p2.width * 0.02),
          top: Math.floor(p2.height * 0.22),
          width: Math.floor(p2.width * 0.96),
          height: Math.floor(p2.height * 0.10),
        }
      : null;
  const ticketMaterialReads = [];
  if (p2?.ocrRect && ticketMaterialRect) {
    for (const psm of ['6', '11']) {
      ticketMaterialReads.push(
        await p2.ocrRect(ticketMaterialRect, psm, true, false)
      );
    }
  }
  const materialResults = ticketMaterialReads
    .filter((read) => /ARENA|PIEDRA|GRAN[I1]T|CORRAL|CEMENTO|CTO/i.test(read))
    .map((read) =>
      extractMaterial(
        p1.text,
        `${/MATERIAL/i.test(read) ? '' : 'MATERIAL: '}${read}\n${p2.text}`,
        supplierRow,
        company,
        listaMateriales
      )
    );
  const recognizedMaterials = materialResults.filter((result) =>
    listaMateriales.some(
      (material) => normalizeText(material) === normalizeText(result.valor)
    )
  );
  const materialVotes = new Map();
  for (const result of recognizedMaterials) {
    materialVotes.set(result.valor, (materialVotes.get(result.valor) || 0) + 1);
  }
  const rankedMaterials = [...materialVotes.entries()].sort((a, b) => b[1] - a[1]);
  const materialResult =
    rankedMaterials.length === 1 || rankedMaterials[0]?.[1] > rankedMaterials[1]?.[1]
      ? recognizedMaterials.find((result) => result.valor === rankedMaterials[0][0])
      : extractMaterial(p1.text, p2.text, supplierRow, company, listaMateriales);
  const rec = {
    Fecha: fecha.date ? applyScanYear(fecha.date, fileName) : 'N/D',
    Proveedor: COMPANIES[company].proveedor,
    'N Remito': remitoResult.value,
    'Razon Social': razonResult.valor || COMPANIES[company].razon,
    Material: materialResult.valor || 'N/D',
    Neto: await extractNeto(p1.text, company, remitoResult.value, pesoKg, p1),
    'Peso Neto': pesoNeto,
    Chofer: chofer,
    'Pat. Chasis': patenteOCR,
  };
  rec._revision = {};
  if (remitoResult.conflict) {
    rec._revision['N Remito'] = 'Los números del remito no coinciden';
  }
  if (fecha.conflict) {
    rec._revision.Fecha = 'Las fechas del ticket y el remito no coinciden; revisar la fecha de operación';
  }
  if (!razonResult.valor) {
    rec._revision['Razon Social'] = 'No se pudo confirmar en el documento; revisar la razón social';
  } else if (razonResult.dudoso) {
    rec._revision['Razon Social'] = `No coincide exacto con la tabla: se asignó "${razonResult.valor}"`;
  } else if (razonResult.similar) {
    rec._revision['Razon Social'] = `Asignada por parecido: "${razonResult.valor}" (leído: "${razonResult.leido}")`;
  }
  if (materialResult.conflicto) {
    rec._revision.Material = `El remito y la balanza difieren (${materialResult.leido}); revisar el material`;
  } else if (materialResult.dudoso) {
    rec._revision.Material = `No coincide exacto con la tabla: se asignó "${materialResult.valor}"`;
  } else if (materialResult.similar) {
    rec._revision.Material = `Asignado por parecido: "${materialResult.valor}" (leído: "${materialResult.leido}")`;
  }
  const pk = company + '|' + remito;
  const netoBase = (base && base.netos && base.netos[pk]) || BASE.netos[pk];
  if (netoBase) rec.Neto = netoBase;
  const placaBase = (base && base.patentesPorTicket && base.patentesPorTicket[pk]) || BASE.patentesPorTicket[pk];
  if (placaBase) rec['Pat. Chasis'] = placaBase;
  // Duda de OCR: si el chofer esta en la base, manda la patente verificada.
  const hint = plateZone(p2.text);
  rec['Pat. Chasis'] =
    patenteConocida(chofer, rec['Pat. Chasis'], hint, base) || rec['Pat. Chasis'];
  // Usa una asociación verificada patente/chofer solo para resolver lecturas
  // ausentes o muy parecidas; los desacuerdos quedan visibles para revisión.
  const choferResuelto = resolverChoferPorPatente(
    rec.Chofer,
    rec['Pat. Chasis'],
    base
  );
  rec.Chofer = choferResuelto.valor;
  if (choferResuelto.revision) {
    rec._revision.Chofer = choferResuelto.revision;
  }
  const reglas = { ...(BASE.reglasLectura || {}), ...(base?.reglasLectura || {}) };
  const lecturasOriginales = {
    'Razon Social': razonResult.leido,
    Material: materialResult.leido,
    Chofer: chofer,
    'Pat. Chasis': patenteOCR,
  };
  for (const campo of CAMPOS_REGLA_LECTURA) {
    const clave = claveRegla(company, campo, lecturasOriginales[campo]);
    if (clave && typeof reglas[clave] === 'string') {
      aplicarCorreccion(rec, campo, reglas[clave]);
    }
  }
  const archivoKey = claveArchivo(company, fileName);
  const ticketKey = `${company}|${normalizeRemito(remito) || ''}`;
  const correccionArchivo = {
    ...BASE.correccionesPorArchivo?.[archivoKey],
    ...base?.correccionesPorArchivo?.[archivoKey],
  };
  const correccionTicket = {
    ...BASE.correccionesPorTicket?.[ticketKey],
    ...base?.correccionesPorTicket?.[ticketKey],
  };
  if (!correccionTicket.Neto && campoNeto(base, ticketKey)) {
    correccionTicket.Neto = campoNeto(base, ticketKey);
  }
  for (const correcciones of [correccionTicket, correccionArchivo]) {
    for (const [campo, valor] of Object.entries(correcciones)) {
      if (CAMPOS_APRENDIBLES.has(campo)) aplicarCorreccion(rec, campo, valor);
    }
  }
  if (Object.keys(rec._revision).length === 0) delete rec._revision;
  return { company, rec };
}

function campoNeto(base, key) {
  return (base?.netos && base.netos[key]) || BASE.netos[key] || null;
}

function aplicarCorreccion(rec, campo, valor) {
  const limpio = String(valor ?? '').trim();
  if (!CAMPOS_APRENDIBLES.has(campo) || !limpio || limpio.toUpperCase() === 'N/D') return;
  rec[campo] = limpio;
  if (rec._revision) delete rec._revision[campo];
}

// Nombre del chofer dueño de una patente ya verificada.
function choferPorPatente(placa, base) {
  const p = normalizePatente(placa);
  if (!p || p === 'ND') return null;
  const fuentes = [BASE.patentes];
  if (base && base.patentes) fuentes.push(base.patentes);
  const nombres = [{ ...BASE.choferes, ...(base && base.choferes) }];
  const coincidencias = new Set();
  for (const mapa of fuentes) {
    for (const [apellido, lista] of Object.entries(mapa)) {
      if (lista.includes(p) && nombres[0][apellido]) {
        coincidencias.add(nombres[0][apellido]);
      }
    }
  }
  return coincidencias.size === 1 ? [...coincidencias][0] : null;
}

function resolverChoferPorPatente(leido, placa, base) {
  const conocido = choferPorPatente(placa, base);
  const original = String(leido || '').trim();
  const normLeido = normalizeText(original);
  const apellidoLeido = normLeido.split(' ')[0];
  const candidatosConocidos = [
    BASE.choferes[apellidoLeido],
    base?.choferes?.[apellidoLeido],
  ].filter(Boolean);
  const prefijosCoincidentes = [...new Set(candidatosConocidos)].filter((nombre) => {
    const normalizado = normalizeText(nombre);
    return normLeido.startsWith(`${normalizado} `);
  });
  if (
    prefijosCoincidentes.length === 1 &&
    (!conocido ||
      normalizeText(conocido).split(' ')[0] === apellidoLeido)
  ) {
    return {
      valor: prefijosCoincidentes[0],
      revision: `Se limpió el texto agregado por OCR usando el chofer guardado "${prefijosCoincidentes[0]}"; verificar`,
    };
  }
  if (!conocido) return { valor: original || 'N/D', revision: null };
  if (!original || original.toUpperCase() === 'N/D') {
    return { valor: conocido, revision: null };
  }

  const normConocido = normalizeText(conocido);
  if (normLeido === normConocido) return { valor: conocido, revision: null };

  const apellidoConocido = normConocido.split(' ')[0];
  const ratio = similitudTexto(normLeido, normConocido);
  if (apellidoLeido === apellidoConocido && ratio >= 0.8) {
    return {
      valor: conocido,
      revision: `Se normalizó según la patente asociada en la base; verificar el chofer "${conocido}" (OCR: "${original}")`,
    };
  }

  return {
    valor: original,
    revision: `La patente está asociada en la base a "${conocido}", pero el OCR leyó "${original}"; verificar`,
  };
}

// ------------------------------------------------------------
// Base de conocimiento: patente por chofer
// ------------------------------------------------------------
// Con una sola patente cargada (base.patentes[apellido]) no hay duda: se usa
// tal cual, aunque el OCR lea otra cosa. Con varias (el chofer cambio de
// camion) se elige la que mas se parezca a lo leido; si el OCR no llego a
// armar una patente, se compara contra el texto crudo de la zona (hint).
export function patenteConocida(chofer, ocr, hint, base) {
  const apellidos = String(chofer || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const apellido = apellidos[0] || '';
  // 1) Chofer exacto en la base.
  let opciones = opcionesPatente(base, apellido);
  // 2) El OCR suele comerse una letra del apellido (P/BI, D/T...): buscar
  //    el chofer parecido que ya tenemos verificado.
  if (!opciones.length && apellido) {
    const parecido = apellidoParecido(apellido, base);
    if (parecido) opciones = opcionesPatente(base, parecido);
  }
  // 3) Sin chofer: si lo leido se parece mucho a una patente conocida,
  //    se asume que es esa (nunca a mas de 2 caracteres de distancia).
  if (!opciones.length) {
    let actual = normalizePatente(ocr) || '';
    if (!actual || actual === 'ND') actual = normalizePatente(hint) || '';
    if (actual && actual !== 'ND') {
      let mejor = null;
      let mejorD = Infinity;
      for (const p of patentesConocidas(base)) {
        // Solo si difieren en los digitos (las letras y el formato deben
        // coincidir): asi 854ER->894ER si, pero 712XY->702XX no.
        if (!mismasLetras(actual, p)) continue;
        const d = editDistance(actual, p);
        if (d < mejorD) { mejorD = d; mejor = p; }
      }
      if (mejor && mejorD <= 2) return mejor;
    }
    return null;
  }
  if (opciones.length === 1) return opciones[0];
  let actual = normalizePatente(ocr) || '';
  if (!actual || actual === 'ND') actual = normalizePatente(hint) || '';
  if (!actual || actual === 'ND') return null;
  let mejor = null;
  let mejorD = Infinity;
  for (const op of opciones) {
    const d = editDistance(actual, op);
    if (d < mejorD) { mejorD = d; mejor = op; }
  }
  return mejorD <= 3 ? mejor : null;
}

// Mismo formato letra/digito y mismas letras: solo cambian los numeros.
function mismasLetras(a, b) {
  if (a.length !== b.length) return false;
  const esLetra = (c) => /[A-Z]/.test(c);
  for (let i = 0; i < a.length; i++) {
    if (esLetra(a[i]) !== esLetra(b[i])) return false;
    if (esLetra(a[i]) && a[i] !== b[i]) return false;
  }
  return true;
}

// Apellido del chofer mas parecido a lo leido (tolerando 1-2 letras mal).
function apellidoParecido(apellido, base) {
  const nombres = new Set(Object.keys(BASE.patentes));
  if (base && base.patentes) for (const k of Object.keys(base.patentes)) nombres.add(k);
  let mejor = null;
  let mejorD = Infinity;
  for (const nombre of nombres) {
    const d = editDistance(apellido, nombre);
    if (d < mejorD) { mejorD = d; mejor = nombre; }
  }
  return mejorD <= 2 ? mejor : null;
}

function patentesConocidas(base) {
  const out = new Set();
  for (const lista of Object.values(BASE.patentes)) lista.forEach((p) => out.add(p));
  if (base && base.patentes) {
    for (const lista of Object.values(base.patentes)) lista.forEach((p) => out.add(p));
  }
  return [...out];
}

// Patentes cargadas a mano (base.mjs) mas las aprendidas de los registros ya
// guardados. La base curada tiene prioridad para ese chofer.
function opcionesPatente(base, apellido) {
  return [
    ...new Set([
      ...(BASE.patentes[apellido] || []),
      ...((base && base.patentes && base.patentes[apellido]) || []),
    ]),
  ];
}

// ------------------------------------------------------------
// Base de conocimiento: aprendizaje automatico
// ------------------------------------------------------------
// Acepta filas del ticket (columnas "Chofer", "Pat. Chasis", "N Remito",
// "Proveedor", "Neto") o registros de la DB (chofer, patente, proveedor...).
// Devuelve las correlaciones verificadas para reusar en la proxima lectura.
export function aprenderDeFilas(filas, { incluirCorrecciones = true } = {}) {
  const patentes = {};
  const choferes = {};
  const netos = {}; // el Neto NO se aprende solo (los numeros varian); se cura a mano
  const patentesPorTicket = {};
  const correccionesPorTicket = {};
  const correccionesPorArchivo = {};
  const materiales = [];
  for (const f of filas || []) {
    const material = String(f.Material || f.material || '').trim();
    if (material && material.toUpperCase() !== 'N/D' && !materiales.includes(material)) {
      materiales.push(material);
    }
    const apellido = apellidoDe(f.Chofer || f.chofer);
    const nombre = String(f.Chofer || f.chofer || '').trim().toUpperCase();
    const patente = placaValida(f['Pat. Chasis'] || f.patente);
    const empresa = empresaDeProveedor(f.Proveedor || f.proveedor);
    const remito = normalizeRemito(f['N Remito'] || f.nroRemitoProveedor || '');
    const clave = empresa && remito && remito !== '0' ? `${empresa}|${remito}` : null;
    const correcciones = Object.fromEntries(
      Object.entries(f).filter(
        ([campo, valor]) =>
          CAMPOS_APRENDIBLES.has(campo) &&
          valor != null &&
          String(valor).trim() !== '' &&
          String(valor).trim().toUpperCase() !== 'N/D'
      )
    );

    if (apellido && patente) {
      const lista = patentes[apellido] || (patentes[apellido] = []);
      if (!lista.includes(patente)) lista.push(patente);
      if (nombre && nombre !== 'N/D') choferes[apellido] = nombre;
    }
    if (clave && patente) patentesPorTicket[clave] = patente;
    if (incluirCorrecciones && clave && Object.keys(correcciones).length) {
      correccionesPorTicket[clave] = correcciones;
    }
    const archivo = claveArchivo(empresa, f.Archivo || f.archivo);
    if (incluirCorrecciones && archivo && Object.keys(correcciones).length) {
      correccionesPorArchivo[archivo] = correcciones;
    }
  }
  return {
    patentes,
    choferes,
    netos,
    patentesPorTicket,
    correccionesPorTicket,
    correccionesPorArchivo,
    reglasLectura: {},
    materiales,
  };
}

// Compatibilidad: aprendizaje desde registros de la DB.
export function learnFromRecords(records) {
  return aprenderDeFilas(records, { incluirCorrecciones: false });
}

const CAMPOS_REGLA_LECTURA = ['Razon Social', 'Material', 'Chofer', 'Pat. Chasis'];
const CAMPOS_APRENDIBLES = new Set([
  'Fecha',
  'N Remito',
  'Razon Social',
  'Material',
  'Neto',
  'Peso Neto',
  'Chofer',
  'Pat. Chasis',
]);

function claveRegla(empresa, campo, valor) {
  const origen = campo === 'Pat. Chasis' ? normalizePatente(valor) : normalizeText(valor);
  return origen && origen !== 'ND' ? `${empresa}|${campo}|${origen}` : null;
}

function claveArchivo(empresa, archivo) {
  const nombre = String(archivo || '').split(/[\\/]/).pop().trim().toUpperCase();
  return empresa && nombre ? `${empresa}|${nombre}` : null;
}

// Los patrones se crean solo a partir de correcciones explícitas del operador.
// Pesos, netos, fechas y remitos se guardan únicamente como correcciones exactas.
export function aprenderDeCorrecciones(correcciones) {
  const reglasLectura = {};
  for (const item of correcciones || []) {
    const empresa = empresaDeProveedor(item?.corregido?.Proveedor);
    if (!empresa) continue;
    for (const [campo, cambio] of Object.entries(item.cambios || {})) {
      if (!CAMPOS_REGLA_LECTURA.includes(campo)) continue;
      const origen = String(cambio?.de ?? '').trim();
      const destino = String(cambio?.a ?? '').trim();
      const key = claveRegla(empresa, campo, origen);
      if (!key || !destino || destino.toUpperCase() === 'N/D') continue;
      if (!(key in reglasLectura)) {
        reglasLectura[key] = destino;
      } else if (reglasLectura[key] !== destino) {
        reglasLectura[key] = null;
      }
    }
  }
  return { reglasLectura };
}

// Une varias bases (persistida + aprendida en memoria). Para patentes suma
// (un chofer puede haber cambiado de camion); el resto, lo ultimo gana.
export function unirBase(...bases) {
  const out = {
    patentes: {},
    choferes: {},
    netos: {},
    patentesPorTicket: {},
    correccionesPorTicket: {},
    correccionesPorArchivo: {},
    reglasLectura: {},
    razonesSociales: [...RAZONES_SOCIALES],
    materiales: [...MATERIALES],
  };
  const sumarUnicos = (destino, lista) => {
    for (const v of lista || []) {
      const limpio = String(v ?? '').trim();
      if (limpio && !destino.includes(limpio)) destino.push(limpio);
    }
  };
  for (const b of bases) {
    if (!b) continue;
    sumarUnicos(out.razonesSociales, b.razonesSociales);
    sumarUnicos(out.materiales, b.materiales);
    for (const [k, lista] of Object.entries(b.patentes || {})) {
      const arr = out.patentes[k] || (out.patentes[k] = []);
      for (const p of lista) if (!arr.includes(p)) arr.push(p);
    }
    Object.assign(out.choferes, b.choferes || {});
    Object.assign(out.netos, b.netos || {});
    Object.assign(out.patentesPorTicket, b.patentesPorTicket || {});
    Object.assign(out.correccionesPorTicket, b.correccionesPorTicket || {});
    Object.assign(out.correccionesPorArchivo, b.correccionesPorArchivo || {});
    for (const [key, value] of Object.entries(b.reglasLectura || {})) {
      if (!(key in out.reglasLectura)) {
        out.reglasLectura[key] = value;
      } else if (out.reglasLectura[key] !== value) {
        out.reglasLectura[key] = null;
      }
    }
  }
  return out;
}

function apellidoDe(chofer) {
  const ap = String(chofer || '').trim().toUpperCase().split(/\s+/)[0];
  return ap && ap !== 'N/D' ? ap : null;
}

// Solo se aprende una patente con formato argentino valido (Mercosur o viejo).
function placaValida(s) {
  const p = normalizePatente(s);
  if (!p) return null;
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{3}\d{3}$/.test(p) ? p : null;
}

function empresaDeProveedor(p) {
  const s = String(p || '').toUpperCase();
  if (s.includes('LCE') || s.includes('ALMAJO') || s.includes('CANTERAS')) return 'LCE';
  if (s.includes('AVELLANEDA') || s.includes('AVE')) return 'AVE';
  if (s.includes('SPOSITO') || s.includes('SPO')) return 'SPO';
  return null;
}

export const CAMPOS = ['Fecha', 'Proveedor', 'N Remito', 'Razon Social', 'Material', 'Neto', 'Peso Neto', 'Chofer', 'Pat. Chasis'];

// ------------------------------------------------------------
// Revisión: marca los campos fuera de lo normal.
// Devuelve { campo: motivo } para pintar en rojo los que quedaron
// raros (sin dato, fuera de rango, formato inválido...).
// ------------------------------------------------------------
export const RANGO_PESO = [28000, 45000]; // kg normales (arena ~35 tn, piedra con semi ~40 tn)
export const MATERIALES_OK = new Set(MATERIALES);
export const RAZONES_OK = new Set(RAZONES_SOCIALES);
export const LARGO_REMITO = { LCE: 6, AVE: 6, SPO: 5 };

export function largoRemitoEsperado(proveedor) {
  return LARGO_REMITO[empresaDeProveedor(proveedor)] || null;
}

function parseFechaDMY(v) {
  const m = /(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/.exec(String(v || ''));
  if (!m) return null;
  let d = Number(m[1]);
  let mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[1].length === 4) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  }
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function revisarRegistro(rec) {
  const out = {};
  Object.assign(out, rec?._revision || {});
  const nd = (v) =>
    v === undefined || v === null || String(v).trim() === '' || String(v).toUpperCase() === 'N/D';
  const obligatorios = [
    'Fecha',
    'N Remito',
    'Razon Social',
    'Material',
    'Peso Neto',
    'Chofer',
    'Pat. Chasis',
  ];
  if (!/SPOSITO/i.test(String(rec.Proveedor || ''))) obligatorios.push('Neto');
  for (const c of obligatorios) if (nd(rec[c])) out[c] = 'Sin dato';
  // Pesos fuera de rango.
  for (const c of ['Neto', 'Peso Neto']) {
    if (nd(rec[c])) continue;
    const n = parseNum(rec[c]);
    if (n == null || n < RANGO_PESO[0] || n > RANGO_PESO[1]) {
      out[c] = `Fuera de lo normal (${fmtKg(RANGO_PESO[0])}–${fmtKg(RANGO_PESO[1])})`;
    }
    const neto = nd(rec.Neto) ? null : parseNum(rec.Neto);
    const pesoNeto = nd(rec['Peso Neto']) ? null : parseNum(rec['Peso Neto']);
    if (neto != null && pesoNeto != null && Math.abs(neto - pesoNeto) > 2000) {
      out.Neto = 'Difiere más de 2.000 kg del peso de balanza';
    }
  }
  // El material y la razón social no se bloquean: pueden ser nuevos y se
  // agregan a la lista al guardar. Los avisos de OCR dudoso ya vienen en
  // `_revision` desde la extracción.
  // Patente con formato inválido.
  if (!nd(rec['Pat. Chasis']) && !placaValida(rec['Pat. Chasis'])) {
    out['Pat. Chasis'] = 'Patente con formato inválido';
  }
  // Remito con largo distinto al del proveedor. Si el operador ya confirmó
  // explícitamente que el número es correcto, no se marca.
  if (!nd(rec['N Remito']) && !rec?._confirmados?.['N Remito']) {
    const largo = largoRemitoEsperado(rec.Proveedor);
    if (largo && normalizeRemito(rec['N Remito']).length !== largo) {
      out['N Remito'] = `Largo esperado: ${largo} dígitos`;
    }
  }
  // Fecha inválida o muy lejana.
  if (!nd(rec.Fecha)) {
    const d = parseFechaDMY(rec.Fecha);
    if (!d) {
      out.Fecha = 'Fecha inválida';
    } else {
      const dias = (Date.now() - d.getTime()) / 86400000;
      if (dias < -1 || dias > 90) out.Fecha = 'Fecha fuera de rango';
    }
  }
  return out;
}
