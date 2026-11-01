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
  const razonSocial = text(record.razonSocial);
  const pesoProveedor = text(record.pesoProveedor);
  const pesoBalanza = text(record.pesoBalanza);
  const planta = text(record.planta);

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
      { error: 'Importación bloqueada: esta herramienta solo funciona localmente con GITHUB_BRANCH=dev.' },
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
    return Response.json({ error: 'Falta la confirmación explícita de importación.' }, { status: 400 });
  }
  const rawRecords = body.records || [];
  const rawReconciliations = body.reconciliations || [];
  if (!Array.isArray(rawRecords) || !Array.isArray(rawReconciliations)) {
    return Response.json({ error: 'Los registros y las conciliaciones deben ser listas.' }, { status: 400 });
  }
  if (rawRecords.length === 0 && rawReconciliations.length === 0) {
    return Response.json({ error: 'No hay Entradas para importar.' }, { status: 400 });
  }
  if (rawRecords.length + rawReconciliations.length > MAX_RECORDS) {
    return Response.json({ error: `La importación supera el máximo de ${MAX_RECORDS} registros.` }, { status: 413 });
  }

  const records = rawRecords.map(sanitizeEntry);
  if (records.some((record) => !record)) {
    return Response.json(
      { error: 'Hay registros inválidos. No se guardó ningún dato.' },
      { status: 400 }
    );
  }

  const reconciliations = rawReconciliations.map((item) => ({
    id: text(item?.id),
    record: sanitizeEntry(item?.record),
  }));
  if (reconciliations.some((item) => !item.id || !item.record)) {
    return Response.json(
      { error: 'Hay conciliaciones inválidas. No se guardó ningún dato.' },
      { status: 400 }
    );
  }
  if (new Set(reconciliations.map((item) => item.id)).size !== reconciliations.length) {
    return Response.json({ error: 'Un registro manual aparece más de una vez en la conciliación.' }, { status: 409 });
  }

  const seenBatch = new Set();
  const batchDuplicates = records.filter((record) => {
    const key = dedupeKey(record);
    if (seenBatch.has(key)) return true;
    seenBatch.add(key);
    return false;
  });
  if (batchDuplicates.length) {
    return Response.json(
      { error: 'El archivo contiene movimientos duplicados. No se guardó ningún dato.', duplicados: batchDuplicates.length },
      { status: 409 }
    );
  }

  try {
    const createdAt = new Date().toISOString();
    let insertados = 0;
    let actualizados = 0;
    const { db } = await writeDb((current) => {
      const currentRecords = Array.isArray(current.records) ? current.records : [];
      const existingKeys = new Set(currentRecords.map(dedupeKey));
      const duplicates = records.filter((record) => existingKeys.has(dedupeKey(record)));
      if (duplicates.length) {
        throw new Error(
          `La base dev ya contiene ${duplicates.length} movimiento(s) idéntico(s). No se importó el lote.`
        );
      }
      const reconciliationIds = new Set(reconciliations.map((item) => item.id));
      const existingById = new Map(currentRecords.map((record) => [record.id, record]));
      const reconciliationUpdates = [];
      const reconciliationRemitKeys = new Set();
      for (const item of reconciliations) {
        const existing = existingById.get(item.id);
        if (
          !existing ||
          existing.carga !== 'Entrada' ||
          !['manual', 'desconocido', undefined].includes(existing.origenCarga)
        ) {
          throw Object.assign(
            new Error('Solo se puede completar una Entrada manual o un registro antiguo cuyo origen no esté identificado.'),
            { status: 409 }
          );
        }
        if (claveRemitoEntrada(existing) !== claveRemitoEntrada(item.record)) {
          throw Object.assign(new Error('El proveedor o número de remito no coincide con el registro manual.'), {
            status: 409,
          });
        }
        const { completar } = evaluarCompletarManual(existing, item.record);
        if (Object.keys(completar).length === 0) {
          throw Object.assign(new Error('El registro manual no tiene campos vacíos para completar.'), {
            status: 409,
          });
        }
        reconciliationUpdates.push({ id: item.id, completar });
        reconciliationRemitKeys.add(claveRemitoEntrada(existing));
      }

      const remitoConflicts = records.filter((record) => {
        const key = claveRemitoEntrada(record);
        return (
          reconciliationRemitKeys.has(key) ||
          currentRecords.some(
            (existing) =>
              claveRemitoEntrada(existing) === key &&
              !reconciliationIds.has(existing.id)
          )
        );
      });
      if (remitoConflicts.length) {
        throw Object.assign(
          new Error(`La base dev ya contiene ${remitoConflicts.length} Entrada(s) con el mismo proveedor y remito. No se importó el lote.`),
          { status: 409 }
        );
      }

      const nextRecords = currentRecords.map((record) => {
        const update = reconciliationUpdates.find((item) => item.id === record.id);
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
        ...record,
      }));
      insertados = newRecords.length;
      actualizados = reconciliationUpdates.length;
      const productos = Array.from(
        new Set([
          ...(Array.isArray(current.productos) ? current.productos : []),
          ...newRecords.map((record) => record.producto),
        ])
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      return {
        ...current,
        records: [...newRecords, ...nextRecords],
        productos,
      };
    }, `Prueba local: importar ${records.length} entradas y completar ${reconciliations.length} registros manuales desde Stock-Historico.xlsx`);

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
      { error: error.message || 'No se pudo importar el lote a dev.' },
      { status: error.status || 500 }
    );
  }
}
