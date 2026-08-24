// ============================================================
// app/api/db/import/route.js
// POST /api/db/import
// Incorporacion masiva de registros desde un Excel parseado en el
// navegador. A diferencia de POST /api/db (1 registro = 1 commit),
// aca se guardan TODOS los registros nuevos en UN solo commit.
//
// Body: { carga: "Entrada" | "Salida", records: [...] }
// Devuelve: { ok, insertados, duplicados, total }
// ============================================================
import { readDb, writeDb } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CARGAS = new Set(['Entrada', 'Salida']);
const MAX_RECORDS = 5000;

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Deja solo campos conocidos y normaliza tipos; devuelve null si falta
// algo esencial (producto / fecha / peso).
function sanitizar(rec, carga) {
  if (!rec || typeof rec !== 'object') return null;
  const str = (v) => String(v ?? '').trim();
  const producto = str(rec.producto);
  const pesoBalanza = str(rec.pesoBalanza);
  const fechaRemito = str(rec.fechaRemito);
  if (!producto || !pesoBalanza) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(fechaRemito)) return null;
  return {
    carga,
    producto,
    codigoProducto: str(rec.codigoProducto).toUpperCase(),
    fechaRemito,
    patente: str(rec.patente),
    chofer: str(rec.chofer),
    nroRemitoProveedor: carga === 'Entrada' ? str(rec.nroRemitoProveedor) : '',
    nroRemitoFalpat: carga === 'Salida' ? str(rec.nroRemitoFalpat) : '',
    pesoProveedor: '',
    pesoBalanza,
    planta: str(rec.planta) || 'Lujan',
    proveedor: carga === 'Entrada' ? str(rec.proveedor) : '',
    cliente: carga === 'Salida' ? str(rec.cliente) : '',
  };
}

// Clave anti-duplicados identica a la de scripts/import-*.mjs.
function clave(rec) {
  return rec.carga === 'Entrada'
    ? `${rec.fechaRemito}|${rec.producto}|${rec.nroRemitoProveedor}|${rec.pesoBalanza}|${rec.proveedor}`
    : `${rec.fechaRemito}|${rec.producto}|${rec.nroRemitoFalpat}|${rec.pesoBalanza}|${rec.cliente}`;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const carga = body?.carga;
  if (!CARGAS.has(carga)) {
    return Response.json({ error: 'El campo "carga" debe ser "Entrada" o "Salida".' }, { status: 400 });
  }
  if (!Array.isArray(body.records) || body.records.length === 0) {
    return Response.json({ error: 'No hay registros para importar.' }, { status: 400 });
  }
  if (body.records.length > MAX_RECORDS) {
    return Response.json(
      { error: `Demasiados registros (${body.records.length}). El máximo por importación es ${MAX_RECORDS}.` },
      { status: 413 }
    );
  }

  const limpios = [];
  for (const raw of body.records) {
    const rec = sanitizar(raw, carga);
    if (rec) limpios.push(rec);
  }
  if (limpios.length === 0) {
    return Response.json({ error: 'Ningún registro tiene los datos mínimos (producto, fecha y cantidad).' }, { status: 400 });
  }

  try {
    let insertados = 0;
    const createdAt = new Date().toISOString();
    const { db } = await writeDb((current) => {
      const base = Array.isArray(current.records) ? current.records : [];
      const existentes = new Set(base.map(clave));
      const nuevos = [];
      for (const rec of limpios) {
        const k = clave(rec);
        if (existentes.has(k)) continue;
        existentes.add(k);
        nuevos.push({ id: makeId(), createdAt, ...rec });
      }
      insertados = nuevos.length;

      // Mismo criterio que los scripts: productos usados en la base
      // (+ los nuevos), orden alfabético.
      const productosFinales = Array.from(
        new Set([
          ...(Array.isArray(current.productos) ? current.productos : []).filter((p) =>
            base.some((r) => r.producto === p)
          ),
          ...nuevos.map((r) => r.producto),
        ])
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      return { records: [...nuevos, ...base], productos: productosFinales };
    }, `Importar ${carga.toLowerCase()}s desde Excel (${limpios.length} filas)`);

    return Response.json({
      ok: true,
      insertados,
      duplicados: limpios.length - insertados,
      total: db.records.length,
    });
  } catch (err) {
    return Response.json({ error: err.message || 'No se pudo guardar la importación.' }, { status: 500 });
  }
}
