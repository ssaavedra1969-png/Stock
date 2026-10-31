// ============================================================
// lib/api.js — Cliente del lado del navegador.
// Habla con las API Routes (/api/db) que persisten los datos en
// el repo de GitHub (data/db.json). No toca Firebase.
// ============================================================

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status} al comunicarse con el servidor.`);
  }
  return data;
}

// Lee el estado completo: { records, productos }
export async function fetchState() {
  const data = await request('/api/db');
  return { records: data.records || [], productos: data.productos || [] };
}

// Crea un registro (+ registra el producto si es nuevo).
// Devuelve { record, productos }.
export async function createRecord(record) {
  return request('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record }),
  });
}

// Elimina un registro por id. Devuelve { ok, id }.
export async function removeRecord(id) {
  return request(`/api/db/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Actualiza un registro existente. Devuelve { record, productos }.
export async function updateRecord(id, record) {
  return request(`/api/db/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record }),
  });
}

// Base de conocimiento de tickets (data/base.json).
export async function fetchBase() {
  const data = await request('/api/base');
  return data.base || {};
}

// Aprende de los tickets recien incorporados y actualiza la base.
export async function saveBase(filas, correcciones = []) {
  return request('/api/base', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filas, correcciones }),
  });
}

// Agrega materiales nuevos al catalogo de la base de conocimiento.
export async function saveBaseMateriales(materiales) {
  return request('/api/base', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ materiales }),
  });
}
