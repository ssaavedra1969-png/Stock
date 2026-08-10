# AYUDA MEMORIA — FALPAT Stock

_Última actualización: 2026-08-08. Leer esto completo antes de tocar nada._

---

## 1. QUÉ ES ESTO

Sistema web para control de stock de **FALPAT srl** (planta Lujan, Buenos Aires): registra
entradas/salidas de materiales (arena, áridos, etc.) con peso en toneladas, camiones
(patente + chofer), remitos y proveedores.

- **App Next.js 14 + Tailwind** (React, App Router), deploy en **Vercel**.
- **La base de datos es un archivo JSON versionado en GitHub** (`data/db.json`). No hay
  PostgreSQL/MongoDB. Cada guardado = commit/API a GitHub.
- Repo: `https://github.com/ssaavedra1969-png/Stock`
- Producción: `https://stock-gamma-inky.vercel.app/`

---

## 2. CÓMO LEVANTAR / PROBAR

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # lint
npm run build      # build de producción (NO correr con `npm run dev` activo)
```

- `npm run dev` usa `.env.local` (ignorado por git) con `GITHUB_BRANCH=dev` → trabaja contra
  la rama de prueba, NO toca producción.
- Verificación rápida de datos: `GET /api/db` debe responder `200` con `records.length === 1867`.

### Proceso al hacer cambios (flujo actual)

1. Probá en `dev` (`.env.local` apunta a `dev`).
2. Cuando el usuario aprueba → `git add` + `git commit` + `git push origin main`.
3. Vercel despliega solo desde `main` (ramas: `main` = producción, `dev` = prueba).
4. Verificar después del deploy: home, `/informes`, `/api/db` (1867 records).

---

## 3. ARQUITECTURA (resumen)

- **`data/db.json`** → la "base de datos": `{ records: [...], productos: [...] }`.
- **API routes** (`app/api/`):
  - `GET/POST /api/db` → leer / agregar registros (lee y escribe a GitHub con el token).
  - `PUT/DELETE /api/db/[id]` → editar / borrar un registro. Siempre recalcula `productos`.
- **Clientes**:
  - `app/page.js` → **Panel**: tabla de últimos movimientos (filtra por búsqueda, ordena por
    columnas con flechas, editar/borrar con lápiz/tacho), columna de acciones fija a la derecha.
  - `app/informes/page.js` → **Informes**: filtros (producto, planta, tipo entradas/salidas,
    búsqueda libre, fechas, períodos rápidos) y resumen por producto con entradas/salidas/balance.
  - `context/AppContext.js` → carga global de datos + estado de edición (`openEdit`, `updateRecord`).
  - `components/ModalForm.js` → alta/edición (autocompleta código por producto, unidad automática).
  - `lib/api.js` → funciones HTTP (`getRecords`, `createRecord`, `updateRecord`, `deleteRecord`).
  - `lib/utils.js` → `toMillis`, `formatDate`, `normalizeText`, `parseWeight` (SOLO suma tn), `cn`.
  - `lib/productos.js` → catálogo código → nombre → unidad.
  - `scripts/import-entrada.mjs` → importador masivo desde Excel a una rama.

### Formato de un record

```json
{
  "id": "uuid",
  "carga": "Entrada" | "Salida",
  "fechaRemito": "2026-01-02T12:00:00.000Z",
  "producto": "Arena Fina",
  "codigoProducto": "AF",
  "patente": "AB123CD",
  "chofer": "NOMBRE APELLIDO",
  "nroRemitoFalpat": "",
  "nroRemitoProveedor": "",
  "proveedor": "SPOSITO",            // viene de la columna OBSERVACION del Excel
  "cliente": "",
  "pesoProveedor": "32.000 tn",
  "pesoBalanza": "31.900 tn",        // el que se usa para totales
  "planta": "Lujan"
}
```

### Catálogo de productos y unidades

| Código | Producto            | Unidad    |
|--------|---------------------|-----------|
| AF     | Arena Fina          | tn        |
| P06    | Piedra 6-20         | tn        |
| P612   | Piedra 6-12         | tn        |
| P620   | Piedra 6-20? (granel)| tn       |
| P1030  | Piedra 10-30        | tn        |
| C      | Cemento             | tn        |
| W      | Agua                | u         |
| W5     | Agua (5m3?)         | u         |
| S45    | Silo 45            | u         |
| MFB    | Microfibra          | bolsas    |
| RDC    | Reductor            | tambores  |

- `pesoBalanza` guarda `"X.X tn"` / `"X u"` / `"X bolsas"` / `"X tambores"`.
- `parseWeight` devuelve 0 para u/bolsas/tambores (no contamina totales tn).

---

## 4. ESTADO ACTUAL DE LOS DATOS (2026-08-08)

- **1867 registros**, todos `Entrada`, planta `Lujan`, fechas 02/01/2026 → 06/08/2026.
- **11 productos** en catálogo. Proveedores: CA, SPOSITO, LCE, MESSEL, MAPEI, etc.
- Totales: **64.766,46 tn** en registros tn (32 registros son u/bolsas/tambores).
- `data/db.json` local == rama `main` (hash sha256 verificado).
- Base de producción actualizada a estos 1867 registros.

---

## 5. BACKUP DE DATOS (LO MÁS IMPORTANTE)

**Regla de oro: nunca dejar el repo con `data/db.json` sin commitear. Cada commit es un backup.**

- Backup principal: `data/db.json` commiteado en `main` → respaldo en **git history**
  + **GitHub** (remoto) + **Vercel**.
- Snapshot explícito: `backup/db-backup-YYYY-MM-DD.json` (copia fechada de `data/db.json`,
  commiteada). Hoy: `backup/db-backup-2026-08-08.json` (1.867 registros).
- Fuente original de la carga: `entrada/Entrada.xlsx` (también está versionado en el repo).
- **Restaurar**: tomar el contenido de un backup y subirlo a la rama deseada vía la API de
  contenidos de GitHub (PUT a `data/db.json`) o reemplazando el archivo local + commit + push.
- Verificación de integridad: comparar hash entre local y remoto
  (`node` + `createHash('sha256')` sobre el contenido) o chequear `GET /api/db` (1867 records).

---

## 6. IMPORTADOR DESDE EXCEL

```bash
node scripts/import-entrada.mjs            # usa entrada/Entrada.xlsx → rama dev
node scripts/import-entrada.mjs <archivo.xlsx> <rama>
```

- Lee columnas del Excel (incluye `OBSERVACION` → campo `proveedor`), asigna `codigoProducto`
  por catálogo, setea `planta: "Lujan"`, sube a GitHub en lotes de 500, dedupe por clave,
  elimina registros `seed-*`.
- **El Excel debe estar cerrado** (Windows lo bloquea). Verificar el resultado en `dev`
  antes de pasar a `main`.

---

## 7. SEGURIDAD / TOKENS (¡IMPORTANTE!)

- El token vive en `.env.local` (local, **gitignored**) y en las **env vars de Vercel**.
  NO se sube al repo. Si una IA lo necesita, debe leer `.env.local` o Vercel, no inventarlo.
- En Vercel están definidas: `GITHUB_REPO`, `GITHUB_TOKEN`, `GITHUB_BRANCH=main`.
- **PENDIENTE (usuario): revocar el token viejo** (comienza con `ghp_Rza…`, quedó expuesto en
  una conversación anterior; su valor completo NO va en el repo) en
  https://github.com/settings/tokens.
- En `.env.local` local: `GITHUB_BRANCH=dev` (para no tocar producción desde local).

---

## 8. ERRORES CONOCIDOS Y GOTCHAS

1. **`.next` corrupto** — `Cannot find module './NNN.js'` / `unhandledRejection`:
   se corrompe si `next dev` corre mientras `next build` se ejecuta (o viceversa).
   Fix: matar TODOS los procesos `node`, borrar `.next`, levantar de nuevo.
2. **Panel con datos viejos** — casi siempre es cache del navegador. Fix: `Ctrl+Shift+R`
   o ventana incógnito.
3. **Fechas desplazadas -1 día** — bug histórico de zona horaria en el importador; ya
   resuelto usando `toISOString().slice(0,10)` para fechas de Excel.
4. **Encoding** — usar siempre UTF-8 sin BOM en los `.js` (PowerShell `Set-Content`
   puede meter BOM y corromper acentos; verificar primeros bytes del archivo).
5. **No correr `build` con el dev server activo** (ver punto 1).

---

## 9. PENDIENTES / PRÓXIMOS PASOS

- [ ] **REVISAR CON EL USUARIO las filas BA y T de Salida.xlsx** (a pedido, quedó agendado).
      Son las únicas 2 filas NO importadas (711 del archivo → 709 en dev):
      - fila 593: código `BA`, sin descripción, cant 4, remito 20339, cliente ALMAJO SARGENTO.
      - fila 663: código `T`, sin descripción, cant 28.94, remito 20856, cliente GLATTI GLADYS.
      El usuario sospecha que se cargaron mal en el Excel; hay que preguntar qué son.
- [ ] **Confirmar unidad de MS 453 (MIRA SET 453)** — se importó como `u` (2 filas: 21 u y 0.03 u).
      Si es otra unidad (tn/kg), corregir.
- [ ] **MERGE de las salidas a main (pendiente de aprobación).** Dev ya tiene 2576 registros
      (1867 entradas + 709 salidas). Producción sigue con 1867. **Obligatorio subir junto con
      el fix de 1 MiB** (sección 8, punto 6), si no, main no se puede leer al superar 1 MiB.
- [ ] **Panel: reporte del usuario de que el buscador no filtra al escribir.** El código y el
  bundle desplegado están verificados correctos (búsquedas reales OK). Probable cache del
  navegador; si persiste, reproducir con navegador real (no hay headless en la máquina).
- [ ] Revocar token viejo (ver sección 7).
- [ ] Si llegan planillas de **Salidas** o de otras plantas, importar con el mismo script.
- [ ] Evaluar si el usuario quiere que el Panel recupere un filtro por producto (fue removido
      a pedido, solo queda el buscador).
- [ ] Consistencia pendiente (a decisión del usuario): las **entradas** guardaron la columna
      REMITOS en `nroRemitoProveedor`; el usuario confirmó que el nro de remito es de FALPAT.
      Las **salidas** nuevas usan `nroRemitoFalpat`. Quedó así por ahora.

---

## 10. PARA QUE UNA IA SE PONGA AL TANTO RÁPIDO (checklist)

1. Leer este archivo completo.
2. `git status` y `git log --oneline -5` para ver el estado real.
3. Levantar `npm run dev` y abrir `http://localhost:3000` (usa rama `dev`).
4. Chequear `GET /api/db` (1867 records) en local y en producción.
5. NO tocar producción sin probar en `dev` primero y sin que el usuario lo apruebe.
