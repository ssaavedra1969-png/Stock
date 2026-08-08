// ============================================================
// app/api/db/[id]/route.js
// DELETE /api/db/:id  -> elimina un registro
// PUT    /api/db/:id  -> actualiza un registro
// ============================================================
import { writeDb } from '@/lib/github';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  const { id } = params;
  if (!id) {
    return Response.json({ error: 'Falta el id.' }, { status: 400 });
  }
  try {
    await writeDb(
      (current) => {
        const records = (current.records || []).filter((r) => r.id !== id);
        const productos = Array.from(
          new Set(records.map((r) => String(r.producto || '').trim()).filter(Boolean))
        );
        return { ...current, records, productos };
      },
      `Eliminar registro ${id}`
    );
    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo eliminar.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = params;
  if (!id) {
    return Response.json({ error: 'Falta el id.' }, { status: 400 });
  }
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const updates = body?.record;
  if (!updates || typeof updates !== 'object') {
    return Response.json({ error: 'Falta el campo "record".' }, { status: 400 });
  }

  try {
    const { db } = await writeDb(
      (current) => {
        const records = [...(current.records || [])];
        const idx = records.findIndex((r) => r.id === id);
        if (idx === -1) throw new Error('Registro no encontrado.');
        records[idx] = { ...records[idx], ...updates, id };
        const productos = Array.from(
          new Set(records.map((r) => String(r.producto || '').trim()).filter(Boolean))
        );
        return { ...current, records, productos };
      },
      `Editar registro ${id}`
    );
    const record = (db.records || []).find((r) => r.id === id);
    return Response.json({ record, productos: db.productos });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo actualizar el registro.' }, { status: 500 });
  }
}
