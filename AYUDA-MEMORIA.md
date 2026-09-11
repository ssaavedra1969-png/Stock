# AYUDA MEMORIA — FALPAT Stock

_Última actualización: 2026-09-11. Leer esto completo antes de tocar nada._

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
- Verificación rápida de datos: `GET /api/db` debe responder `200` con `records.length === 2908` (dev y main).

### Proceso al hacer cambios (flujo actual)

1. Probá en `dev` (`.env.local` apunta a `dev`).
2. Cuando el usuario aprueba → `git add` + `git commit` + `git push origin main`.
3. Vercel despliega solo desde `main` (ramas: `main` = producción, `dev` = prueba).
 4. Verificar después del deploy: home, `/informes`, `/reportes`, `/api/db` (2908 records).

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
  - `app/informes/page.js` → **Informes**: generador gerencial. Tipos: **Informe General**
    (default, 5 secciones numeradas: 01 Ventas, 02 Entradas, 03 Stock a la fecha por material
    —acumulado histórico independiente del período, ordenado por nombre—, 04 Evolución mensual
    12 meses, 05 Alertas de stock) + detalle operativo (Entradas, Salidas, Movimientos,
    Stock por planta). Los tipos "Stock actual" y "Comparativo E/S" fueron REEMPLAZADOS por el
    Informe General (decisión del usuario). Estética dashboard oscura estilo Glamour's Control:
    panel glass, stat-cards con línea superior degradada por color, tipografía Plus Jakarta Sans
    (`.font-display` en globals.css), tablas oscuras mono, badges. Exportación Excel/PDF: PDF del
    General = carátula + una página por sección con encabezado propio (logo + título de sección +
    período); Excel del General = libro con 5 hojas. PDF/Excel de detalles = formato claro.
  - `app/incorporar/page.js` + `lib/importar.js` → **Incorporar**: carga masiva desde las
    plantillas Excel (Entradas/Salidas) con validación fila por fila, preview y confirmación.
  - `app/api/db/import/route.js` → API de importación masiva (lotes, dedupe, recalcula productos).
  - `scripts/generar-plantillas.mjs` → regenera `public/plantillas/Plantilla-Entradas.xlsx` y
    `Plantilla-Salidas.xlsx` (se descargan desde /incorporar).
  - `public/plantillas/*.xlsx` → plantillas versionadas que usa la app (NO borrarlas del repo).
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

## 4. ESTADO ACTUAL DE LOS DATOS (2026-09-11)

- El 2026-09-11 se **reconstruyó `data/db.json` desde cero** con
  `scripts/reconstruir-db.mjs` usando las plantillas completas
  `entrada/plantillas/Plantilla-Entradas_05.xlsx` (2124 filas) y
  `Plantilla-Salidas_05.xlsx` (784 filas). Antes del borrado se respaldó la base previa en
  `backup/db-backup-2026-09-11.json` (2733 registros).
- **2908 registros** (2124 `Entrada` + 784 `Salida`), planta `Lujan`, rango de fechas
  **2026-01-01 → 2026-09-09**.
- Resumen por producto verificado contra los Excel (conteos y sumas idénticos, 0 descartes):

  | Código | Producto | Unidad | Stock (E−S) |
  |--------|----------|--------|-------------|
  | AF | ARENA FINA | tn | **+2.686,80** |
  | C | CPF 40 AVELLANEDA | tn | **+504,25** |
  | E020 | ESTABILIZADO GRANULOMETRICO 0/20 | tn | **−155,46** |
  | E100 | ESTABILIZADO 0-100 X TN | tn | **−2.638,50** |
  | MFB | MAPEFILL E BASGS 25KG | bolsas | +70,00 |
  | MS 453 | MIRA SET 453 (ADITIVO) | kg | **−30,08** |
  | P06 | PIEDRA 0-6 | tn | **+1.581,65** |
  | P1030 | PIEDRA 10-30 | tn | **−997,25** |
  | P612 | PIEDRA 6-12 | tn | **+703,62** |
  | P620 | PIEDRA 6-20 | tn | **+1.401,19** |
  | RDC | RDC DRUMS 200 KG | tambores | +1,00 |
  | S45 | SELLADOR (MAPEFLEX…) | u | +100,00 |
  | W | W351R | u | +19.154,98 |
  | W5 | W500R | u | +3,00 |

- Sanity check global: Σ entradas **73.794,83 tn** − Σ salidas **70.708,53 tn** = **STOCK TOTAL
  3.086,30 tn**. **4 productos con stock negativo** (sección 05 Alertas): MIRA SET 453 −30,08 kg;
  ESTABILIZADO GRANULOMETRICO 0/20 −155,46 tn; PIEDRA 10-30 −997,25 tn; ESTABILIZADO 0-100 X TN
  −2.638,50 tn. Causa probable: faltan registrar entradas históricas.
- **Decisión del usuario (2026-09-11):** al recargar desde las plantillas _05 se **descartaron los
  registros que NO estaban en los archivos** — 12 entradas PIEDRA 10-30 (prov. CAMPANA, ago 2026,
  ~385 tn) y 2 entradas MS 453 (prov. ALVARO). Por eso P1030 y MS 453 hoy tienen stock negativo.
- El formato de registro resultante es el del importador `lib/importar.js` (sin
  patente/chofer/pesoProveedor, que la plantilla CARGA no trae).

---

## 5. BACKUP DE DATOS (LO MÁS IMPORTANTE)

**Regla de oro: nunca dejar el repo con `data/db.json` sin commitear. Cada commit es un backup.**

- Backup principal: `data/db.json` commiteado en `main` → respaldo en **git history**
  + **GitHub** (remoto) + **Vercel**.
- Snapshot explícito: `backup/db-backup-YYYY-MM-DD.json` (copia fechada de `data/db.json`,
  commiteada). Hoy: `backup/db-backup-2026-09-11.json` (2.733 registros, la base previa a la
  reconstrucción). Anterior: 2026-08-10 (2.587).
- Fuente original de la carga: `entrada/Entrada.xlsx` (también está versionado en el repo) y las
  plantillas `entrada/plantillas/Plantilla-{Entradas,Salidas}_05.xlsx`.
- **Restaurar**: tomar el contenido de un backup y subirlo a la rama deseada vía la API de
  contenidos de GitHub (PUT a `data/db.json`) o reemplazando el archivo local + commit + push.
- Verificación de integridad: comparar hash entre local y remoto
  (`node` + `createHash('sha256')` sobre el contenido) o chequear `GET /api/db` (2908 records).

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
6. **PowerShell corrompe tildes en archivos UTF-8**: `Add-Content`/`Set-Content` escriben ANSI.
   Si hay que escribir desde PowerShell, usar
   `[IO.File]::WriteAllText($ruta,$texto,[Text.UTF8Encoding]::new($false))`; la herramienta de
   edición de la IA escribe UTF-8 correcto (preferirla siempre). Síntoma: "C�digo", "�ltimo".

---

## 9. PENDIENTES / PRÓXIMOS PASOS

- [ ] **Completar datos reales de la empresa en `lib/company.js`** (address, phone, email, cuit,
      web) para que aparezcan en el encabezado de los informes exportados.
- [ ] **Revocar token viejo** (ver sección 7).
- [ ] Si llegan planillas de **Salidas** o de otras plantas, importar con el mismo script.
- [ ] Consistencia pendiente (a decisión del usuario): las **entradas** guardaron la columna
      REMITOS en `nroRemitoProveedor`; el usuario confirmó que el nro de remito es de FALPAT.
      Las **salidas** nuevas usan `nroRemitoFalpat`. Quedó así por ahora.

### EN CURSO → HECHO (sesión 2026-09-11): Reconstrucción de la base desde plantillas _05

- [x] **Reconstrucción completa de `data/db.json`** con `scripts/reconstruir-db.mjs` desde las
      plantillas `Plantilla-Entradas_05.xlsx` (2124 filas) y `Plantilla-Salidas_05.xlsx`
      (784 filas) → **2908 registros** (0 descartes), fechas 01/01→09/09/2026.
- [x] Backup previo sin pérdida: `backup/db-backup-2026-09-11.json` (2733 registros).
- [x] Decisión del usuario: **no conservar** los 14 registros que no estaban en los _05
      (12 P1030 CAMPANA + 2 MS 453). Stock por producto verificado 1:1 contra los Excel.
- [x] Migración de gráficos del Informe General a **Chart.js**: nuevo `components/Charts.js`
      (ChartCard/GlamDoughnut/GlamBars/GlamLine con estética Glamour's), `chart.js` +
      `react-chartjs-2` en package.json, refactor en `app/informes/page.js`. Se quitaron los
      orbs/grid/noise de `layout.js` y el radial-gradient de `globals.css`. lint/build OK.
- [ ] Commit + push a main (y sincronizar rama `dev`) de: datos reconstruidos + script + backup
      + gráficos Chart.js + AYUDA-MEMORIA.

### EN CURSO → HECHO (sesión 2026-08-24): Incorporar + Informe General + estética dashboard

- [x] **Módulo /incorporar**: descarga de plantillas Excel (`public/plantillas/`), carga con
      preview/validación y API masiva `POST /api/db/import`. El usuario ya importó 59 entradas.
- [x] **Informe General** (tipo default): reemplaza a "Stock actual" y "Comparativo E/S".
      Secciones: 01 Ventas, 02 Entradas, 03 Stock a la fecha por material (histórico,
      independiente del período, orden alfabético por nombre — pedido explícito del usuario),
      04 Evolución mensual 12 meses, 05 Alertas de stock (NEGATIVO/SIN STOCK).
- [x] **Estética dashboard oscura** estilo Glamour's Control (referencia del usuario:
      glamours-control.vercel.app/reportes): panel glass `bg-night-900/70` + blur, stat-cards
      con línea superior degradada, chips numerados con glow por color de sección
      (SECCION_COLORS), tablas oscuras mono, badges tintados, `.font-display` = Plus Jakarta Sans.
      Aplica a TODOS los tipos de informe en pantalla; el PDF sigue claro/imprimible.
- [x] PDF General: carátula (chips globales + índice CONTENIDO) + una página por sección con
      encabezado propio en cada hoja (logo + título sección colorizado + período). Excel General:
      libro de 5 hojas (Ventas/Entradas/Stock/Evolucion/Alertas).
- [x] Fixes durante la sesión: pie de tabla autoTable perdía `colSpan` (números caían en columnas
      angostas y se partían en 2 líneas) → mapear foot con `{ content, colSpan }`; anchos Peso/Saldo
      medidos con jsPDF real (19/21mm); corrupción UTF-8 al escribir JSX con PowerShell
      (ver gotcha 6 abajo); stock de la sección 03 ordenado por nombre.
- [x] lint/build OK. Promoción a producción (código + datos dev→main) ejecutada.

### RESUELTO sesiones anteriores (ya en main)

- [x] Fila `T` de Salida.xlsx eliminada; fila `BA` importada como AF/ARENA FINA.
- [x] MS 453 en kg: catálogo + registros corregidos, duplicados en `u` eliminados.
- [x] Informes 2026-08-10 (secciones E/S/Ventas) quedó SUPERADO por el Informe General.

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
4. Chequear `GET /api/db` (2908 records en dev y en producción).
5. NO tocar producción sin probar en `dev` primero y sin que el usuario lo apruebe.
