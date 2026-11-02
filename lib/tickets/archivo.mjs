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
import { normalizeRemito, parseNum } from './extract.mjs';

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

const IDX_NETO = HEADERS.indexOf('Neto');
const IDX_PESO_NETO = HEADERS.indexOf('Peso Neto');

// Convierte Neto/Peso Neto a numero (kilos) para que Excel los pueda sumar.
// Respeta el formato argentino ("35.520" = 35520) y deja intacto lo no numerico.
function numeroPeso(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const n = parseNum(valor);
  return n == null ? valor : n;
}

function normalizarPesosFila(fila) {
  if (!Array.isArray(fila)) return fila;
  const copia = [...fila];
  if (IDX_NETO >= 0 && copia.length > IDX_NETO) {
    copia[IDX_NETO] = numeroPeso(copia[IDX_NETO]);
  }
  if (IDX_PESO_NETO >= 0 && copia.length > IDX_PESO_NETO) {
    copia[IDX_PESO_NETO] = numeroPeso(copia[IDX_PESO_NETO]);
  }
  return copia;
}

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
  try {
    const buf = await (await fh.getFile()).arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    return { nombre: fh.name, rows };
  } catch (e) {
    throw errorArchivoOcupado(e, fh.name);
  }
}

export async function leerPlanillaDeCarpeta(handle) {
  const { salida, esStock } = await prepararCarpeta(handle);
  const { nombre, rows } = await leerPlanilla(salida);
  return { salidaHandle: salida, nombre, rows, esStock };
}

function claveHistorico(proveedor, remito) {
  const normalizarTexto = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  const numero = normalizeRemito(remito)?.toUpperCase() || normalizarTexto(remito);
  const empresa = normalizarTexto(proveedor);
  return empresa && numero ? `${empresa}|${numero}` : '';
}

export async function prepararIncorporacionHistorico(stockHandle, registros) {
  const info = await prepararCarpeta(stockHandle);
  if (!info.esStock || !info.subcarpetas.some((name) => name.toLowerCase() === 'salida')) {
    throw new Error('Elegí la carpeta STOCK que contiene Entrada, Salida y procesados.');
  }

  const fileHandle = await buscarPlanilla(info.salida);
  if (!fileHandle) {
    throw new Error('No se encontró Stock-Historico.xlsx en la carpeta Salida seleccionada.');
  }

  let workbook;
  let file;
  let rows;
  try {
    file = await fileHandle.getFile();
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (workbook.SheetNames.length !== 1) {
      throw new Error('El histórico tiene más de una hoja. No se modificó para preservar su estructura.');
    }
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
  } catch (error) {
    if (error.message?.includes('más de una hoja')) throw error;
    throw errorArchivoOcupado(error, fileHandle.name);
  }

  const headers = rows[0] || [];
  const normalizedHeaders = headers.map((header) =>
    String(header ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
  );
  const indexes = HEADERS.map((header) => normalizedHeaders.indexOf(header.toUpperCase()));
  if (indexes.some((index) => index < 0) || indexes.some((index, i) => index !== i)) {
    throw new Error(
      'El Excel seleccionado no tiene las 11 columnas esperadas en el orden correcto. No se modificó.'
    );
  }

  const existing = new Set(
    rows.slice(1).map((row) => claveHistorico(row[indexes[1]], row[indexes[2]])).filter(Boolean)
  );
  const seen = new Set(existing);
  const appendRows = [];
  let duplicados = 0;

  for (const record of registros) {
    if (record.Carga !== 'Entrada') {
      throw new Error('Solo se pueden agregar registros con Carga = Entrada.');
    }
    const key = claveHistorico(record.Proveedor, record['N Remito']);
    if (!key) throw new Error('Hay un registro sin Proveedor o N Remito.');
    if (seen.has(key)) {
      duplicados += 1;
      continue;
    }
    const missing = HEADERS.filter(
      (header) => String(record[header] ?? '').trim() === ''
    );
    if (missing.length) {
      throw new Error(`El remito ${record['N Remito']} tiene campos vacíos: ${missing.join(', ')}.`);
    }
    seen.add(key);
    appendRows.push(normalizarPesosFila(HEADERS.map((header) => record[header] ?? '')));
  }

  return {
    salida: info.salida,
    nombre: fileHandle.name,
    fileHandle,
    workbook,
    lastModified: file.lastModified,
    size: file.size,
    rows,
    appendRows,
    duplicados,
    claves: [...rows.slice(1), ...appendRows].map(
      (row) => `${row[indexes[1]] ?? ''}|${row[indexes[2]] ?? ''}`
    ),
  };
}

export async function guardarIncorporacionHistorico(preparacion) {
  const currentFile = await preparacion.fileHandle.getFile();
  if (
    currentFile.lastModified !== preparacion.lastModified ||
    currentFile.size !== preparacion.size
  ) {
    throw new Error(
      'El Excel cambió desde la previsualización. Volvé a elegir la carpeta STOCK y revisá los duplicados antes de guardar.'
    );
  }
  if (preparacion.appendRows.length === 0) {
    return {
      agregados: 0,
      duplicados: preparacion.duplicados,
      total: preparacion.rows.length - 1,
      nombre: preparacion.nombre,
      claves: preparacion.claves,
    };
  }

  const worksheet = preparacion.workbook.Sheets[preparacion.workbook.SheetNames[0]];
  XLSX.utils.sheet_add_aoa(worksheet, preparacion.appendRows, { origin: -1 });
  const output = XLSX.write(preparacion.workbook, { type: 'array', bookType: 'xlsx' });
  await escribirPlanilla(preparacion.salida, preparacion.nombre, output);
  return {
    agregados: preparacion.appendRows.length,
    duplicados: preparacion.duplicados,
    total: preparacion.rows.length - 1 + preparacion.appendRows.length,
    nombre: preparacion.nombre,
    claves: preparacion.claves,
  };
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

// Detecta el error tipico de Windows/Chrome cuando el archivo esta abierto
// en Excel ("An operation that depends on state cached in an interface object
// was made but the state had changed since it was read from disk.").
function errorArchivoOcupado(e, nombre) {
  const msg = String(e?.message || e || '');
  const ocupado =
    e?.name === 'InvalidStateError' ||
    e?.name === 'NoModificationAllowedError' ||
    /state cached|state had changed|locked|bloquead|en uso/i.test(msg);
  if (!ocupado) return e instanceof Error ? e : new Error(msg || 'No se pudo guardar la planilla.');
  const err = new Error(
    `No se pudo guardar "${nombre}" porque el archivo está abierto. Cerrá el Excel y volvé a intentar.`
  );
  err.code = 'ARCHIVO_OCUPADO';
  err.nombre = nombre;
  return err;
}

async function escribirPlanilla(salidaHandle, nombre, output) {
  let w = null;
  try {
    const fh = await salidaHandle.getFileHandle(nombre, { create: true });
    w = await fh.createWritable();
    await w.write(output);
    await w.close();
  } catch (e) {
    try {
      if (w) await w.abort();
    } catch {
      // el abort tambien puede fallar si el archivo esta bloqueado
    }
    throw errorArchivoOcupado(e, nombre);
  }
}

export async function guardarPlanilla(salidaHandle, nombre, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Historico');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await escribirPlanilla(salidaHandle, nombre, out);
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

  const histRows = rows && rows.length
    ? rows.map((fila, i) => (i === 0 ? fila : normalizarPesosFila(fila)))
    : [HEADERS];
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
    histRows.push(normalizarPesosFila(HEADERS.map((c) => r[c] ?? '')));
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

  return {
    agregados,
    duplicados,
    total: histRows.length - 1,
    movidos,
    errores,
    esStock,
    // Claves ya actualizadas: evita releer el Excel recien escrito (lo que en
    // Chrome dispara el error de "state cached ... changed since read from disk").
    claves: [...existentes],
  };
}
