// ============================================================
// lib/productos.js
// Catálogo de productos: código -> nombre -> unidad de medida.
// Usado por el script de importación y por el formulario para
// colocar automáticamente la medida según el producto.
// Materiales a granel se miden en tn; los demás en su unidad.
// ============================================================

export const CATALOGO_PRODUCTOS = [
  { codigo: 'AF', nombre: 'ARENA FINA', unidad: 'tn' },
  { codigo: 'P06', nombre: 'PIEDRA 0-6', unidad: 'tn' },
  { codigo: 'P612', nombre: 'PIEDRA 6-12', unidad: 'tn' },
  { codigo: 'P620', nombre: 'PIEDRA 6-20', unidad: 'tn' },
  { codigo: 'P1030', nombre: 'PIEDRA 10-30', unidad: 'tn' },
  { codigo: 'E100', nombre: 'ESTABILIZADO 0-100 X TN', unidad: 'tn' },
  { codigo: 'E020', nombre: 'ESTABILIZADO GRANULOMETRICO 0/20', unidad: 'tn' },
  { codigo: 'MS 453', nombre: 'MIRA SET 453 (ADITIVO)', unidad: 'kg' },
  { codigo: 'C', nombre: 'CPF 40 AVELLANEDA', unidad: 'tn' },
  { codigo: 'W', nombre: 'W351R', unidad: 'u' },
  { codigo: 'W5', nombre: 'W500R', unidad: 'u' },
  { codigo: 'S45', nombre: 'SELLADOR (MAPEFLEX PU 45 FT 111 GREY 20X 600ML', unidad: 'u' },
  { codigo: 'MFB', nombre: 'MAPEFILL E BASGS 25KG', unidad: 'bolsas' },
  { codigo: 'RDC', nombre: 'RDC DRUMS 200 KG', unidad: 'tambores' },
  // Productos históricos sin código (se mantienen en tn)
  { codigo: '', nombre: 'Piedra 10.60', unidad: 'tn' },
  { codigo: '', nombre: 'Cemento Avellaneda', unidad: 'tn' },
  { codigo: '', nombre: 'Arena', unidad: 'tn' },
];

export function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function unidadPorCodigo(codigo) {
  const c = String(codigo ?? '').trim().toUpperCase();
  const p = CATALOGO_PRODUCTOS.find((x) => x.codigo === c);
  return p ? p.unidad : 'tn';
}

export function unidadPorNombre(nombre) {
  const n = normalizar(nombre);
  const p = CATALOGO_PRODUCTOS.find((x) => normalizar(x.nombre) === n);
  return p ? p.unidad : 'tn';
}

// Formatea un número con punto decimal, sin ruido de punto flotante.
export function formatearNumero(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return String(Number(num.toFixed(3)));
}

// Devuelve "35.4 tn", "1000 u", "70 bolsas", "1 tambores"...
export function cantidadConUnidad(cantidad, unidad) {
  const num = formatearNumero(cantidad);
  if (num === '') return '';
  const u = unidad === 'u' ? 'u' : unidad || 'tn';
  return `${num} ${u}`;
}
