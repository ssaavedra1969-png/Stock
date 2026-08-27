// ============================================================
// scripts/generar-plantillas.mjs
// Genera los Excel modelo para cargar Entradas y Salidas, con el
// mismo formato que consumen el importador web (/incorporar) y los
// scripts de importación.
//
// Usa ExcelJS (soporta desplegables y fórmulas).
//
// Salida:
//   public/plantillas/Plantilla-Entradas.xlsx
//   public/plantillas/Plantilla-Salidas.xlsx
//
// Uso:  node scripts/generar-plantillas.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CATALOGO_PRODUCTOS } from '../lib/productos.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'plantillas');
const OUT_DIR_ENTRADA = path.join(ROOT, 'entrada', 'plantillas');

const HEADERS = [
  'REMITOS',
  'OBSERVACION',
  'FECHA',
  'CODIGO DEL PRODUCTO',
  'DESCRIPCION',
  'CANTIDAD KG',
  'CENTRO DE DISTRIBUCION',
];

const COL_WIDTHS = [12, 24, 14, 20, 34, 14, 22];

// Catálogo solo con productos que tienen código (los que se eligen).
const CATALOGO_CON_CODIGO = CATALOGO_PRODUCTOS.filter((p) => p.codigo);

// Serial de Excel (dias desde 1899-12-30) para una fecha calendario.
function serialExcel(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Configura las columnas verticales de TABLA (con encabezado y ancho)
// para una hoja CARGA/EJEMPLO.
function configurarCeldasHoja(ws, conDim) {
  ws.columns = HEADERS.map((h, i) => ({
    header: h,
    key: String(i),
    width: COL_WIDTHS[i],
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).height = 28;
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  if (conDim) {
    ws.getCell('D1').dataValidation = null;
  }
}

// Aplica el desplegable de códigos (D) y la fórmula de autocompletado
// de DESCRIPCION (E) a las filas de datos 2..ultimaFila.
function aplicarAutocompletado(ws, ultimaFila) {
  const n = CATALOGO_CON_CODIGO.length;
  const rangoCod = `'CATALOGO'!$A$2:$A$${n + 1}`;
  const rangoDesc = `'CATALOGO'!$A$2:$B$${n + 1}`;
  for (let r = 2; r <= ultimaFila; r++) {
    const d = ws.getCell(`D${r}`);
    d.dataValidation = {
      type: 'list',
      formulae: [rangoCod],
      allowBlank: true,
      showErrorMessage: true,
    };
    const e = ws.getCell(`E${r}`);
    e.value = { formula: `IFERROR(VLOOKUP($D${r},${rangoDesc},2,FALSE),"")`, result: '' };
  }
}

// Desplegable de Centro de Distribución en la columna G.
function aplicarCD(ws, ultimaFila) {
  for (let r = 2; r <= ultimaFila; r++) {
    ws.getCell(`G${r}`).dataValidation = {
      type: 'list',
      formulae: ['"Campana,Lujan"'],
      allowBlank: true,
      showErrorMessage: true,
    };
  }
}

// Hoja EJEMPLO: muestra filas de referencia (primera hoja, visible).
function hojaEjemplo(wb, tipo) {
  const esEntrada = tipo === 'Entrada';
  const filas = esEntrada
    ? [
        [105203, 'SPOSITO', '2026-08-18', 'AF', 'ARENA FINA', 35.22, 'Lujan'],
        [110998, 'LCE', '2026-08-18', 'P06', 'PIEDRA 0-6', 35.06, 'Lujan'],
        [163070, 'CA', '2026-08-18', 'P620', 'PIEDRA 6-20', 35.34, 'Lujan'],
      ]
    : [
        ['', 'ALVARO', '2026-06-02', 'P06', 'PIEDRA 0-6', 536.24, 'Lujan'],
        [19771, 'ALMAJO IBICUY', '2026-06-01', 'E100', 'ESTABILIZADO 0-100 X TN', 33.18, 'Lujan'],
        ['', 'ALVARO', '2026-06-01', 'AF', 'ARENA FINA', 818.44, 'Lujan'],
      ];
  const ws = wb.addWorksheet('EJEMPLO');
  configurarCeldasHoja(ws, false);
  filas.forEach((fila) => {
    const f = [...fila];
    const [yy, mm, dd] = f[2].split('-').map(Number);
    ws.addRow([f[0], f[1], null, f[3], f[4], f[5], f[6]]);
    const numFila = ws.rowCount;
    const celda = ws.getCell(`C${numFila}`);
    celda.value = serialExcel(yy, mm, dd);
    celda.numFmt = 'dd/mm/yyyy';
  });
  aplicarAutocompletado(ws, ws.rowCount);
  aplicarCD(ws, ws.rowCount);
  return ws;
}

// Hoja CARGA: el usuario llena las filas.
function hojaCarga(wb) {
  const ws = wb.addWorksheet('CARGA');
  configurarCeldasHoja(ws, false);
  // Filas de sobra para cargar (100 en total con encabezado).
  aplicarAutocompletado(ws, 100);
  aplicarCD(ws, 100);
  return ws;
}

// Hoja auxiliar oculta con el catálogo producto.
function hojaCatalogo(wb) {
  const ws = wb.addWorksheet('CATALOGO');
  ws.state = 'hidden';
  ws.addRow(['CODIGO', 'DESCRIPCION', 'UNIDAD']);
  ws.getRow(1).font = { bold: true };
  CATALOGO_CON_CODIGO.forEach((p) => ws.addRow([p.codigo, p.nombre, p.unidad]));
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 12;
  return ws;
}

function hojaAyuda(wb, tipo) {
  const esEntrada = tipo === 'Entrada';
  const contra = esEntrada ? 'PROVEEDOR' : 'CLIENTE';
  const remitoDe = esEntrada ? 'el proveedor' : 'FALPAT';
  const lineas = [
    [`PLANTILLA DE CARGA — ${tipo.toUpperCase()}S · GRUPO FALPAT SRL`],
    [''],
    ['Cómo cargar: completá UNA fila por movimiento en la hoja CARGA'],
    ['(esta hoja AYUDA y la hoja EJEMPLO son solo referencia, el sistema no las lee).'],
    [''],
    ['COLUMNAS (los nombres de la fila 1 deben quedar exactamente así):'],
    ['  REMITOS              ', `Número de remito de ${remitoDe}. Solo números o texto, sin puntos.`],
    ['  OBSERVACION          ', esEntrada ? 'Nombre del PROVEEDOR.' : 'Nombre del CLIENTE.'],
    ['  FECHA                ', 'Fecha del remito (dd/mm/aaaa). Es lo único con formato de fecha.'],
    ['  CODIGO DEL PRODUCTO  ', 'Código del catálogo. TIENE DESPLEGABLE: al hacer clic elegís el producto.'],
    ['  DESCRIPCION          ', 'Se completa SOLO al elegir el código. No hace falta escribirlo.'],
    ['  CANTIDAD KG          ', 'Número sin texto ni unidades. Ver unidades por producto más abajo.'],
    ['  CENTRO DE DISTRIBUCION', 'Desplegable con Campana o Lujan. Dejalo vacío si es Lujan.'],
    [''],
    ['LO MÁS IMPORTANTE:'],
    ['  - En CODIGO DEL PRODUCTO hay un DESPLEGABLE con todos los productos.'],
    ['  - Al elegir el código, la DESCRIPCION se completa automáticamente.'],
    [''],
    ['CATÁLOGO DE PRODUCTOS (código / descripción / unidad):'],
    ...CATALOGO_CON_CODIGO.map((p) => [`  ${p.codigo.padEnd(8)}`, `${p.nombre.padEnd(45)}`, p.unidad]),
    [''],
    ['REGLAS IMPORTANTES:'],
    ['  - No borrar ni renombrar las columnas; no dejar filas vacías entre datos.'],
    ['  - CENTRO DE DISTRIBUCION acepta solo "Campana" o "Lujan" (si se deja vacío se carga Lujan).'],
    [`  - Cada fila se guarda como un movimiento de tipo ${tipo.toUpperCase()}.`],
    ['  - El sistema ignora automáticamente las filas repetidas (ya cargadas).'],
    ['  - Si una fila tiene errores, el sistema te avisa antes de importar nada.'],
    [''],
    [`Ejemplo de carga real de ${tipo.toUpperCase()}S: ver hoja EJEMPLO (${contra} + remito + fecha + producto + cantidad).`],
  ];
  const ws = wb.addWorksheet('AYUDA');
  lineas.forEach((l) => ws.addRow(l));
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 64;
  ws.getColumn(3).width = 12;
  return ws;
}

async function generar(tipo, outDir) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GRUPO FALPAT SRL';
  hojaEjemplo(wb, tipo);
  hojaCarga(wb);
  hojaAyuda(wb, tipo);
  hojaCatalogo(wb);
  const nombre = `Plantilla-${tipo}s.xlsx`;
  const out = path.join(outDir, nombre);
  await wb.xlsx.writeFile(out);
  return path.relative(ROOT, out);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR_ENTRADA, { recursive: true });

const tareas = [];
for (const tipo of ['Entrada', 'Salida']) {
  tareas.push(generar(tipo, OUT_DIR).then((r) => console.log('✔', r)));
  tareas.push(
    generar(tipo, OUT_DIR_ENTRADA).catch((e) =>
      console.error('✖ entrada/plantillas:', e.code === 'EBUSY' ? 'archivo abierto en Excel, cerrar y reintentar' : e.message)
    )
  );
}
Promise.allSettled(tareas).then(() => {
  console.log('\nListo. Descargables desde /plantillas/Plantilla-Entradas.xlsx y /plantillas/Plantilla-Salidas.xlsx');
  console.log('Copias locales en entrada/plantillas/');
});
