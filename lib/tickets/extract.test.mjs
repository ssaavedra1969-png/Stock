import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonMaterial,
  DOCUMENT_PROFILES,
  extractMaterial,
  extractNeto,
  extractRemito,
  extractRazonSocial,
} from './extract.mjs';

function page(read, onRect = () => {}) {
  return {
    width: 1000,
    height: 1000,
    text: '',
    words: [],
    async ocrRect(rect, psm, enhanced) {
      onRect(rect, psm, enhanced);
      return read(rect, psm);
    },
  };
}

const remitos = [
  ['SPO', '0009-00065979', 'Remito: 09-00065979', '65979'],
  ['LCE', '0002-00112340', 'Remito: 112340', '112340'],
  ['AVE', '0109-00166403', 'Remito: 166403', '166403'],
];

for (const [company, supplierText, ticketText, expected] of remitos) {
  test(`${company} remito se lee en las zonas del encabezado y la balanza`, async () => {
    const supplierPage = page((rect) => {
      const profile = DOCUMENT_PROFILES[company].supplierRemito;
      assert.equal(rect.top, Math.floor(1000 * profile.top));
      assert.ok(rect.top < 200, 'el recorte debe incluir el encabezado superior');
      return supplierText;
    });
    const ticketPage = page((rect) => {
      const profile = DOCUMENT_PROFILES[company].ticketRemito;
      assert.equal(rect.top, Math.floor(1000 * profile.top));
      return ticketText;
    });

    const result = await extractRemito('', company, supplierPage, ticketPage);
    assert.equal(result.value, expected);
    assert.equal(result.conflict, false);
  });
}

test('el Neto de LCE se extrae de la celda de la columna NETO', async () => {
  const source = page((rect, psm) => {
    if (rect.left === Math.floor(1000 * DOCUMENT_PROFILES.LCE.supplierNetoCell.left)) {
      assert.equal(rect.top, Math.floor(1000 * DOCUMENT_PROFILES.LCE.supplierNetoCell.top));
      return '35.080,00';
    }
    assert.equal(rect.left, Math.floor(1000 * DOCUMENT_PROFILES.LCE.supplierNeto.left));
    assert.equal(rect.top, Math.floor(1000 * DOCUMENT_PROFILES.LCE.supplierNeto.top));
    return '';
  });

  assert.equal(await extractNeto('', 'LCE', '199999', null, source), '35.080');
});

test('el Neto de SPOSITO se busca en su columna y no en la descripción del material', async () => {
  const source = page((rect) => {
    const profile = DOCUMENT_PROFILES.SPO.supplierNeto;
    assert.equal(rect.left, Math.floor(1000 * profile.left));
    assert.equal(rect.top, Math.floor(1000 * profile.top));
    return '35.900 TO';
  });

  assert.equal(await extractNeto('', 'SPO', '99999', 35900, source), '35.900');
});

test('el Neto de Avellaneda se lee de la fila de cantidad del remito', async () => {
  const source = page((rect) => {
    if (rect.left === Math.floor(1000 * DOCUMENT_PROFILES.AVE.supplierNetoCell.left)) {
      assert.equal(rect.top, Math.floor(1000 * DOCUMENT_PROFILES.AVE.supplierNetoCell.top));
      return '33.300';
    }
    return '';
  });

  assert.equal(await extractNeto('', 'AVE', '199999', null, source), '33.300');
});

test('el alias OCR de arena fina se normaliza al material conocido', () => {
  assert.equal(canonMaterial('ARENA F.C/MINIMA 1000 TDA'), 'ARENA FINA');
});

test('arena granítica no se clasifica como piedra por compartir granulometría', () => {
  assert.equal(canonMaterial('ARENA GRANITICA POLVO A 6 MM'), 'ARENA GRANITICA 0/6');
  assert.notEqual(canonMaterial('GRANITICA POLVO 0 A 6 MM'), 'PIEDRA PARTIDA 0/6');
});

test('un recorte de material ilegible no crea un conflicto falso', () => {
  const result = extractMaterial(
    '',
    'MATERIAL: ARENA DE CORRALON',
    'E INSC U.U.L T..',
    'SPO'
  );
  assert.equal(result.valor, 'ARENA MODULO 1.8-1.9');
  assert.equal(result.conflicto, false);
});

test('el texto del campo PROVEEDOR no se confunde con la razón social', () => {
  const result = extractRazonSocial('', 'PROVEEDOR LCE-CANTERAS S.A.', null);
  assert.equal(result.valor, null);
  assert.equal(result.dudoso, true);
});

test('palabras de la razón social dispersas en la página no bastan para confirmarla', () => {
  const result = extractRazonSocial('ARENA GRANITICA 0/6 - DESTINO CAMPANA', '', null);
  assert.equal(result.valor, null);
  assert.equal(result.dudoso, true);
});

test('la razón social de LCE se extrae de su campo del remito', () => {
  const result = extractRazonSocial(
    '',
    '',
    null,
    undefined,
    ['RAZON SOCIAL CONSTRUCTORA ALMAJO NORTE S.R.L.', 'ALMAJO NORTE']
  );
  assert.equal(result.valor, 'ALMAJO NORTE');
  assert.equal(result.dudoso, false);
});
