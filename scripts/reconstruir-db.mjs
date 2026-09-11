// ============================================================
// scripts/reconstruir-db.mjs
// Reconstruye data/db.json DESDE CERO a partir de las plantillas
// completas de entradas y salidas (formato CARGA de "Plantilla-_05").
//
// Uso:
//   node scripts/reconstruir-db.mjs
//
// Lee:
//   entrada/plantillas/Plantilla-Entradas_05.xlsx  -> carga "Entrada"
//   entrada/plantillas/Plantilla-Salidas_05.xlsx   -> carga "Salida"
//
// Escribe (local, para commitear como siempre):
//   data/db.json  (reemplaza TODO)
//
// Mapeo idéntico a lib/importar.js:
//   Entrada: OBSERVACION -> proveedor,  REMITOS -> nroRemitoProveedor
//   Salida:  OBSERVACION -> cliente,    REMITOS -> nroRemitoFalpat
//   CENTRO DE DISTRIBUCION -> planta (default "Lujan")
//   Unidad según catálogo (tn/kg/u/bolsas/tambores)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { unidadPorCodigo, cantidadConUnidad } from '../lib/productos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENT = path.join(ROOT, 'entrada/plantillas/Plantilla-Entradas_05.xlsx');
const SAL = path.join(ROOT, 'entrada/plantillas/Plantilla-Salidas_05.xlsx');
const DB_OUT = path.join(ROOT, 'data/db.json');

const COLUMNAS = ['REMITOS', 'OBSERVACION', 'FECHA', 'CODIGO DEL PRODUCTO', 'DESCRIPCION', 'CANTIDAD KG'];
const COLUMNA_CD = 'CENTRO DE DISTRIBUCION';

function texto(v) {
  return String(v ?? '').trim();
}

function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function serialAFecha(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function fechaADia(fechaRaw) {
  if (fechaRaw == null || fechaRaw === '') return null;
  if (fechaRaw instanceof Date) {
    if (isNaN(fechaRaw.valueOf())) return null;
    return fechaRaw.toISOString().slice(0, 10);
  }
  if (typeof fechaRaw === 'number' && Number.isFinite(fechaRaw)) return serialAFecha(fechaRaw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(fechaRaw));
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto(fechaRaw));
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${m}-${d}`;
  }
  if (/^\d+(\.\d+)?$/.test(texto(fechaRaw))) return serialAFecha(Number(texto(fechaRaw)));
  return null;
}

function idNuevo() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function leerFilas(file) {
  if (!fs.existsSync(file)) throw new Error(`No existe el archivo: ${file}`);
  const rows = await readXlsxFile(file, { sheet: 'CARGA' });
  return Array.isArray(rows) && Array.isArray(rows[0]) && !rows[0].sheet
    ? rows
    : rows[0]?.data || rows;
}

function mapearColumnas(rowsFlat) {
  const header = (rowsFlat[0] || []).map((h) => texto(h).toUpperCase());
  const cols = {};
  for (const name of COLUMNAS) {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Falta la columna "${name}" en la fila de encabezados.`);
    cols[name] = idx;
  }
  cols[COLUMNA_CD] = header.indexOf(COLUMNA_CD);
  return cols;
}

async function parsear(file, carga) {
  const filas = await leerFilas(file);
  const cols = mapearColumnas(filas);
  const esEntrada = carga === 'Entrada';
  const records = [];
  const descartadas = [];

  for (let i = 1; i < filas.length; i++) {
    const r = filas[i];
    if (!Array.isArray(r)) continue;

    const remito = texto(r[cols['REMITOS']]);
    const contraparte = texto(r[cols['OBSERVACION']]);
    const fechaRaw = r[cols['FECHA']];
    const codigo = texto(r[cols['CODIGO DEL PRODUCTO']]).toUpperCase();
    const descripcion = texto(r[cols['DESCRIPCION']]);
    const cantidad = numero(r[cols['CANTIDAD KG']]);
    const cdRaw = cols[COLUMNA_CD] !== -1 ? texto(r[cols[COLUMNA_CD]]) : '';
    const fila = i + 1;

    if (!remito && fechaRaw == null && !descripcion && !contraparte && !cdRaw) continue;

    if (!descripcion) {
      descartadas.push(`fila ${fila}: falta DESCRIPCION`);
      continue;
    }
    const dia = fechaADia(fechaRaw);
    if (!dia) {
      descartadas.push(`fila ${fila}: FECHA no reconocida (${JSON.stringify(fechaRaw)})`);
      continue;
    }
    if (!Number.isFinite(cantidad)) {
      descartadas.push(`fila ${fila}: CANTIDAD KG inválida (${JSON.stringify(r[cols['CANTIDAD KG']])})`);
      continue;
    }

    const unidad = unidadPorCodigo(codigo);
    records.push({
      id: idNuevo(),
      carga,
      producto: descripcion,
      codigoProducto: codigo,
      fechaRemito: `${dia}T12:00:00.000Z`,
      patente: '',
      chofer: '',
      nroRemitoProveedor: esEntrada ? remito : '',
      nroRemitoFalpat: esEntrada ? '' : remito,
      pesoProveedor: '',
      pesoBalanza: cantidadConUnidad(cantidad, unidad),
      planta: cdRaw || 'Lujan',
      proveedor: esEntrada ? contraparte : '',
      cliente: esEntrada ? '' : contraparte,
      createdAt: new Date().toISOString(),
    });
  }

  return { records, descartadas, filas: filas.length - 1 };
}

console.log('Leyendo Plantilla-Entradas_05.xlsx …');
const entradas = await parsear(ENT, 'Entrada');
console.log('Leyendo Plantilla-Salidas_05.xlsx …');
const salidas = await parsear(SAL, 'Salida');

console.log('\n— Entradas —');
console.log(`  filas leídas: ${entradas.filas} | registros OK: ${entradas.records.length} | descartadas: ${entradas.descartadas.length}`);
for (const d of entradas.descartadas.slice(0, 10)) console.log('  ⚠ ' + d);
console.log('— Salidas —');
console.log(`  filas leídas: ${salidas.filas} | registros OK: ${salidas.records.length} | descartadas: ${salidas.descartadas.length}`);
for (const d of salidas.descartadas.slice(0, 10)) console.log('  ⚠ ' + d);

const records = [...entradas.records, ...salidas.records];
if (records.length === 0) throw new Error('No se generó ningún registro.');

const productos = Array.from(new Set(records.map((r) => r.producto))).sort((a, b) =>
  a.localeCompare(b, 'es', { sensitivity: 'base' })
);

const totalTn = records.reduce((acc, r) => {
  const m = /^([\d.,]+)\s*tn/.exec(String(r.pesoBalanza || ''));
  return acc + (m ? parseFloat(m[1].replace(',', '.')) || 0 : 0);
}, 0);

console.log(`\nTOTAL a escribir: ${records.length} registros (${entradas.records.length} E + ${salidas.records.length} S)`);
console.log(`Productos: ${productos.length}`);
console.log(`Suma toneladas (pesoBalanza tn): ${totalTn.toFixed(2)} tn`);
console.log(`Destino: ${DB_OUT}`);

const db = { records, productos };
fs.writeFileSync(DB_OUT, JSON.stringify(db, null, 2) + '\n', 'utf-8');
console.log('\n✅ data/db.json reconstruido.');