# AYUDA MEMORIA — FALPAT Stock

_Última actualización: 2026-08-10. Leer esto completo antes de tocar nada._

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
- Verificación rápida de datos: `GET /api/db` debe responder `200` con `records.length === 2577` (dev) / `2576` (main).

### Proceso al hacer cambios (flujo actual)

1. Probá en `dev` (`.env.local` apunta a `dev`).
2. Cuando el usuario aprueba → `git add` + `git commit` + `git push origin main`.
3. Vercel despliega solo desde `main` (ramas: `main` = producción, `dev` = prueba).
4. Verificar después del deploy: home, `/informes`, `/reportes`, `/api/db` (2576 records).

---

## 3. ARQUITECTURA (resumen)

- **`data/db.json`** → la "base de datos": `{ records: [...], productos: [...] }`.
- **API routes** (`app/api/`):
  - `GET/POST /api/db` → leer / agregar registros (lee y escribe a GitHub con el token).
  - `PUT/DELETE /api/db/[id]` → editar / borrar un registro. Siempre recalcula `productos`.
- **Clientes**:
  - `app/page.js` → **Panel**: top bar con botones Registrar entrada/salida + mini stats,
    navegador de registro, tabla de movimientos con filtro por carga (Todos/Entradas/Salidas),
    búsqueda, orden por columnas, editar/borrar, columna de acciones fija a la derecha.
  - `app/informes/page.js` → **Informes**: generador gerencial con 6 tipos (Stock actual,
    Entradas, Salidas, Movimientos, Comparativo E/S, Stock por planta), filtros (tipo, desde,
    hasta, producto, planta, proveedor/cliente) que aplican a TODOS los tipos, gráfico de torta,
    exportación Excel/PDF con encabezado + logo de empresa.
  - `app/reportes/page.js` → **Reportes**: el informe original (filtros tipo/planta/búsqueda/
    períodos rápidos, etiqueta Viajes), tabla por producto ordenable al hacer clic en "Producto".
  - `context/AppContext.js` → carga global de datos + estado de edición (`openEdit`, `updateRecord`).
  - `components/ModalForm.js` → alta/edición (autocompleta código por producto, unidad automática).
  - `lib/api.js` → funciones HTTP (`getRecords`, `createRecord`, `updateRecord`, `deleteRecord`).
  - `lib/utils.js` → `toMillis`, `formatDate`, `normalizeText`, `parseWeight` (SOLO suma tn), `cn`.
  - `lib/productos.js` → catálogo código → nombre → unidad.
  - `lib/company.js` → `COMPANY` (datos de empresa: name/tagline/address/phone/email/cuit/web;
    los de contacto están VACÍOS, completar con datos reales) + `LOGO_PATH='/logo.png'`.
  - `public/logo.png` → logo (copia de `logo/fp1.png`) usado en Sidebar e informes.
  - `scripts/import-entrada.mjs` → importador masivo de entradas desde Excel.
  - `scripts/import-salida.mjs` → importador de salidas desde `salida/Salida.xlsx`.
  - Dependencias extra (client-side): `xlsx`, `jspdf`, `jspdf-autotable` para exportaciones.

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

## 4. ESTADO ACTUAL DE LOS DATOS (2026-08-10)

- **2577 registros** (1867 `Entrada` + 710 `Salida`), planta `Lujan`. En `dev` (falta merge a `main`).
- La salida 710 es la fila que decía `BA` (remito 20339, ALMAJO SARGENTO, 4 tn): el usuario confirmó
  que es **AF (ARENA FINA)** → se importó como tal. La fila `T` (remito 20856) se **eliminó** del
  `Salida.xlsx` y no se importa.
- **MS 453 (MIRA SET 453)** se mide en **kg** (no `u`): corregido en catálogo (`lib/productos.js`)
  y en los 2 registros (`21 kg` y `0.03 kg`). Se eliminaron los duplicados viejos en `u`.
- `data/db.json` local == rama `dev`. `GET /api/db` en dev = 2577. Producción (main) sigue en 2576
  hasta aprobar el merge.
- Snapshot de backup: `backup/db-backup-2026-08-09.json` (2.576 registros).

---

## 5. BACKUP DE DATOS (LO MÁS IMPORTANTE)

**Regla de oro: nunca dejar el repo con `data/db.json` sin commitear. Cada commit es un backup.**

- Backup principal: `data/db.json` commiteado en `main` → respaldo en **git history**
  + **GitHub** (remoto) + **Vercel**.
- Snapshot explícito: `backup/db-backup-YYYY-MM-DD.json` (copia fechada de `data/db.json`,
  commiteada). Hoy: `backup/db-backup-2026-08-09.json` (2.576 registros). Anterior: 2026-08-08 (1.867).
- Fuente original de la carga: `entrada/Entrada.xlsx` (también está versionado en el repo).
- **Restaurar**: tomar el contenido de un backup y subirlo a la rama deseada vía la API de
  contenidos de GitHub (PUT a `data/db.json`) o reemplazando el archivo local + commit + push.
- Verificación de integridad: comparar hash entre local y remoto
  (`node` + `createHash('sha256')` sobre el contenido) o chequear `GET /api/db` (2576 records).

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

- [ ] **Completar datos reales de la empresa en `lib/company.js`** (address, phone, email, cuit,
      web) para que aparezcan en el encabezado de los informes exportados.
- [ ] **Revocar token viejo** (ver sección 7).
- [ ] Si llegan planillas de **Salidas** o de otras plantas, importar con el mismo script.
- [ ] Consistencia pendiente (a decisión del usuario): las **entradas** guardaron la columna
      REMITOS en `nroRemitoProveedor`; el usuario confirmó que el nro de remito es de FALPAT.
      Las **salidas** nuevas usan `nroRemitoFalpat`. Quedó así por ahora.

### EN CURSO (sesión 2026-08-10, dev): Informes → Entradas/Salidas/Ventas separados

- [x] `app/informes/page.js`: en Stock y Comparativo ahora hay **3 secciones**:
      Entradas (donut), Salidas (donut) y **Ventas del período** (barras horizontales
      por producto+unidad, sin mezclar tn con kg).
- [x] La antigua "Diferencia" (entradas − salidas) se **reemplazó por Ventas del período**
      (a pedido del usuario): en este negocio cada Salida es una venta a cliente, así que
      Ventas = Salidas, pero se muestra como gráfico de barras distinto (color cyan/teal)
      para no confundirse con los 2 donuts.
- [x] Totales de stock: `entradasMovs`, `salidasMovs`/`ventasMovs`, `promedioEntrada`,
      `promedioVenta` (solo filas `tn`; tn/movimiento) + franja resumen con movimientos y promedios.
- [x] PDF fiel a pantalla: 2 donuts lado a lado + sección "VENTAS DEL PERÍODO" con barras
      horizontales (rects jsPDF), leyenda máx. 7 ítems + "+ N más".
- [x] `npm run lint` y `npm run build` OK. OJO: correr `build` con el dev server activo
      corrompe `.next` (dev server da 500); reiniciar el dev server después.
- [x] Promoción a producción (commit + push a `main`) en esta sesión.

### RESUELTO en la sesión 2026-08-10 (dev; pendiente merge a main)

- [x] Fila `T` de Salida.xlsx → **eliminada** (remito 20856, GLATTI GLADYS). No estaba en la base.
- [x] Fila `BA` de Salida.xlsx → es **AF / ARENA FINA** (remito 20339, ALMAJO SARGENTO, 4 tn):
      corregida en el Excel fuente y **importada** (1 registro nuevo).
- [x] **MS 453** → unidad correcta es **kg**: catálogo + 2 registros corregidos, duplicados en `u`
      eliminados.
- [x] Pendiente UI: **filtro del Panel roto** + **filtro por mes/año** en Reportes e Informes con
      etiqueta de filtros aplicados (desde/hasta como opción secundaria).

### HECHO en la sesión 2026-08-09 (ya desplegado a producción)

- [x] Importadas las 709 salidas a `dev` y **merge a `main`** junto con el fix de 1 MiB (blob API).
- [x] Panel rediseñado: top bar (botones + mini stats), navegador de registro con todos los campos,
      tabla compacta con columna sticky, y **filtro por carga (Todos/Entradas/Salidas)**.
- [x] Sección **Informes** (generador gerencial): 6 tipos de informe, donut, Excel/PDF con logo,
      columna Diferencia y Saldo, sumas corregidas (el "14" era el conteo de productos).
- [x] Sección **Reportes** restaurada (el informe original) + menú con Reportes arriba de Informes.
- [x] Filtros **Desde/Hasta ahora aplican a todos los tipos de informe** (antes solo a movimientos).
- [x] Opciones de los selects de Informes con `bg-night-900` (mismo look que Reportes).
- [x] Producción verificada: `https://stock-gamma-inky.vercel.app/` con 2576 records.

---

## 10. PARA QUE UNA IA SE PONGA AL TANTO RÁPIDO (checklist)

1. Leer este archivo completo.
2. `git status` y `git log --oneline -5` para ver el estado real.
3. Levantar `npm run dev` y abrir `http://localhost:3000` (usa rama `dev`).
4. Chequear `GET /api/db` (2577 records en dev / 2576 en producción).
5. NO tocar producción sin probar en `dev` primero y sin que el usuario lo apruebe.
