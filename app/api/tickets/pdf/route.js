// ============================================================
// app/api/tickets/pdf/route.js
// GET /api/tickets/pdf?file=<nombre.pdf>
// Devuelve el PDF original (desde ENTRADA o procesados) para revisar
// por que un registro no trajo algun dato.
// ============================================================
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function paths() {
  return {
    entrada: process.env.TICKETS_ENTRADA || '\\\\Admin1\\compartida\\Administracion\\STOCK\\Entrada',
    procesados: process.env.TICKETS_PROCESADOS || '\\\\Admin1\\compartida\\Administracion\\STOCK\\procesados',
  };
}

export async function GET(request) {
  if (process.env.VERCEL) {
    return new Response(
      'La vista de PDFs sólo funciona en la PC del estudio (acceso a la carpeta de red).',
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const archivo = searchParams.get('file');
  if (!archivo) {
    return new Response('Falta el parámetro ?file', { status: 400 });
  }

  const safe = path.basename(String(archivo));
  if (!safe.toLowerCase().endsWith('.pdf')) {
    return new Response('El archivo debe ser un PDF.', { status: 400 });
  }

  const p = paths();
  for (const dir of [p.entrada, p.procesados]) {
    try {
      const buf = await fs.readFile(path.join(dir, safe));
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${encodeURIComponent(safe)}"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      // Probar la siguiente carpeta.
    }
  }

  return new Response('No se encontró el PDF.', { status: 404 });
}
