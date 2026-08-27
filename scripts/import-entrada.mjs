// ============================================================
// scripts/import-entrada.mjs
// Carga masiva de entradas desde un Excel (formato Entrada.xlsx)
// hacia la base de datos de GitHub (data/db.json) en una rama.
//
// Uso:
//   node scripts/import-entrada.mjs [archivo.xlsx] [rama]
//
// Valores por defecto:  entrada/Entrada.xlsx   rama "dev"
// Lee GITHUB_REPO y GITHUB_TOKEN desde .env.local.
// NO toca la rama main (producción queda intacta).
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { CATALOGO_PRODUCTOS, unidadPorCodigo, cantidadConUnidad } from '../lib/productos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = 'data/db.json';
const API = 'https://api.github.com';

// ---------- Entorno ----------
function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const repo = process.env.GITHUB_REPO || env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN || env.GITHUB_TOKEN;
  if (!repo) throw new Error('Falta GITHUB_REPO en .env.local');
  if (!token) throw new Error('Falta GITHUB_TOKEN en .env.local');
  return { repo, token };
}

// ---------- Cliente GitHub ----------
function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'falpat-stock-import',
  };
}

async function gh(url, token, options = {}) {
  const res = await fetch(url, { ...options, headers: headers(token) });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data, text };
}

async function asegurarRama(repo, token, branch) {
  const ref = await gh(`${API}/repos/${repo}/git/ref/heads/${branch}`, token);
  if (ref.ok) return;
  if (ref.status !== 404) throw new Error(`No se pudo consultar la rama ${branch}: ${ref.text.slice(0, 160)}`);
  const main = await gh(`${API}/repos/${repo}/git/ref/heads/main`, token);
  if (!main.ok) throw new Error(`No se pudo leer la rama main: ${main.text.slice(0, 160)}`);
  const create = await gh(`${API}/repos/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.data.object.sha }),
  });
  if (!create.ok) throw new Error(`No se pudo crear la rama ${branch}: ${create.text.slice(0, 160)}`);
  console.log(`Rama "${branch}" creada desde main.`);
}

async function readDb(repo, token, branch) {
  const res = await gh(`${API}/repos/${repo}/contents/${DB_PATH}?ref=${branch}`, token);
  if (!res.ok) throw new Error(`No se pudo leer ${DB_PATH} en ${branch}: ${res.text.slice(0, 160)}`);
  // La API de contents trunca archivos >1MiB: leer el blob por sha en ese caso.
  let content = res.data.content;
  if (res.data.size > 1024 * 1024 || !content) {
    const blob = await gh(`${API}/repos/${repo}/git/blobs/${res.data.sha}`, token);
    if (!blob.ok) throw new Error(`No se pudo leer el blob de ${DB_PATH}: ${blob.text.slice(0, 160)}`);
    content = blob.data.content;
  }
  return {
    sha: res.data.sha,
    db: JSON.parse(Buffer.from(content, 'base64').toString('utf-8')),
  };
}

async function writeDb(repo, token, branch, db, sha, message) {
  const body = {
    message: `[falpat-stock] ${message}`,
    content: Buffer.from(JSON.stringify(db, null, 2) + '\n', 'utf-8').toString('base64'),
    branch,
    sha,
  };
  const res = await gh(`${API}/repos/${repo}/contents/${DB_PATH}`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Escritura fallida (${res.status}): ${res.text.slice(0, 200)}`);
  return res.data.content.sha;
}

// ---------- Utilidades ----------
function idNuevo() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function serialToDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function aISO(fecha) {
  return `${fecha}T12:00:00.000Z`;
}

function texto(v) {
  return String(v ?? '').trim();
}

function numero(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

// ---------- Importación ----------
const [excelArg, branchArg] = process.argv.slice(2);
const excel = path.resolve(ROOT, excelArg || 'entrada/Entrada.xlsx');
const branch = branchArg || 'dev';
const { repo, token } = loadEnv();

console.log(`Archivo: ${excel}`);
console.log(`Repo:    ${repo}`);
console.log(`Rama:    ${branch}`);
console.log('');

if (!fs.existsSync(excel)) {
  throw new Error(`No existe el archivo: ${excel}`);
}

const rows = await readXlsxFile(excel, { sheet: 'CARGA' });
// read-excel-file puede devolver filas directamente o una lista de hojas
// con la forma [{ sheet, data }]. Normalizar a filas planas.
const rowsFlat = Array.isArray(rows) && Array.isArray(rows[0]) ? rows : rows[0]?.data || rows;

// Cabecera -> índice de columna
const headerRow = rowsFlat[0].map((h) => texto(h).toUpperCase());
const colIndex = (name) => headerRow.findIndex((h) => h === name);
const cols = {
  remitos: colIndex('REMITOS'),
  observacion: colIndex('OBSERVACION'),
  fecha: colIndex('FECHA'),
  codigo: colIndex('CODIGO DEL PRODUCTO'),
  descripcion: colIndex('DESCRIPCION'),
  cantidad: colIndex('CANTIDAD KG'),
};
for (const [k, v] of Object.entries(cols)) {
  if (v === -1) throw new Error(`Falta la columna "${k.toUpperCase()}" en la fila de encabezados.`);
}
console.log('Columnas detectadas:', Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, headerRow[v]])));

// Parsear filas
const records = [];
const descartadas = [];
for (let i = 1; i < rowsFlat.length; i++) {
  const r = rowsFlat[i];
  const remito = texto(r[cols.remitos]);
  const fechaRaw = r[cols.fecha];
  const codigo = texto(r[cols.codigo]).toUpperCase();
  const descripcion = texto(r[cols.descripcion]);
  const proveedor = texto(r[cols.observacion]);
  const cantidad = numero(r[cols.cantidad]);

  if (!remito && fechaRaw == null && !descripcion) continue; // fila vacía

  let fecha = '';
  if (fechaRaw instanceof Date) {
    // La fecha del Excel es un día calendario (medianoche UTC): usar
    // componentes UTC para no correr un día atrás en zonas -03:00.
    const utc = fechaRaw.toISOString().slice(0, 10);
    const [y, m, d] = utc.split('-');
    fecha = `${y}-${m}-${d}`;
  } else if (typeof fechaRaw === 'number' && Number.isFinite(fechaRaw)) {
    fecha = serialToDate(fechaRaw);
  } else if (typeof fechaRaw === 'string') {
    const iso = texto(fechaRaw);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) {
      fecha = `${m[1]}-${m[2]}-${m[3]}`;
    } else if (/^\d+(\.\d+)?$/.test(iso)) {
      fecha = serialToDate(Number(iso));
    } else {
      descartadas.push(`fila ${i + 1}: fecha no reconocida (${JSON.stringify(fechaRaw)})`);
      continue;
    }
  } else {
    descartadas.push(`fila ${i + 1}: fecha no reconocida (${JSON.stringify(fechaRaw)})`);
    continue;
  }

  if (!descripcion) {
    descartadas.push(`fila ${i + 1}: falta descripción`);
    continue;
  }
  if (!Number.isFinite(cantidad)) {
    descartadas.push(`fila ${i + 1}: cantidad inválida (${JSON.stringify(r[cols.cantidad])})`);
    continue;
  }

  const unidad = unidadPorCodigo(codigo);
  const peso = cantidadConUnidad(cantidad, unidad);

  records.push({
    id: idNuevo(),
    carga: 'Entrada',
    producto: descripcion,
    codigoProducto: codigo,
    fechaRemito: aISO(fecha),
    patente: '',
    chofer: '',
    nroRemitoProveedor: remito,
    nroRemitoFalpat: '',
    pesoProveedor: '',
    pesoBalanza: peso,
    planta: 'Lujan',
    proveedor,
    cliente: '',
    createdAt: new Date().toISOString(),
  });
}

if (records.length === 0) throw new Error('No se encontraron registros para importar.');

console.log(`\nRegistros a importar: ${records.length}`);
console.log(`Descartados: ${descartadas.length}`);
for (const d of descartadas.slice(0, 10)) console.log('  ⚠ ' + d);

// Resumen por producto
const resumen = new Map();
for (const rec of records) {
  const key = `${rec.codigoProducto} | ${rec.producto} | ${rec.pesoBalanza.split(' ')[1] || ''}`;
  if (!resumen.has(key)) resumen.set(key, 0);
  resumen.set(key, resumen.get(key) + 1);
}
console.log('\nResumen por producto (codigo | nombre | medida):');
for (const [k, c] of [...resumen.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k} -> ${c}`);
}

// Guardar en la rama, en tandas
await asegurarRama(repo, token, branch);

const { sha, db } = await readDb(repo, token, branch);

// Los registros previos "seed-*" son datos de prueba: no se conservan.
const sinSeed = (rec) => !String(rec.id || '').startsWith('seed-');
const base = (db.records || []).filter(sinSeed);

const clave = (rec) =>
  `${rec.fechaRemito}|${rec.producto}|${rec.nroRemitoProveedor}|${rec.pesoBalanza}|${rec.proveedor}`;

const existentes = new Set(base.map(clave));
const nuevos = records.filter((rec) => !existentes.has(clave(rec)));
const duplicados = records.length - nuevos.length;
const seedEliminados = (db.records || []).length - base.length;
console.log(`\nYa existían: ${duplicados} | A insertar: ${nuevos.length} | Seeds eliminados: ${seedEliminados}`);

const productosFinales = Array.from(
  new Set([...(db.productos || []).filter((p) => base.some((r) => r.producto === p)), ...nuevos.map((r) => r.producto)])
).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

const TAM = 500;
let shaActual = sha;
let dbActual = { records: base, productos: productosFinales };
for (let i = 0; i < nuevos.length; i += TAM) {
  const lote = nuevos.slice(i, i + TAM);
  const primera = lote[0].fechaRemito.slice(0, 10);
  const ultima = lote[lote.length - 1].fechaRemito.slice(0, 10);
  const resultado = await writeDb(
    repo,
    token,
    branch,
    { records: [...lote, ...dbActual.records], productos: productosFinales },
    shaActual,
    `Importar entradas (${i + 1}-${i + lote.length} de ${nuevos.length}) ${primera}→${ultima}`
  );
  shaActual = resultado;
  dbActual = { records: [...lote, ...dbActual.records], productos: productosFinales };
  console.log(`  ✔ Lote ${i / TAM + 1}: ${lote.length} registros (${primera} → ${ultima})`);
}

console.log('\n✅ Importación completada.');
console.log(`Rama "${branch}" actualizada. Total registros en la rama: ${dbActual.records.length}`);
console.log(`Productos: ${productosFinales.length}`);
console.log('\nPara verlo en desarrollo: la app local lee esta rama. Producción (main) quedó intacta.');
