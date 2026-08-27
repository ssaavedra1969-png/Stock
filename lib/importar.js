// ============================================================
// lib/importar.js
// Parser del formato Excel de carga de movimientos:
//   REMITOS | OBSERVACION | FECHA | CODIGO DEL PRODUCTO |
//   DESCRIPCION | CANTIDAD KG
//
// Mismas reglas que scripts/import-entrada.mjs e import-salida.mjs:
//   - Entrada: OBSERVACION -> proveedor, REMITOS -> nroRemitoProveedor
//   - Salida:  OBSERVACION -> cliente,    REMITOS -> nroRemitoFalpat
//   - La unidad sale del catalogo segun el codigo (tn/kg/u/bolsas/...).
//
// Corre en el navegador: la lectura del archivo se hace con `xlsx`.
// ============================================================
import { unidadPorCodigo, cantidadConUnidad } from './productos.js';

export const COLUMNAS_EXCEL = [
  'REMITOS',
  'OBSERVACION',
  'FECHA',
  'CODIGO DEL PRODUCTO',
  'DESCRIPCION',
  'CANTIDAD KG',
];

// Columna opcional de Centro de Distribución (Campana / Lujan).
// No es obligatoria: si no está, el registro cae en "Lujan".
export const COLUMNA_CD = 'CENTRO DE DISTRIBUCION';

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

// Serial de Excel (dias desde el 1899-12-30) -> "YYYY-MM-DD" (UTC).
function serialAFecha(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

// Acepta Date, serial de Excel, "YYYY-MM-DD..." o "DD/MM/YYYY".
// Devuelve "YYYY-MM-DD" o null si no se puede interpretar.
export function fechaADia(fechaRaw) {
  if (fechaRaw == null || fechaRaw === '') return null;
  if (fechaRaw instanceof Date) {
    if (isNaN(fechaRaw.valueOf())) return null;
    // Los lectores devuelven la medianoche UTC del dia calendario
    // (misma convencion que scripts/import-*.mjs): usar componentes UTC
    // para no correr un dia atras en zonas horarias -03:00.
    return fechaRaw.toISOString().slice(0, 10);
  }
  if (typeof fechaRaw === 'number' && Number.isFinite(fechaRaw)) {
    return serialAFecha(fechaRaw);
  }
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

// Lee un File del navegador y devuelve filas planas (array de arrays).
export async function leerFilasExcel(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  // La hoja de carga se busca por nombre ("CARGA"), con fallback a la
  // primera hoja por si el Excel viene con otra estructura.
  const hoja = wb.Sheets['CARGA'] || wb.Sheets[wb.SheetNames[0]];
  const ws = hoja;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

// Valida la fila de encabezados y devuelve el mapa de columnas.
// Lanza Error con mensaje claro si falta alguna.
export function mapearColumnas(rowsFlat) {
  if (!Array.isArray(rowsFlat) || rowsFlat.length === 0) {
    throw new Error('El archivo no tiene datos.');
  }
  const headerRow = (rowsFlat[0] || []).map((h) => texto(h).toUpperCase());
  const cols = {};
  for (const name of COLUMNAS_EXCEL) {
    const idx = headerRow.indexOf(name);
    if (idx === -1) {
      throw new Error(`Falta la columna "${name}" en la fila de encabezados. Revisá la plantilla.`);
    }
    cols[name] = idx;
  }
  return cols;
}

// Parsea las filas del Excel segun el tipo de carga ("Entrada"|"Salida").
// Devuelve { records, descartadas }.
// Los records NO traen id ni createdAt: los agrega el servidor.
export function parsearFilas(rowsFlat, carga) {
  const esEntrada = carga === 'Entrada';
  const cols = mapearColumnas(rowsFlat);

  // Columna opcional de Centro de Distribución: se busca por nombre.
  const headerRow = (rowsFlat[0] || []).map((h) => texto(h).toUpperCase());
  const cdIndex = headerRow.indexOf(COLUMNA_CD);

  const records = [];
  const descartadas = [];

  for (let i = 1; i < rowsFlat.length; i++) {
    const r = rowsFlat[i];
    if (!Array.isArray(r)) continue;

    const remito = texto(r[cols['REMITOS']]);
    const contraparte = texto(r[cols['OBSERVACION']]);
    const fechaRaw = r[cols['FECHA']];
    const codigo = texto(r[cols['CODIGO DEL PRODUCTO']]).toUpperCase();
    const descripcion = texto(r[cols['DESCRIPCION']]);
    const cantidad = numero(r[cols['CANTIDAD KG']]);
    const cdRaw = cdIndex !== -1 ? texto(r[cdIndex]) : '';
    const fila = i + 1;

    if (!remito && fechaRaw == null && !descripcion && !contraparte && !cdRaw) continue; // vacía

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
    const record = {
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
    };
    records.push(record);
  }

  return { records, descartadas };
}

// Clave anti-duplicados; IDENTICA a la de los scripts de importacion
// para que coincidan los criterios.
export function claveDedupe(rec) {
  return rec.carga === 'Entrada'
    ? `${rec.fechaRemito}|${rec.producto}|${rec.nroRemitoProveedor}|${rec.pesoBalanza}|${rec.proveedor}`
    : `${rec.fechaRemito}|${rec.producto}|${rec.nroRemitoFalpat}|${rec.pesoBalanza}|${rec.cliente}`;
}

// Separa registros nuevos vs ya cargados contra una lista existente.
export function separarNuevos(records, existentes) {
  const set = new Set((existentes || []).map(claveDedupe));
  const nuevos = [];
  const duplicados = [];
  for (const rec of records) {
    const k = claveDedupe(rec);
    if (set.has(k)) duplicados.push(rec);
    else {
      set.add(k);
      nuevos.push(rec);
    }
  }
  return { nuevos, duplicados };
}

// Resumen por producto: [{ codigo, producto, unidad, cantidad, tn }]
export function resumenPorProducto(records) {
  const map = new Map();
  for (const r of records) {
    const [numStr, unidad = 'tn'] = String(r.pesoBalanza || '').split(' ');
    const num = parseFloat(String(numStr).replace(',', '.')) || 0;
    const key = `${r.codigoProducto}§${r.producto}§${unidad}`;
    if (!map.has(key)) {
      map.set(key, { codigo: r.codigoProducto || '—', producto: r.producto, unidad, cantidad: 0, tn: 0 });
    }
    const it = map.get(key);
    it.cantidad += num;
    if (unidad === 'tn') it.tn += num;
  }
  return [...map.values()].sort((a, b) => b.tn - a.tn || a.producto.localeCompare(b.producto));
}
