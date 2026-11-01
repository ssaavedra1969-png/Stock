import { writeDb } from '@/lib/github';
import {
  claveRemitoEntrada,
  evaluarCompletarManual,
} from '@/lib/importar-remitos-dev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECORDS = 5000;

function isDevelopmentOnly() {
  return !process.env.VERCEL && process.env.GITHUB_BRANCH === 'dev';
}

function text(value) {
  return String(value ?? '').trim();
}

function sanitizeEntry(record) {
  if (!record || typeof record !== 'object' || record.carga !== 'Entrada') return null;
  const fechaRemito = text(record.fechaRemito);
  const producto = text(record.producto);
  const proveedor = text(record.proveedor);
  const nroRemitoProveedor = text(record.nroRemitoProveedor);
  const pesoProveedor = text(record.pesoProveedor);
  const pesoBalanza = text(record.pesoBalanza);
  const planta = text(record.planta);
  const razonSocial = text(record.razonSocial);

  if (!/^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/.test(fechaRemito)) return null;
  if (!producto || !proveedor || !nroRemitoProveedor || !razonSocial) return null;
  if (!/^\d+(?:\.\d+)? tn$/.test(pesoProveedor) || !/^\d+(?:\.\d+)? tn$/.test(pesoBalanza)) return null;
  if (!['Lujan', 'Campana'].includes(planta)) return null;

  return {
    carga: 'Entrada',
    producto,
    codigoProducto: text(record.codigoProducto).toUpperCase(),
    fechaRemito,
    patente: text(record.patente).toUpperCase(),
    chofer: text(record.chofer),
    nroRemitoProveedor,
    nroRemitoFalpat: '',
    pesoProveedor,
    pesoBalanza,
    planta,
    proveedor,
    cliente: '',
    razonSocial,
    archivoOrigen: text(record.archivoOrigen).replace(/[\\/?%*:|"<>]/g, '_').slice(0, 200),
  };
}

function dedupeKey(record) {
  return [
    record.fechaRemito,
    record.producto,
    record.nroRemitoProveedor,
    record.pesoBalanza,
    record.proveedor,
  ].join('|');
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET() {
  const enabled = isDevelopmentOnly();
  return Response.json({
    enabled,
    environment: process.env.VERCEL ? 'vercel' : 'local',
    branch: process.env.GITHUB_BRANCH || '(no configurada)',
  }, { status: enabled ? 200 : 403 });
}

export async function POST(request) {
  if (!isDevelopmentOnly()) {
    return Response.json(
      { error: 'Importación bloqueada: el escaneo de remitos solo puede guardar localmente con GITHUB_BRANCH=dev.' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (body?.confirmar !== true) {
    return Response.json({ error: 'Falta la confirmación explícita de incorporación.' }, { status: 400 });
  }
  if (!Array.isArray(body.records) || !Array.isArray(body.reconciliations)) {
    return Response.json({ error: 'Los registros y las conciliaciones deben ser listas.' }, { status: 400 });
  }
  if (body.records.length + body.reconciliations.length === 0) {
    return Response.json({ error: 'No hay registros nuevos ni pendientes de completar.' }, { status: 400 });
  }
  if (body.records.length + body.reconciliations.length > MAX_RECORDS) {
    return Response.json({ error: `La operación supera el máximo de ${MAX_RECORDS} registros.` }, { status: 413 });
  }

  const records = body.records.map(sanitizeEntry);
  if (records.some((record) => !record)) {
    return Response.json({ error: 'Hay Entradas inválidas. No se guardó ningún dato.' }, { status: 400 });
  }

  const reconciliations = body.reconciliations.map((item) => ({
    id: text(item?.id),
    record: sanitizeEntry(item?.record),
  }));
  if (reconciliations.some((item) => !item.id || !item.record)) {
    return Response.json({ error: 'Hay conciliaciones inválidas. No se guardó ningún dato.' }, { status: 400 });
  }
  if (new Set(reconciliations.map((item) => item.id)).size !== reconciliations.length) {
    return Response.json({ error: 'Un movimiento aparece más de una vez en la conciliación.' }, { status: 409 });
  }

  const batchKeys = new Set();
  for (const record of records) {
    const key = claveRemitoEntrada(record);
    if (batchKeys.has(key)) {
      return Response.json({ error: 'El lote contiene más de una línea para el mismo proveedor y remito.' }, { status: 409 });
    }
    batchKeys.add(key);
  }

  try {
    const createdAt = new Date().toISOString();
    let insertados = 0;
    let actualizados = 0;
    const { db } = await writeDb((current) => {
      const currentRecords = Array.isArray(current.records) ? current.records : [];
      const reconciliationIds = new Set(reconciliations.map((item) => item.id));
      const existingById = new Map(currentRecords.map((record) => [record.id, record]));
      const updates = [];

      for (const item of reconciliations) {
        const existing = existingById.get(item.id);
        if (
          !existing ||
          existing.carga !== 'Entrada' ||
          !['manual', 'desconocido', undefined].includes(existing.origenCarga) ||
          existing.enriquecidoPorPdf
        ) {
          throw Object.assign(
            new Error('Solo se puede completar una Entrada manual o antigua no conciliada previamente.'),
            { status: 409 }
          );
        }
        const remitKey = claveRemitoEntrada(existing);
        if (!remitKey || remitKey !== claveRemitoEntrada(item.record)) {
          throw Object.assign(new Error('El proveedor o número de remito no coincide con el movimiento seleccionado.'), {
            status: 409,
          });
        }
        const sameRemit = currentRecords.filter(
          (record) => claveRemitoEntrada(record) === remitKey
        );
        if (sameRemit.length !== 1) {
          throw Object.assign(new Error('Hay varias coincidencias para este remito. No se modificó ningún movimiento.'), {
            status: 409,
          });
        }
        const { completar } = evaluarCompletarManual(existing, item.record);
        if (!Object.keys(completar).length) {
          throw Object.assign(new Error('El movimiento seleccionado no tiene campos vacíos para completar.'), {
            status: 409,
          });
        }
        updates.push({ id: existing.id, completar });
      }

      for (const record of records) {
        const remitKey = claveRemitoEntrada(record);
        if (currentRecords.some((existing) => claveRemitoEntrada(existing) === remitKey)) {
          throw Object.assign(
            new Error(`El remito ${record.proveedor} · ${record.nroRemitoProveedor} ya existe en la base. Revisá la coincidencia antes de continuar.`),
            { status: 409 }
          );
        }
      }

      const updatedRecords = currentRecords.map((record) => {
        const update = updates.find((item) => item.id === record.id);
        return update
          ? {
              ...record,
              ...update.completar,
              origenCarga: record.origenCarga || 'desconocido',
              enriquecidoPorPdf: true,
              fechaEnriquecimientoPdf: createdAt,
            }
          : record;
      });
      const newRecords = records.map((record) => ({
        id: makeId(),
        createdAt,
        origenCarga: 'pdf',
        fechaImportacionPdf: createdAt,
        ...record,
      }));
      insertados = newRecords.length;
      actualizados = updates.length;
      const productos = Array.from(
        new Set([
          ...(Array.isArray(current.productos) ? current.productos : []),
          ...newRecords.map((record) => record.producto),
        ])
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      return {
        ...current,
        records: [...newRecords, ...updatedRecords],
        productos,
      };
    }, `Desarrollo: incorporar ${records.length} entrada(s) PDF y completar ${reconciliations.length} registro(s)`);

    return Response.json({
      ok: true,
      branch: 'dev',
      insertados,
      actualizados,
      total: db.records.length,
      totalEntradas: db.records.filter((record) => record.carga === 'Entrada').length,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || 'No se pudieron incorporar las Entradas desde PDF.' },
      { status: error.status || 500 }
    );
  }
}
