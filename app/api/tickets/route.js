// ============================================================
// app/api/tickets/route.js
// POST /api/tickets  -> recibe uno o varios PDF de tickets de pesaje.
//
// Flujo:
//   1. Guarda cada PDF subido en LECTURA/ENTRADA.
//   2. Ejecuta el script Python (LECTURA/procesar_tickets.py) que hace
//      OCR, extrae los campos, valida duplicados/similares, escribe la
//      base de conocimiento y mueve los PDF a LECTURA/procesados.
//   3. Devuelve el resultado JSON al navegador para previsualizar y
//      generar el Excel.
//
// NOTA: requiere Python + Tesseract instalados en la maquina (corre
// local). No funciona en un entorno serverless como Vercel.
// ============================================================
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 50;
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB por archivo
const TIMEOUT = 1000 * 60 * 10;    // 10 minutos

function lecturasDir() {
  return process.env.LECTURA_DIR || path.join(process.cwd(), 'LECTURA');
}

function pythonBin() {
  return process.env.PYTHON_BIN || 'python';
}

// Nombre de archivo seguro (sin rutas ni caracteres raros).
function safeName(name) {
  const base = path.basename(String(name || 'ticket.pdf'));
  const clean = base.replace(/[^\w.\-() ]+/g, '_').trim() || 'ticket.pdf';
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

// Evita sobreescribir un archivo existente en la carpeta destino.
async function uniquePath(dir, name) {
  const stem = name.replace(/\.pdf$/i, '');
  let candidate = path.join(dir, name);
  let n = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem}_${n}.pdf`);
      n += 1;
    } catch {
      return candidate;
    }
  }
}

function runPython(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      pythonBin(),
      args,
      { cwd, timeout: TIMEOUT, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({ error, stdout: stdout || '', stderr: stderr || '' });
      }
    );
  });
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'No se pudo leer el formulario (multipart).' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  if (files.length === 0) {
    return Response.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json(
      { error: `Demasiados archivos (${files.length}). El máximo por carga es ${MAX_FILES}.` },
      { status: 413 }
    );
  }

  const base = lecturasDir();
  const entrada = path.join(base, 'ENTRADA');
  const script = path.join(base, 'procesar_tickets.py');

  try {
    await fs.mkdir(entrada, { recursive: true });
  } catch (err) {
    return Response.json({ error: `No se pudo preparar la carpeta ENTRADA: ${err.message}` }, { status: 500 });
  }

  try {
    await fs.access(script);
  } catch {
    return Response.json({ error: `No se encontró el script: ${script}` }, { status: 500 });
  }

  const guardados = [];
  for (const file of files) {
    if (typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.pdf')) {
      return Response.json({ error: `"${file.name || 'archivo'}" no es un PDF.` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: `"${file.name}" supera el máximo de ${MAX_SIZE / (1024 * 1024)} MB.` },
        { status: 413 }
      );
    }
    const dest = await uniquePath(entrada, safeName(file.name));
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buffer);
    guardados.push(dest);
  }

  // Archivo temporal para el JSON de salida del script.
  const outFile = path.join(os.tmpdir(), `falpat_tickets_${Date.now()}.json`);

  const args = [script, '--files', ...guardados, '--out', outFile, '--json'];
  const { error, stderr } = await runPython(args, base);

  if (error && error.code === 'ENOENT') {
    return Response.json(
      { error: `No se encontró Python ("${pythonBin()}"). Instalalo o configurá PYTHON_BIN.` },
      { status: 500 }
    );
  }

  let result;
  try {
    const raw = await fs.readFile(outFile, 'utf-8');
    result = JSON.parse(raw);
    await fs.rm(outFile, { force: true });
  } catch (e) {
    const detalle = (stderr || error?.message || '').slice(-600);
    return Response.json(
      { error: `El procesamiento falló. ${detalle || 'Sin detalle.'}` },
      { status: 500 }
    );
  }

  return Response.json(result);
}
