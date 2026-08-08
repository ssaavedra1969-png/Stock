// ============================================================
// app/api/db/route.js
// GET  /api/db         -> devuelve el estado completo { records, productos }
// POST /api/db         -> crea un registro (+ registra el producto si es nuevo)
// ============================================================
import { readDb, writeDb } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET() {
  try {
    const { db } = await readDb();
    return Response.json({
      records: Array.isArray(db.records) ? db.records : [],
      productos: Array.isArray(db.productos) ? db.productos : [],
    });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudieron leer los datos.' }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const record = body?.record;
  if (!record || typeof record !== 'object') {
    return Response.json({ error: 'Falta el campo "record".' }, { status: 400 });
  }

  try {
    const { db } = await writeDb((current) => {
      const rec = { id: makeId(), createdAt: new Date().toISOString(), ...record };
      const name = String(rec.producto || '').trim();
      const productos = Array.isArray(current.productos) ? current.productos : [];
      return {
        records: [rec, ...(current.records || [])],
        productos: name && !productos.includes(name) ? [...productos, name] : productos,
      };
    }, `Agregar ${record.carga || 'movimiento'}: ${record.producto || ''}`);

    return Response.json({ record: db.records[0], productos: db.productos });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo guardar el registro.' }, { status: 500 });
  }
}
