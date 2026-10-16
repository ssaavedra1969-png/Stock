// ============================================================
// app/api/tickets/commit/route.js
// POST /api/tickets/commit
// Cierra el ciclo de tickets: mueve los PDF de ENTRADA a
// PROCESADOS (renombrados con fecha del remito + empresa),
// escribe el Excel histórico en SALIDA y deja ENTRADA limpia.
//
// Body: { registros: [...] }
// Devuelve: { ok, movidos, excel }
// ============================================================
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const require = createRequire(import.meta.url);

function paths() {
  const salida = process.env.TICKETS_SALIDA || '\\\\Admin1\\compartida\\Administracion\\STOCK\\Salida';
  return {
    entrada: process.env.TICKETS_ENTRADA || '\\\\Admin1\\compartida\\Administracion\\STOCK\\Entrada',
    procesados: process.env.TICKETS_PROCESADOS || '\\\\Admin1\\compartida\\Administracion\\STOCK\\procesados',
    salida,
    historico: process.env.TICKETS_HISTORICO || path.join(salida, 'Stock-Historico.xlsx'),
  };
}

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

async function uniquePath(dir, stem, ext) {
  let candidate = path.join(dir, `${stem}${ext}`);
  let n = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem}_${n}${ext}`);
      n += 1;
    } catch {
      return candidate;
    }
  }
}

export async function POST(request) {
  if (process.env.VERCEL) {
    return Response.json(
      {
        error:
          'El archivado de tickets sólo funciona en la PC del estudio ' +
          '(necesita acceso a la carpeta de red), no en Vercel.',
      },
      { status: 501 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const registros = Array.isArray(body?.registros) ? body.registros : [];
  if (registros.length === 0) {
    return Response.json({ error: 'No hay registros.' }, { status: 400 });
  }

  const p = paths();
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  try {
    await fs.mkdir(p.procesados, { recursive: true });
    await fs.mkdir(p.salida, { recursive: true });
  } catch (err) {
    return Response.json({ error: `No se pudieron preparar las carpetas: ${err.message}` }, { status: 500 });
  }

  const movidos = [];
  const errores = [];

  for (const r of registros) {
    const archivo = r.Archivo || r.archivo;
    if (!archivo) continue;
    const nombreBackup = r['Archivo Backup'];
    const empresa = stripAccents(String(r.Proveedor || r.proveedor || 'TICKET').toUpperCase())
      .replace(/[^A-Z0-9]/g, '') || 'TICKET';
    const fechaNombre = fechaAISO(r.Fecha || r.fecha) || hoy;
    const ext = path.extname(String(nombreBackup || archivo)).toLowerCase() || '.pdf';
    const stem = `${fechaNombre}_${empresa}`;

    const src = path.join(p.entrada, path.basename(archivo));
    const dst = await uniquePath(p.procesados, stem, ext);

    try {
      await fs.access(src);
    } catch {
      // El archivo ya no está en ENTRADA: puede estar ya en procesados.
      continue;
    }

    try {
      await fs.rename(src, dst);
      movidos.push(path.basename(dst));
    } catch (err) {
      try {
        await fs.copyFile(src, dst);
        await fs.rm(src, { force: true });
        movidos.push(path.basename(dst));
      } catch (e2) {
        errores.push({ archivo, error: e2.message || err.message });
      }
    }
  }

  // Stock histórico: UN único Excel acumulativo en SALIDA con TODOS los
  // campos extraídos. Se usa también como base de conocimiento, así la
  // detección de remitos repetidos funciona contra todo el historial.
  const XLSX = require('xlsx');
  const HEADERS = ['Fecha', 'Proveedor', 'N Remito', 'Razon Social', 'Material', 'Neto', 'Peso Neto', 'Chofer', 'Pat. Chasis', 'Centro', 'Carga'];
  const histPath = p.historico;

  let histRows = [HEADERS];
  try {
    await fs.mkdir(path.dirname(histPath), { recursive: true });
    const prevBuf = await fs.readFile(histPath);
    const prevWb = XLSX.read(prevBuf, { type: 'buffer' });
    const prevWs = prevWb.Sheets[prevWb.SheetNames[0]];
    const prev = XLSX.utils.sheet_to_json(prevWs, { header: 1, blankrows: false });
    if (prev.length > 0) histRows = prev;
  } catch {
    // No existe todavía: se crea con los encabezados.
  }

  const existentes = new Set(
    histRows.slice(1).map((fila) => `${fila[1] ?? ''}|${fila[2] ?? ''}`)
  );
  let agregados = 0;
  for (const r of registros) {
    const k = `${r.Proveedor || ''}|${r['N Remito'] || ''}`;
    if (existentes.has(k)) continue;
    existentes.add(k);
    histRows.push(HEADERS.map((c) => r[c] ?? ''));
    agregados += 1;
  }

  const histWs = XLSX.utils.aoa_to_sheet(histRows);
  histWs['!cols'] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const histWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(histWb, histWs, 'Stock Historico');
  const histBuf = XLSX.write(histWb, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(histPath, histBuf);

  // Revienta el total de ENTRADA: solo quedan los archivos no procesados.
  let restantesEntrada = 0;
  try {
    const restantes = await fs.readdir(p.entrada);
    restantesEntrada = restantes.filter((f) => f.toLowerCase().endsWith('.pdf')).length;
  } catch {
    restantesEntrada = 0;
  }

  return Response.json({
    ok: true,
    movidos,
    excel: histPath,
    agregados,
    total: histRows.length - 1,
    errores,
    restantesEntrada,
  });
}
