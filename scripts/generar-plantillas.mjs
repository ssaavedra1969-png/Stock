// ============================================================
// scripts/generar-plantillas.mjs
// Genera los Excel modelo para cargar Entradas y Salidas, con el
// mismo formato que consumen el importador web (/incorporar) y los
// scripts de importación.
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
import * as XLSX from 'xlsx';
import { CATALOGO_PRODUCTOS } from '../lib/productos.js';

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

const COL_WIDTHS = [
  { wch: 12 },
  { wch: 24 },
  { wch: 14 },
  { wch: 20 },
  { wch: 34 },
  { wch: 14 },
  { wch: 22 },
];

// Serial de Excel (dias desde 1899-12-30) para una fecha calendario.
// Se guarda como numero entero con formato dd/mm/yyyy, igual que hacen
// los Excel originales: evita el corrimiento de zona horaria que
// introduce SheetJS al convertir objetos Date.
function serialExcel(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

function celdaFecha(y, m, d) {
  return { t: 'n', v: serialExcel(y, m, d), z: 'dd/mm/yyyy' };
}

function hojaCarga() {
  return XLSX.utils.aoa_to_sheet([HEADERS]);
}

function hojaEjemplo(tipo) {
  const esEntrada = tipo === 'Entrada';
  // En Entradas OBSERVACION = proveedor y REMITOS = remito del proveedor.
  // En Salidas OBSERVACION = cliente y REMITOS = remito de FALPAT.
  // CENTRO DE DISTRIBUCION = Campana | Lujan.
  const filas = esEntrada
    ? [
        [105203, 'SPOSITO', celdaFecha(2026, 8, 18), 'AF', 'ARENA FINA', 35.22, 'Lujan'],
        [110998, 'LCE', celdaFecha(2026, 8, 18), 'P06', 'PIEDRA 0-6', 35.06, 'Lujan'],
        [163070, 'CA', celdaFecha(2026, 8, 18), 'P620', 'PIEDRA 6-20', 35.34, 'Lujan'],
      ]
    : [
        ['', 'ALVARO', celdaFecha(2026, 6, 2), 'P06', 'PIEDRA 0-6', 536.24, 'Lujan'],
        [19771, 'ALMAJO IBICUY', celdaFecha(2026, 6, 1), 'E100', 'ESTABILIZADO 0-100 X TN', 33.18, 'Lujan'],
        ['', 'ALVARO', celdaFecha(2026, 6, 1), 'AF', 'ARENA FINA', 818.44, 'Lujan'],
      ];
  const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
  filas.forEach((fila, i) => {
    fila.forEach((celda, j) => {
      const addr = XLSX.utils.encode_cell({ r: i + 1, c: j });
      if (celda && typeof celda === 'object' && celda.t) {
        ws[addr] = celda;
      } else {
        ws[addr] = { v: celda, t: typeof celda === 'number' ? 'n' : 's' };
      }
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: filas.length, c: HEADERS.length - 1 },
  });
  ws['!cols'] = COL_WIDTHS;
  return ws;
}

function hojaAyuda(tipo) {
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
    ['  CODIGO DEL PRODUCTO  ', 'Código del catálogo (ver tabla abajo). Va en mayúsculas.'],
    ['  DESCRIPCION          ', 'Nombre del producto (debe coincidir con el código).'],
    ['  CANTIDAD KG          ', `Número sin texto ni "tn". ${esEntrada ? '' : ''}Ver unidades por producto más abajo.`],
    ['  CENTRO DE DISTRIBUCION', 'Centro de distribución del movimiento. SOLO: Campana o Lujan. Dejalo vacío si es Lujan.'],
    [''],
    ['UNIDADES POR PRODUCTO (qué número va en CANTIDAD KG):'],
    ...CATALOGO_PRODUCTOS.filter((p) => p.codigo).map((p) => [
      `  ${p.codigo.padEnd(8)}`,
      `${p.nombre.padEnd(45)}`,
      p.unidad,
    ]),
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
  const ws = XLSX.utils.aoa_to_sheet(lineas);
  ws['!cols'] = [{ wch: 26 }, { wch: 60 }, { wch: 12 }];
  return ws;
}

function generar(tipo, outDir) {
  const wb = XLSX.utils.book_new();
  // La hoja EJEMPLO queda primero: es la que se ve al abrir, con los
  // ejemplos de carga. CARGA es la que el usuario llena.
  XLSX.utils.book_append_sheet(wb, hojaEjemplo(tipo), 'EJEMPLO');
  XLSX.utils.book_append_sheet(wb, hojaCarga(), 'CARGA');
  XLSX.utils.book_append_sheet(wb, hojaAyuda(tipo), 'AYUDA');
  const nombre = `Plantilla-${tipo}s.xlsx`;
  const out = path.join(outDir, nombre);
  XLSX.writeFile(wb, out);
  return path.relative(ROOT, out);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR_ENTRADA, { recursive: true });
for (const tipo of ['Entrada', 'Salida']) {
  console.log('✔', generar(tipo, OUT_DIR));
  console.log('✔', generar(tipo, OUT_DIR_ENTRADA));
}
console.log('\nListo. Descargables desde /plantillas/Plantilla-Entradas.xlsx y /plantillas/Plantilla-Salidas.xlsx');
console.log('Copias locales en entrada/plantillas/');
