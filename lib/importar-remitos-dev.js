import { CATALOGO_PRODUCTOS, normalizar } from './productos.js';
import { fechaADia } from './importar.js';
import { normalizeRemito } from './tickets/extract.mjs';

const REQUIRED_COLUMNS = [
  'FECHA',
  'PROVEEDOR',
  'N REMITO',
  'RAZON SOCIAL',
  'MATERIAL',
  'NETO',
  'PESO NETO',
  'CHOFER',
  'PAT. CHASIS',
  'CENTRO',
  'CARGA',
];

function text(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function mapHeaders(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('El archivo no contiene encabezados ni datos.');
  }
  const headers = (rows[0] || []).map(normalizeHeader);
  const columns = {};
  for (const column of REQUIRED_COLUMNS) {
    const index = headers.indexOf(normalizeHeader(column));
    if (index < 0) throw new Error(`Falta la columna "${column}" en la primera fila.`);
    columns[column] = index;
  }
  return columns;
}

function parseKilograms(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s/g, '').replace(/[^\d.,+-]/g, '');
  if (!raw) return null;

  const separator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let normalized = raw;
  if (separator >= 0) {
    const digitsAfter = raw.length - separator - 1;
    const integer = raw.slice(0, separator).replace(/[.,]/g, '');
    const fraction = raw.slice(separator + 1).replace(/[.,]/g, '');
    normalized =
      digitsAfter === 3 && integer
        ? raw.replace(/[.,]/g, '')
        : `${integer}.${fraction}`;
  }
  const kilograms = Number(normalized);
  return Number.isFinite(kilograms) ? kilograms : null;
}

function kilogramsAsTons(kilograms) {
  return `${Number((kilograms / 1000).toFixed(3)).toString()} tn`;
}

function normalizeCenter(value) {
  const center = normalizar(value);
  if (center === 'lujan') return 'Lujan';
  if (center === 'campana') return 'Campana';
  return '';
}

function exactProductCode(product) {
  const target = normalizar(product);
  return (
    CATALOGO_PRODUCTOS.find(
      (item) => item.codigo && normalizar(item.nombre) === target
    )?.codigo || ''
  );
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

export function claveRemitoEntrada(record) {
  const proveedor = normalizar(record?.proveedor);
  const remito = normalizeRemito(record?.nroRemitoProveedor);
  return proveedor && remito ? `${proveedor}|${remito.toUpperCase()}` : '';
}

const CAMPOS_REMITO = [
  'fechaRemito',
  'producto',
  'codigoProducto',
  'patente',
  'chofer',
  'nroRemitoProveedor',
  'pesoProveedor',
  'pesoBalanza',
  'planta',
  'proveedor',
  'razonSocial',
];

function valorVacio(value) {
  return value == null || String(value).trim() === '' || String(value).trim().toUpperCase() === 'N/D';
}

function valorComparable(field, value) {
  const textValue = text(value);
  return field === 'fechaRemito' ? textValue.slice(0, 10) : textValue.toLowerCase();
}

export function evaluarCompletarManual(existing, incoming) {
  const completar = {};
  const conflictos = [];
  for (const field of CAMPOS_REMITO) {
    const current = existing?.[field];
    const fromPdf = incoming?.[field];
    if (valorVacio(fromPdf)) continue;
    if (valorVacio(current)) {
      completar[field] = fromPdf;
    } else if (valorComparable(field, current) !== valorComparable(field, fromPdf)) {
      conflictos.push({ campo: field, actual: current, pdf: fromPdf });
    }
  }
  return { completar, conflictos };
}

export function parsearExcelRemitosDev(rows, existingRecords = []) {
  const columns = mapHeaders(rows);
  const records = [];
  const existingMatches = [];
  const excludedRows = [];
  const errors = [];
  const skippedDuplicates = [];
  const existingByDedupe = new Map();
  for (const record of existingRecords || []) {
    const key = dedupeKey(record);
    const matches = existingByDedupe.get(key) || [];
    matches.push(record);
    existingByDedupe.set(key, matches);
  }
  const existingKeys = new Set(
    (existingRecords || []).map(dedupeKey)
  );
  const batchKeys = new Set();
  const existingByRemit = new Map();
  for (const record of existingRecords || []) {
    const key = claveRemitoEntrada(record);
    if (!key) continue;
    const matches = existingByRemit.get(key) || [];
    matches.push(record);
    existingByRemit.set(key, matches);
  }
  const remitoConflicts = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.every((value) => !text(value))) continue;

    const rowNumber = index + 1;
    const get = (column) => row[columns[column]];
    const carga = text(get('CARGA'));
    if (normalizar(carga) !== 'entrada') {
      excludedRows.push({ row: rowNumber, carga: carga || '(vacía)' });
      continue;
    }

    const day = fechaADia(get('FECHA'));
    const proveedor = text(get('PROVEEDOR'));
    const remito = text(get('N REMITO'));
    const razonSocial = text(get('RAZON SOCIAL'));
    const producto = text(get('MATERIAL'));
    const netoKg = parseKilograms(get('NETO'));
    const pesoNetoKg = parseKilograms(get('PESO NETO'));
    const chofer = text(get('CHOFER'));
    const patente = text(get('PAT. CHASIS')).toUpperCase();
    const planta = normalizeCenter(get('CENTRO'));
    const rowErrors = [];

    if (!day) rowErrors.push('FECHA no reconocida');
    if (!proveedor) rowErrors.push('falta PROVEEDOR');
    if (!remito) rowErrors.push('falta N REMITO');
    if (!razonSocial) rowErrors.push('falta RAZON SOCIAL');
    if (!producto) rowErrors.push('falta MATERIAL');
    if (netoKg === null || netoKg <= 0) rowErrors.push('NETO inválido o vacío');
    if (pesoNetoKg === null || pesoNetoKg <= 0) rowErrors.push('PESO NETO inválido o vacío');
    if (!chofer) rowErrors.push('falta CHOFER');
    if (!patente) rowErrors.push('falta PAT. CHASIS');
    if (!planta) rowErrors.push(`CENTRO no reconocido (${text(get('CENTRO')) || 'vacío'})`);

    if (rowErrors.length) {
      errors.push({ row: rowNumber, details: rowErrors });
      continue;
    }

    const codigoProducto = exactProductCode(producto);
    const record = {
      carga: 'Entrada',
      producto,
      codigoProducto,
      fechaRemito: `${day}T12:00:00.000Z`,
      patente,
      chofer,
      nroRemitoProveedor: remito,
      nroRemitoFalpat: '',
      pesoProveedor: kilogramsAsTons(netoKg),
      pesoBalanza: kilogramsAsTons(pesoNetoKg),
      planta,
      proveedor,
      cliente: '',
      razonSocial,
      _sourceRow: rowNumber,
      _netoKg: netoKg,
      _pesoNetoKg: pesoNetoKg,
      _codeMatched: Boolean(codigoProducto),
    };

    const key = dedupeKey(record);
    const exactExisting = existingByDedupe.get(key) || [];
    const exactExistingMatch =
      exactExisting.length === 1 && exactExisting[0].origenCarga !== 'pdf';
    if ((existingKeys.has(key) && !exactExistingMatch) || batchKeys.has(key)) {
      skippedDuplicates.push({ row: rowNumber, proveedor, remito });
      continue;
    }
    batchKeys.add(key);
    records.push(record);
  }

  for (const record of [...records]) {
    const matches = existingByRemit.get(claveRemitoEntrada(record)) || [];
    if (!matches.length) continue;

    const [existing] = matches;
    if (matches.length === 1 && existing.origenCarga !== 'pdf') {
      const { completar, conflictos } = evaluarCompletarManual(existing, record);
      existingMatches.push({
        row: record._sourceRow,
        incoming: record,
        origen: existing.origenCarga || 'desconocido',
        existing: {
          id: existing.id,
          producto: existing.producto,
          fechaRemito: existing.fechaRemito,
          patente: existing.patente,
          chofer: existing.chofer,
          pesoProveedor: existing.pesoProveedor,
          pesoBalanza: existing.pesoBalanza,
          planta: existing.planta,
          razonSocial: existing.razonSocial,
        },
        completar,
        conflictos,
      });
    } else {
      remitoConflicts.push({
        row: record._sourceRow,
        proveedor: record.proveedor,
        remito: record.nroRemitoProveedor,
        motivo: matches.length > 1
          ? 'Hay varios registros con este proveedor y remito.'
          : existing.origenCarga === 'pdf'
            ? 'Este remito ya fue incorporado desde PDF.'
            : 'El origen de este registro no está identificado como manual.',
      });
    }
    records.splice(records.indexOf(record), 1);
  }

  const existingMatchCounts = new Map();
  for (const match of existingMatches) {
    existingMatchCounts.set(
      match.existing.id,
      (existingMatchCounts.get(match.existing.id) || 0) + 1
    );
  }
  const ambiguousExistingMatches = existingMatches.filter(
    (match) => existingMatchCounts.get(match.existing.id) > 1
  );
  for (const match of ambiguousExistingMatches) {
    remitoConflicts.push({
      row: match.row,
      proveedor: match.incoming.proveedor,
      remito: match.incoming.nroRemitoProveedor,
      motivo: 'Más de una fila del archivo apunta al mismo registro existente.',
    });
  }
  const ambiguousRows = new Set(ambiguousExistingMatches.map((match) => match.row));

  return {
    totalRows: rows.length - 1,
    records,
    errors,
    excludedRows,
    skippedDuplicates,
    remitoConflicts,
    existingMatches: existingMatches.filter((match) => !ambiguousRows.has(match.row)),
  };
}
