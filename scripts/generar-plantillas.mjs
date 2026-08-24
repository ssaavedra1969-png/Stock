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

const HEADERS = [
  'REMITOS',
  'OBSERVACION',
  'FECHA',
  'CODIGO DEL PRODUCTO',
  'DESCRIPCION',
  'CANTIDAD KG',
];

const COL_WIDTHS = [{ wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 14 }];

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
  const filas = esEntrada
    ? [
        [2680818, 'SPOSITO', celdaFecha(2026, 8, 3), 'AF', 'ARENA FINA', 32.5],
        [96962, 'MESSEL', celdaFecha(2026, 8, 4), 'P620', 'PIEDRA 6-20', 28.14],
        [15755, 'CPF AVELLANEDA', celdaFecha(2026, 8, 4), 'C', 'CPF 40 AVELLANEDA', 36],
        [20411, 'SPOSITO', celdaFecha(2026, 8, 5), 'MS 453', 'MIRA SET 453 (ADITIVO)', 21],
      ]
    : [
        [20301, 'PIGNANELLI', celdaFecha(2026, 8, 3), 'P620', 'PIEDRA 6-20', 37.38],
        [20302, 'OJEDA DIEGO', celdaFecha(2026, 8, 5), 'AF', 'ARENA FINA', 2.5],
        [20303, 'CONSTRUCTORA ANDINA SA', celdaFecha(2026, 8, 6), 'P1030', 'PIEDRA 10-30', 21.7],
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
    [`  - Cada fila se guarda como un movimiento de tipo ${tipo.toUpperCase()} de planta Lujan.`],
    ['  - El sistema ignora automáticamente las filas repetidas (ya cargadas).'],
    ['  - Si una fila tiene errores, el sistema te avisa antes de importar nada.'],
    [''],
    [`Ejemplo de carga real de ${tipo.toUpperCase()}S: ver hoja EJEMPLO (${contra} + remito + fecha + producto + cantidad).`],
  ];
  const ws = XLSX.utils.aoa_to_sheet(lineas);
  ws['!cols'] = [{ wch: 26 }, { wch: 60 }, { wch: 12 }];
  return ws;
}

function generar(tipo) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaCarga(), 'CARGA');
  XLSX.utils.book_append_sheet(wb, hojaEjemplo(tipo), 'EJEMPLO');
  XLSX.utils.book_append_sheet(wb, hojaAyuda(tipo), 'AYUDA');
  const nombre = `Plantilla-${tipo}s.xlsx`;
  const out = path.join(OUT_DIR, nombre);
  XLSX.writeFile(wb, out);
  return out;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const tipo of ['Entrada', 'Salida']) {
  console.log('✔', path.relative(ROOT, generar(tipo)));
}
console.log('\nListo. Descargables desde /plantillas/Plantilla-Entradas.xlsx y /plantillas/Plantilla-Salidas.xlsx');
