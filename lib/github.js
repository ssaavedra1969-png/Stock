// ============================================================
// lib/github.js  (SOLO SERVIDOR — no importar desde el navegador)
//
// Lee y escribe data/db.json del repo de GitHub usando la API REST
// de contenido (contents). Cada escritura crea un commit nuevo, por
// lo que los datos quedan versionados en git.
//
// Concurrencia: se usa el `sha` del archivo como control de versión
// (optimistic locking). Si dos personas escriben a la vez, la que
// llega segunda recibe HTTP 409 y se reintenta leyendo el estado
// más reciente antes de volver a escribir.
// ============================================================

const API_BASE = 'https://api.github.com';
const DB_PATH = 'data/db.json';
const MAX_ATTEMPTS = 5;

function repo() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) {
    throw new Error('Falta configurar GITHUB_REPO (formato: usuario/repo).');
  }
  return repo;
}

function token() {
  const t = process.env.GITHUB_TOKEN;
  if (!t) {
    throw new Error(
      'Falta configurar GITHUB_TOKEN (personal access token con permiso Contents: write sobre el repo).'
    );
  }
  return t;
}

function branch() {
  return process.env.GITHUB_BRANCH || 'main';
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'falpat-stock',
  };
}

// Lee el archivo actual y devuelve { sha, db }.
export async function readDb() {
  const url = `${API_BASE}/repos/${repo()}/contents/${DB_PATH}?ref=${branch()}`;
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `GitHub: no se pudo leer data/db.json (${res.status}). ${text.slice(0, 160)}`
    );
  }
  const file = await res.json();
  let db;
  try {
    db = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
  } catch (err) {
    throw new Error('GitHub: data/db.json no es un JSON válido.');
  }
  return { sha: file.sha, db };
}

// Aplica `mutate` al estado actual y commitea el resultado.
// `mutate(db)` debe devolver el nuevo estado completo (inmutable).
export async function writeDb(mutate, message) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { sha, db } = await readDb();
    const next = await mutate(db);
    const url = `${API_BASE}/repos/${repo()}/contents/${DB_PATH}`;
    const body = {
      message: `[falpat-stock] ${message}`,
      content: Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf-8').toString('base64'),
      branch: branch(),
      sha,
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (res.ok) return next;
    const text = await res.text().catch(() => '');
    if (res.status === 409) {
      lastErr = new Error('Conflicto de escritura (otro usuario guardó a la vez). Reintentando…');
      continue;
    }
    throw new Error(
      `GitHub: no se pudo escribir data/db.json (${res.status}). ${text.slice(0, 200)}`
    );
  }
  throw lastErr || new Error('GitHub: no se pudo escribir después de varios intentos.');
}
