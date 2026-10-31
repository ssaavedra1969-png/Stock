// ============================================================
// app/api/base/route.js
// GET  /api/base  -> base de conocimiento de tickets (data/base.json)
// POST /api/base  -> aprende de los tickets incorporados y la actualiza
//
// La base guarda correlaciones verificadas para resolver lecturas
// dudosas de OCR en futuras tandas:
//   patentes:   apellido del chofer -> patentes reales
//   choferes:   apellido -> nombre completo
//   netos:      "EMPRESA|NRemito" -> neto verificado
//   patentesPorTicket: "EMPRESA|NRemito" -> patente verificada
//   correccionesPorTicket/Archivo: campos confirmados del documento exacto
//   reglasLectura: OCR textual confirmado -> valor corregido por proveedor/campo
// ============================================================
import { readJson, writeJson } from '@/lib/github';
import { aprenderDeCorrecciones, aprenderDeFilas, unirBase } from '@/lib/tickets/extract.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = 'data/base.json';

export async function GET() {
  try {
    const { db } = await readJson(PATH);
    return Response.json({ base: db || unirBase() });
  } catch (err) {
    return Response.json(
      { error: err.message || 'No se pudo leer la base de conocimiento.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const filas = Array.isArray(body?.filas) ? body.filas : [];
  const correcciones = body?.correcciones;
  const materiales = body?.materiales;
  const razonesSociales = body?.razonesSociales;
  const hayCatalogo = Array.isArray(materiales) || Array.isArray(razonesSociales);
  if (!Array.isArray(body?.filas) && !hayCatalogo) {
    return Response.json(
      { error: 'Faltan los datos a guardar ("filas", "materiales" o "razonesSociales").' },
      { status: 400 }
    );
  }
  if (correcciones !== undefined && !Array.isArray(correcciones)) {
    return Response.json({ error: 'El campo "correcciones" debe ser una lista.' }, { status: 400 });
  }
  if (materiales !== undefined && !Array.isArray(materiales)) {
    return Response.json({ error: 'El campo "materiales" debe ser una lista.' }, { status: 400 });
  }
  if (razonesSociales !== undefined && !Array.isArray(razonesSociales)) {
    return Response.json(
      { error: 'El campo "razonesSociales" debe ser una lista.' },
      { status: 400 }
    );
  }

  const aprendido = unirBase(
    aprenderDeFilas(filas),
    aprenderDeCorrecciones(correcciones || []),
    { materiales: materiales || [], razonesSociales: razonesSociales || [] }
  );
  const reemplazar = body?.reemplazar === true;
  const partes = [];
  if (filas.length) partes.push(`+${filas.length} ticket(s)`);
  if (materiales?.length) partes.push(`+${materiales.length} material(es)`);
  if (razonesSociales?.length) partes.push(`+${razonesSociales.length} razón(es) social(es)`);
  try {
    const { db } = await writeJson(
      PATH,
      (actual) => (reemplazar ? aprendido : unirBase(actual || {}, aprendido)),
      reemplazar
        ? `Base de conocimiento: reemplazo con ${filas.length} ticket(s)`
        : `Base de conocimiento: ${partes.join(' · ') || 'sin cambios'}`
    );
    return Response.json({
      ok: true,
      base: db,
      aprendidos: {
        tickets: Object.keys(aprendido.correccionesPorTicket).length,
        archivos: Object.keys(aprendido.correccionesPorArchivo).length,
        reglas: Object.values(aprendido.reglasLectura).filter(Boolean).length,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err.message || 'No se pudo guardar la base de conocimiento.' },
      { status: 500 }
    );
  }
}
