// ============================================================
// app/api/db/[id]/route.js
// DELETE /api/db/:id  -> elimina un registro
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
      (current) => ({
        ...current,
        records: (current.records || []).filter((r) => r.id !== id),
      }),
      `Eliminar registro ${id}`
    );
    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo eliminar.' }, { status: 500 });
  }
}
