// ============================================================
// lib/tickets/archivo.mjs
// Todo lo que toca la carpeta del servidor (STOCK), desde el navegador.
// Estructura esperada (fija):
//   \\Admin1\compartida\Administracion\STOCK\
//       Entrada\      -> PDF nuevos
//       Salida\       -> Stock-Historico.xlsx
//       procesados\   -> PDF ya incorporados
// NUNCA crea carpetas: exige que la carpeta elegida sea STOCK y que
// ya contenga Entrada, Salida y procesados.
// ============================================================
import * as XLSX from 'xlsx';

export const HEADERS = [
  'Fecha',
  'Proveedor',
  'N Remito',
  'Razon Social',
  'Material',
  'Neto',
  'Peso Neto',
  'Chofer',
  'Pat. Chasis',
  'Centro',
  'Carga',
];

export function soportaCarpetas() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function elegirCarpetaServidor() {
  return window.showDirectoryPicker({ id: 'falpat-stock', mode: 'readwrite' });
}

// Busca una subcarpeta por nombre (sin distinguir mayúsculas) SIN crearla.
async function buscarSubcarpeta(parent, nombre) {
  const objetivo = nombre.toLowerCase();
  for await (const item of parent.values()) {
    if (item.kind === 'directory' && item.name.toLowerCase() === objetivo) return item;
  }
  return null;
}

// La carpeta elegida es "la carpeta del histórico". Igual, detectamos si
// además es la carpeta STOCK (contiene Entrada y procesados): en ese caso
// guardamos el Excel en su subcarpeta "Salida" y movemos los PDF.
export async function prepararCarpeta(handle) {
  const entrada = await buscarSubcarpeta(handle, 'Entrada');
  const procesados = await buscarSubcarpeta(handle, 'procesados');
  const salidaHija = await buscarSubcarpeta(handle, 'Salida');
  const esStock = !!entrada && !!procesados;
  const salida = esStock && salidaHija ? salidaHija : handle;
  const subcarpetas = [];
  for await (const item of handle.values()) {
    if (item.kind === 'directory') subcarpetas.push(item.name);
  }
  return {
    salida,
    entrada,
    procesados,
    esStock,
    subcarpetas,
    faltantes: {
      Entrada: !entrada,
      procesados: !procesados,
      Salida: !salidaHija,
    },
  };
}

// Si el usuario eligió una carpeta que contiene a STOCK (por ejemplo la
// carpeta del proyecto, que adentro tiene "LECTURA"), devuelve esa subcarpeta.
export async function buscarSubcarpetaStock(parent) {
  const candidatas = [];
  for await (const item of parent.values()) {
    if (item.kind !== 'directory') continue;
    const info = await prepararCarpeta(item);
    if (info.esStock) candidatas.push(item);
  }
  return candidatas.length === 1 ? candidatas[0] : null;
}

// Busca el Excel del historial dentro de Salida (sin crearlo).
async function buscarPlanilla(salida) {
  for await (const item of salida.values()) {
    if (item.kind === 'file' && /\.xlsx?$/i.test(item.name) && /stock.*hist[oó]ric/i.test(item.name)) {
      return item;
    }
  }
  return null;
}

async function leerPlanilla(salida) {
  const fh = await buscarPlanilla(salida);
  if (!fh) return { nombre: 'Stock-Historico.xlsx', rows: [] };
  const buf = await (await fh.getFile()).arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  return { nombre: fh.name, rows };
}

export async function leerPlanillaDeCarpeta(handle) {
  const { salida, esStock } = await prepararCarpeta(handle);
  const { nombre, rows } = await leerPlanilla(salida);
  return { salidaHandle: salida, nombre, rows, esStock };
}

export async function leerPdfDeEntrada(stockHandle) {
  const { entrada, esStock } = await prepararCarpeta(stockHandle);
  if (!esStock || !entrada) {
    throw new Error('La carpeta elegida no es STOCK (no contiene Entrada y procesados).');
  }

  const files = [];
  for await (const item of entrada.values()) {
    if (item.kind === 'file' && /\.pdf$/i.test(item.name)) {
      files.push(await item.getFile());
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export async function guardarPlanilla(salidaHandle, nombre, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Historico');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const fh = await salidaHandle.getFileHandle(nombre, { create: true });
  const w = await fh.createWritable();
  await w.write(out);
  await w.close();
}

export function clavesDeFilas(rows) {
  const set = new Set();
  for (const fila of rows.slice(1)) set.add(`${fila[1] ?? ''}|${fila[2] ?? ''}`);
  return set;
}

// ---- Nombre de los PDF procesados ---------------------------
function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fechaAISO(fechaRaw) {
  if (!fechaRaw) return null;
  const s = String(fechaRaw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}${dmy[2].padStart(2, '0')}${dmy[1].padStart(2, '0')}`;
  return null;
}

function nombreStem(registro) {
  const empresa =
    stripAccents(String(registro.Proveedor || registro.proveedor || 'TICKET').toUpperCase()).replace(/[^A-Z0-9]/g, '') ||
    'TICKET';
  const fecha = fechaAISO(registro.Fecha || registro.fecha) || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${fecha}_${empresa}`;
}

async function existeArchivo(dir, nombre) {
  try {
    await dir.getFileHandle(nombre);
    return true;
  } catch {
    return false;
  }
}

async function nombreUnico(dir, stem, ext) {
  let nombre = `${stem}${ext}`;
  let n = 1;
  while (await existeArchivo(dir, nombre)) {
    nombre = `${stem}_${n}${ext}`;
    n += 1;
  }
  return nombre;
}

async function moverPdf(entrada, procesados, registro) {
  const archivo = registro.Archivo || registro.archivo;
  if (!archivo) return null;
  const nombreBase = String(archivo).split(/[\\/]/).pop();
  const m = /\.[^.]+$/.exec(nombreBase);
  const ext = m ? m[0].toLowerCase() : '.pdf';

  let bytes;
  if (registro._file) {
    bytes = new Uint8Array(await registro._file.arrayBuffer());
  } else {
    const fh = await entrada.getFileHandle(nombreBase);
    bytes = new Uint8Array(await (await fh.getFile()).arrayBuffer());
  }

  const destino = await nombreUnico(procesados, nombreStem(registro), ext);
  const fhNuevo = await procesados.getFileHandle(destino, { create: true });
  const w = await fhNuevo.createWritable();
  await w.write(bytes);
  await w.close();

  try {
    await entrada.removeEntry(nombreBase);
  } catch {
    // no estaba en Entrada (o no se pudo borrar): el copiado a procesados ya quedó.
  }
  return destino;
}

// ---- Operación completa -------------------------------------
// Lee la planilla del historial, agrega los remitos nuevos, la guarda (en Salida)
// y mueve los PDF de Entrada a procesados. Todo desde la carpeta STOCK.
export async function incorporarEnCarpeta(stockHandle, registros) {
  const { entrada, salida, procesados, esStock } = await prepararCarpeta(stockHandle);
  if (!esStock) {
    throw new Error('La carpeta elegida no es STOCK (no contiene Entrada, Salida y procesados).');
  }
  const { nombre, rows } = await leerPlanilla(salida);

  const histRows = rows && rows.length ? [...rows] : [HEADERS];
  const existentes = new Set(histRows.slice(1).map((f) => `${f[1] ?? ''}|${f[2] ?? ''}`));

  let agregados = 0;
  let duplicados = 0;
  for (const r of registros) {
    const k = `${r.Proveedor || ''}|${r['N Remito'] || ''}`;
    if (existentes.has(k)) {
      duplicados += 1;
      continue;
    }
    existentes.add(k);
    histRows.push(HEADERS.map((c) => r[c] ?? ''));
    agregados += 1;
  }

  await guardarPlanilla(salida, nombre, histRows);

  const movidos = [];
  const errores = [];
  for (const r of registros) {
    try {
      const d = await moverPdf(entrada, procesados, r);
      if (d) movidos.push(d);
    } catch (e) {
      errores.push({ archivo: r.Archivo, error: String(e?.message || e) });
    }
  }

  return { agregados, duplicados, total: histRows.length - 1, movidos, errores, esStock };
}
