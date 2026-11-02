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
import { parseNum } from './extract.mjs';

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

// La carpeta elegida debe ser STOCK y contener Entrada, Salida y procesados.
export async function prepararCarpeta(handle) {
  const entrada = await buscarSubcarpeta(handle, 'Entrada');
  const procesados = await buscarSubcarpeta(handle, 'procesados');
  const salidaHija = await buscarSubcarpeta(handle, 'Salida');
  const esStock = !!entrada && !!procesados && !!salidaHija;
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

export async function guardarPlanilla(salidaHandle, nombre, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Historico');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  let w = null;
  try {
    const fh = await salidaHandle.getFileHandle(nombre, { create: true });
    w = await fh.createWritable();
    await w.write(out);
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

async function buscarCopiaArchivada(procesados, stem, ext, bytes) {
  for await (const item of procesados.values()) {
    if (item.kind !== 'file' || !item.name.startsWith(stem) || !item.name.toLowerCase().endsWith(ext)) {
      continue;
    }
    const archived = new Uint8Array(await (await item.getFile()).arrayBuffer());
    if (archived.length === bytes.length && archived.every((value, index) => value === bytes[index])) {
      return item.name;
    }
  }
  return null;
}

async function moverPdf(entrada, procesados, registro) {
  const archivo = registro.Archivo || registro.archivo;
  if (!archivo) return null;
  const nombreBase = String(archivo).split(/[\\/]/).pop();
  const m = /\.[^.]+$/.exec(nombreBase);
  const ext = m ? m[0].toLowerCase() : '.pdf';

  let archivoEntrada = null;
  try {
    archivoEntrada = await entrada.getFileHandle(nombreBase);
  } catch {
    // Puede faltar si el intento anterior ya movió este archivo.
  }
  const archivoSeleccionado = registro._file
    ? new Uint8Array(await registro._file.arrayBuffer())
    : null;
  const bytesEntrada = archivoEntrada
    ? new Uint8Array(await (await archivoEntrada.getFile()).arrayBuffer())
    : null;
  if (archivoSeleccionado && bytesEntrada &&
      (archivoSeleccionado.length !== bytesEntrada.length ||
       !archivoSeleccionado.every((value, index) => value === bytesEntrada[index]))) {
    throw new Error(`El archivo "${nombreBase}" en Entrada cambió desde que fue leído.`);
  }
  const bytes = bytesEntrada || archivoSeleccionado;
  if (!bytes) {
    throw new Error(`No se encontró "${nombreBase}" en Entrada ni se pudo verificar en procesados.`);
  }

  const stem = nombreStem(registro);
  const copiaExistente = await buscarCopiaArchivada(procesados, stem, ext, bytes);
  if (copiaExistente) {
    if (archivoEntrada) {
      try {
        await entrada.removeEntry(nombreBase);
      } catch (error) {
        throw new Error(
          `El PDF ya está archivado como "${copiaExistente}", pero no se pudo quitar de Entrada: ${error.message}`
        );
      }
    }
    return copiaExistente;
  }
  if (!archivoEntrada) {
    throw new Error(`No se encontró "${nombreBase}" en Entrada y no hay una copia idéntica en procesados.`);
  }

  const destino = await nombreUnico(procesados, stem, ext);
  const fhNuevo = await procesados.getFileHandle(destino, { create: true });
  const w = await fhNuevo.createWritable();
  await w.write(bytes);
  await w.close();

  try {
    await entrada.removeEntry(nombreBase);
  } catch (error) {
    throw new Error(
      `El PDF se copió a procesados como "${destino}", pero no se pudo quitar de Entrada: ${error.message}`
    );
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
