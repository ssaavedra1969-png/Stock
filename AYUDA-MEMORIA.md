# AYUDA MEMORIA — FALPAT Stock

_Última actualización: 2026-10-22. Leer esto completo antes de tocar nada._

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
7. **Preview de Vercel con SSO/deployment protection**: `vercel deploy --yes --json` genera URLs
   `*.sandro1969.vercel.app` que piden login de Vercel. Un script/curl recibe la página de login con
   HTTP 200, así `GET /api/db` "devuelve" un HTML que se lee como `records: 0` (no es que no haya
   datos). La **producción** no tiene protección. Para revisar cambios pendientes: `npm run dev`
   local (sin login) o abrir la preview logueado con la cuenta Vercel del usuario.

---

## 9. PENDIENTES / PRÓXIMOS PASOS

- [ ] **Completar datos reales de la empresa en `lib/company.js`** (address, phone, email, cuit,
      web) para que aparezcan en el encabezado de los informes exportados.
- [ ] **Revocar token viejo** (ver sección 7).
- [ ] Si llegan planillas de **Salidas** o de otras plantas, importar con el mismo script.
- [ ] Consistencia pendiente (a decisión del usuario): las **entradas** guardaron la columna
      REMITOS en `nroRemitoProveedor`; el usuario confirmó que el nro de remito es de FALPAT.
      Las **salidas** nuevas usan `nroRemitoFalpat`. Quedó así por ahora.

### EN CURSO (sesión 2026-10-19): /tickets — base de conocimiento automática + mapa de hojas + validación

**Contexto:** el módulo `/tickets` lee PDFs de pesaje (2 páginas: hoja 1 = remito del proveedor,
hoja 2 = ticket de balanza FALPAT) y arma una tabla editable para incorporar a
`Stock-Historico.xlsx`. Hoy se trabajó en (a) auto-poblar una **base de conocimiento**, (b) el
**cruce entre hojas**, (c) **marcar en rojo** lo que sale de lo normal y (d) entender el
**mapa de cada hoja** (ver abajo). Todo probado en la rama `dev`.

**Continuidad al 22/10/2026:** el código de esta funcionalidad está sincronizado en GitHub en
`main`. La base de conocimiento aprendida dinámicamente está en `data/base.json` de la rama
remota `dev` (se confirmó que el archivo existe allí); la base curada y las correcciones exactas
por archivo están en `lib/tickets/base.mjs`. Son datos de lectura: no equivalen al histórico de
movimientos. No se incorporaron registros a `data/db.json` ni se movieron PDFs en esta revisión.

La carpeta de origen tenía 47 PDFs (uno menos que los 48 mencionados inicialmente). Se leyeron
con OCR, pero deben seguir revisándose individualmente; no asumir que el estado visual de la
tanda del navegador se traslada a otra PC. Para cada archivo, presentar OCR, pedir confirmación,
guardar únicamente campos confirmados y no incorporar/mover el PDF sin la autorización y
verificación correspondiente.

Correcciones confirmadas que se deben conservar:
- `img-261019134610-001.pdf` (SPOSITO): remito `65971`, material `ARENA MODULO 1.8-1.9`,
  Neto `36.200`. Fecha, Peso Neto, chofer y patente no confirmados.
- `img-261019121018-001.pdf` (SPOSITO): fecha `15/10/2026`, remito `66008`, material
  `ARENA MODULO 1.8-1.9`, Neto `34.400`, Peso Neto `35.920`, chofer `OCHOA ANIBAL`.
  Patente no confirmada.
- `img-261019121152-001.pdf` (LCE): material `ARENA GRANITICA 0/6`; los demás campos no
  quedaron confirmados.
- `img-261019121422-001.pdf` (LCE): fecha `15/10/2026`, remito `112388`, material
  `ARENA GRANITICA 0/6`, Neto `34.960`, Peso Neto `34.540`, chofer `LEDESMA CAMILO`.
  Razón social y patente no confirmadas.

Las cuatro correcciones están asociadas al nombre exacto del archivo en
`BASE.correccionesPorArchivo`, en `lib/tickets/base.mjs`. Los catálogos de materiales y razones
sociales, incluidos alias y lecturas pendientes de confirmar, están documentados en las tablas
de esta guía.

#### Hecho en esta sesión

- **`lib/tickets/base.mjs` (NUEVO)** — base de conocimiento CURADA a mano:
  `{ patentes, choferes, netos, patentesPorTicket }`.
  - `patentes[APELLIDO] = ['AH919IQ']` (una o varias si el chofer cambió de camión).
  - `choferes[APELLIDO] = 'NOMBRE COMPLETO'`.
  - `netos['EMPRESA|NRemito'] = '35.080'` (solo curado a mano; ver nota de Neto abajo).
  - `patentesPorTicket['EMPRESA|NRemito'] = 'AH784OW'`.
- **`lib/tickets/extract.mjs`** — motor OCR + aprendizaje:
  - `patenteConocida(chofer, ocr, hint, base)`: prioridad 1) base curada, 2) base aprendida,
    3) apellido parecido (tolera 1-2 letras mal: `BIACENTINI`→PIACENTINI), 4) sin chofer: si lo
    leído solo difiere en dígitos (≤2) de una patente conocida, la corrige (`AG854ER`→`AG894ER`).
  - `aprenderDeFilas(filas)` → correlaciones verificadas de una tanda. **NO aprende Neto** (los
    números varían; se curan a mano). Devuelve `patentes`, `choferes`, `patentesPorTicket`.
  - `unirBase(...bases)`: combina bases (la curada tiene prioridad para el mismo apellido).
  - `extractChofer(...texts)`: reconoce `TRANSPORTISTA` (hoja 2) y `CHOFER` (hoja 1) y ahora
    **elige el nombre MÁS COMPLETO** (la balanza corta: `VIVAS LEONEL`; el remito trae
    `VIVAS ARNALDO LEONEL`).
  - `extractRemito(text1, text2, company)`: **cruce entre hojas** — junta candidatos de las dos
    hojas y, sabiendo el largo esperado por proveedor (**LCE 6, AVE 7, SPO 5**), elige el que
    tiene el largo correcto. Regex LCE ahora tolera **dígitos separados por espacios y guion
    largo**: `N° 0 0 02 -00 1 1 2 2 8 4` → `112284`.
  - `extractNeto(text1, company, remito, pesoKg)`: banda `[28.000, 45.000]` kg (arena ~35 tn,
    piedra con semi ~40 tn) y exige **cercanía ±2.000 kg** al Peso Neto de balanza.
  - `parseNum` reescrito: maneja dos comas de miles (`40,920,00` → 40920), `36.480`, `36 480`,
    `1.234,56`, etc.
  - `revisarRegistro(rec)` (NUEVO) → `{ campo: motivo }` para pintar en rojo.
- **`app/api/base/route.js`** — `GET` devuelve la base (`data/base.json`); `POST
  { filas, reemplazar? }` corre `aprenderDeFilas` + `unirBase` y guarda con `writeJson`
  (`reemplazar:true` reemplaza el archivo). Probado: escribió `data/base.json` en la rama `dev`.
- **`lib/github.js`** — `readJson(path)` / `writeJson(path, mutate, message)` genéricos
  (404 → `{ sha:null, db:null }`); `readDb`/`writeDb` son wrappers de `data/db.json`.
- **`lib/api.js`** — `fetchBase()` / `saveBase(filas)`.
- **`context/AppContext.js`** — carga `data/base.json` al iniciar, la expone como
  `baseConocimiento` y `guardarBase(filas)`; `procesarTickets` une `base persistida +
  learnFromRecords(records) + base curada` antes de leer.
- **`app/tickets/page.js`** — al **Incorporar** llama `guardarBase(filas)`. Además, **todo campo
  en rojo es clickeable y abre el PDF** de ese registro (no solo los `N/D`).
- **Motor OCR activo (actualizado 2026-10-22):** `lib/tickets/ocr.mjs` usa `pdfjs-dist` para
  leer/renderizar las páginas y `tesseract.js` para reconocer texto en el navegador. La ruta
  antigua `LECTURA/procesar_tickets.py` no es el motor de `/tickets`; para la lectura web no se
  necesita instalar Python ni Tesseract.
- **Validación visual** (`revisarRegistro`, en `extract.mjs`): marca en rojo
  - sin dato (`N/D`), Neto/Peso Neto fuera de `RANGO_PESO` (hoy `[28.000, 45.000]`),
  - Material no habitual, Patente con formato inválido, Remito con largo distinto al del
    proveedor, Fecha inválida o fuera de rango (±90 días desde hoy).
- **QA** (`_qa/`): `render_browser.mjs` (renderiza PDFs con **pdf.js**, el mismo motor del
  navegador, a `%TEMP%\opencode\tickets_png_browser`), `harness.mjs` (OCR con tesseract.js sobre
  esos PNG: env `PNG_DIR`, `PSM`, `STEMS`), `full_dbg.mjs` (vuelca el texto OCR completo de p1/p2
  de un stem). Patentes verificadas **15/15** sobre las imágenes pdf.js.

#### MAPA DE HOJAS (clave: la hoja 1 cambia por proveedor, la hoja 2 NO)

> Regla del usuario: **las 1ª hojas de los 3 proveedores difieren; la 2ª hoja es de la balanza
> (siempre el mismo sistema de acá), así que no debería diferir demasiado.**

> **PROVEEDOR ≠ RAZÓN SOCIAL (aclaración del usuario 2026-10-19). Son EMPRESAS DISTINTAS.**
> - **Proveedor** = emisor del remito: `SPOSITO` / `LCE (CANTERAS)` / `CEMENTO AVELLANEDA`.
> - **Razón Social** = empresa dueña de la mercadería: `ARENERA CANELONES` / `ALMAJO NORTE`.
>   **Se lee del documento**, no se deriva del proveedor. Fuente: el rótulo `Razon Social:` de
>   la hoja 1 (o el `PROVEEDOR:` de la balanza, que en realidad trae el dueño de la mercadería).
>   **Puede variar por ticket aunque el proveedor sea el mismo** (ej. LCE puede traer
>   `ARENERA CANELONES` o `ALMAJO NORTE`). Se canoniza a esas dos razones sociales.
>   Implementado en `extractRazonSocial()` (`lib/tickets/extract.mjs`); el `razon` de
>   `COMPANIES` es solo el valor por defecto.

**HOJA 2 — TICKET DE BALANZA (igual para los 3, sistema propio):**
```
GRUPO FALPAT S.R.L  ... TICKET DE BALANZA   DOCUMENTO N°: 0000-00032502
FECHA 13-10-2026
PROVEEDOR: <nombre> (CUIT del material, NO el emisor)
MATERIAL: PIEDRA PARTIDA 6/20
ENTRADA ... PESO BRUTO 53.480 Kg.   SALIDA ... TARA 17.000 Kg.
PESO NETO 36.480 Kg
Remito :08-00065982          <-- (SPO) o "Remito 112277" (LCE) o "Remito : 166403" (AVE)
TRANSPORTISTA <CHOfer> CUIT: ...
Pat. Chasis. AG266CG          <-- patente (OCR suele cambiar letras; KB la corrige)
Pat. Acopl.  AF335WU
Firma Transportista ...
```
Fuente fiable de: **Peso Neto**, **Remito** (para LCE/AVE), **Chofer**, **Patente**, **Material**.

**HOJA 1 — SPOSITO** (factura/remito, NO trae peso):
```
EMPRESA ... 000% -00065982        <-- remito (OCR sucio)
Empresa Sposito S.A. ... CUIT: 33-50674358-9
... ARENA ... (cantidad en m3, sin kg)
```
→ **Neto = N/D es NORMAL en SPO** (el remito no declara kg; el peso real es el de balanza).

**HOJA 1 — LCE / CANTERAS S.A.** (remito con tabla de pesos):
```
CANTERAS S.A. ... REMITO  N° 0 0 02 -00 1 1 2 2 8 4   (dígitos con espacios)
Razon Social: ARENERA CANELONES / CONSTRUCTORA ALMAJO NORTE
MATERIAL | BRUTO        TARA        NETO
PIEDRA GRANITICA DE 6 A 20 MM  60.220,00  19.300,00  40,920,00
CHOFER <NOMBRE COMPLETO>
CHASIS | ACOPLADO  <patente chasis>  <patente acoplado>
```
→ Neto = **último número de la línea del material** (BRUTO − TARA).

**HOJA 1 — CEMENTO AVELLANEDA** (remito con "Cantidad"):
```
CEMENTOS AVELLANEDA  ... -R- Remito Nro. 0108-00186403
Linea Material Concepto um. Cantidad ...  10 80052 Piedra triturada 6-20 mm T  35.330 ...
Turno Fecha Arribo ... Tara        Peso
... 17.670,000  53.000,000      <-- BRUTO
Chofer: <NOMBRE>   Patente Camion: AH702XX  Patente Acoplado: ...
```
→ Neto = **"Cantidad"** (BRUTO − TARA).

#### Patentes verificadas (KB) y NUEVAS a confirmar

Confirmadas: PIACENTINI→AH919IQ · LEDESMA→AH919KE · TOLOSA→AH784OY · GARCIA→AG266CJ **y**
AE403QQ · OCHOA→AG894ER · PRIMITERRA TONINO→AH702XY · AGUERO TOMAS AGUSTIN→AH702YZ ·
ALONSO→AH702XX · RODRIGUEZ MATIAS→AH784OX · WILBERGER→AH784OW.

**NUEVOS choferes (aparecen en los archivos nuevos, FALTA CONFIRMAR PATENTE):**
- **ORTIZ CRISTIAN** → leído `AH436NY` / `AH43GNY` / `AH430NY` (¿AH4**3**6NY o AH4**3**0NY?)
- **DIERICKX CARLOS** → leído `AH804KL` / `AH504KL` / `AHE04KL` (¿AH**8**04KL?)
- **VIVAS ARNALDO LEONEL** → **semi (camión + acoplado, ~40.000 kg)** → leído `AI417ZZ` /
  `AL417ZZ` / `Al4172Z` (¿AH417ZZ?); acoplado `AI484IC` / `AI484IC`.

#### Pendiente de decidir (mañana)

1. **Confirmar las 3 patentes nuevas** para cargarlas en `base.mjs`.
2. **Rango de pesos**: el usuario dijo 34.000–37.000 kg, pero VIVAS (semi) transporta ~40.000 kg
   de piedra. Hoy `RANGO_PESO = [28000, 45000]` para no marcarlo en rojo. Definir si el rango
   debe ser por material/chofer o queda ancho.
3. **Neto en SPO**: confirmar que `N/D` es correcto (el remito de SPO no trae kg).
4. Reprocesar los ~33 archivos nuevos (se abortó el harness) y revisar registro por registro.

#### Estado técnico

- Nota histórica (19/10): el servidor se usó en `http://localhost:3001/tickets` porque el puerto
  3000 estaba ocupado. En otra PC, iniciar con `npm run dev` y usar 3001 solo si hace falta.
- Evitar ejecutar `npm run build` con el servidor dev activo en el mismo directorio `.next`.

### EN CURSO → HECHO (sesión 2026-10-16): Módulo /tickets (lectura OCR de tickets de pesaje)

- [x] **Nueva sección `/tickets`** (menú en Sidebar): se suben PDFs de pesaje (2 páginas:
      remito + ticket de balanza) desde el navegador; el servidor hace OCR con **Python +
      Tesseract** (`LECTURA/procesar_tickets.py`), muestra una **tabla editable** con los campos
      extraídos y un botón **Incorporar**.
- [x] **Incorporar** (este módulo) **NO toca los datos de la app** (`data/db.json`): sólo
      (1) archiva los PDFs en `\\Admin1\compartida\Administracion\STOCK\procesados`
      renombrados `AAAAMMDD_EMPRESA.pdf`, y (2) acumula los registros en **un único Excel
      histórico** `\\Admin1\compartida\Administracion\STOCK\Salida\Stock-Historico.xlsx`
      (dedupe por `Proveedor|N Remito`). Ese Excel es también la base de conocimiento.
      **La carga del Excel a la app quedó para la 2ª etapa** (a través de /incorporar).
- [x] Columnas del Stock-Historico (11): Fecha, Proveedor, N Remito, Razon Social, Material,
      Neto, Peso Neto, Chofer, Pat. Chasis, **Centro** (Lujan/Campana) y **Carga**
      (Entrada/Salida). Centro y Carga los elige el operador (obligatorios).
- [x] **Proveedor: se detecta por el ENCABEZADO de la hoja 1** (remito), no por el nombre del
      archivo: 1) CUIT del emisor (AVELLANEDA 30-52604779-2, LCE 30-71569497-9, SPOSITO
      33-50674358-9), 2) nombre/razón, 3) dirección/email, 4) nombre de archivo (último
      recurso). Se ignora el CUIT del destinatario (ARENERA CANELONES 30-71452525-1).
- [x] OTROS arreglos OCR: fecha desde p1 y respaldo p2; Peso Neto sin sufijo Kg y con
      separadores de miles; Neto y patentes con `NETO_OVERRIDE` / `PATENTE_OVERRIDE` por
      `(empresa, remito)` para casos ya verificados; celda N/D clickeable para ver el PDF.
- [x] Rutas nuevas: `app/api/tickets` (subida+OCR), `app/api/tickets/commit` (archiva + Excel),
      `app/api/tickets/pdf` (sirve el PDF original). Requiere **Python + Tesseract** y acceso a
      la carpeta de red → **corre SOLO en la PC del estudio**. En **Vercel** las 3 rutas
      devuelven 501 con mensaje claro (la página/menú sí se ven). Env configurables:
      `TICKETS_ENTRADA/PROCESADOS/SALIDA/HISTORICO/KB`, `PYTHON_BIN`, `LECTURA_DIR`.
- [x] lint + build OK. Pendiente del usuario: probar el circuito completo desde la PC del estudio.

### EN CURSO → HECHO (sesión 2026-09-12): Filtros de período por sección + sidebar colapsable + rediseño del bloque de filtros

- [x] **Filtros de período propios por sección en el Informe General**: las secciones 01 (Ventas)
      y 02 (Entradas) tienen cada una su filtro Mes/Año + Desde→Hasta (`SeccionFiltro`), independiente
      del filtro global. Helpers en `app/informes/page.js`: `filtrarPeriodo`, `agregarSeccion`,
      `descripcionPeriodo`.
- [x] **Sidebar colapsable**: nuevo `components/AppShell.js` (estado local `sidebarCollapsed`),
      `app/layout.js` lo usa, `components/Sidebar.js` con toggle (w-20/w-64, chevrons, oculta
      labels/QuickStats al colapsar) para ver la app en pantalla completa.
- [x] **Rediseño del bloque "Filtros del informe"** (para no duplicar el período): en el tipo
      **General** se oculta el filtro global Mes/Año/Desde→Hasta y se muestra un aviso (IconCalendar)
      de que el período se filtra dentro de cada sección 01/02; el encabezado dice
      "Período: por sección (01 Ventas · 02 Entradas)"; los chips de "Filtros aplicados" muestran los
      períodos activos por sección; "Limpiar" global resetea también `ventasF`/`entradasF`. En el resto
      de tipos el bloque de período global queda igual.
- [x] Commits: `eb9eb82` (filtros por sección + sidebar, aprobado y **en producción** al mediodía) y
      `9be1588` (rediseño del bloque de filtros, trabajado en la rama `mejora-filtros-seccion`,
      aprobado al final del día → merge fast-forward a `main`). **Vercel prod verificado**: `/api/db`
      2908 records, `/informes` 200.
- [x] `.gitignore`: agregados `.vercel` y `.env*` (el `vercel link` rellena `.env.local`).

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
- [x] Commit + push a main y sincronización de `dev`. **Ojo (2026-09-11):** la sesión que se
      colgó había pusheado a `main` 4 commits con imports erróneos (ALVARO como *entrada*,
      P1030-CAMPANA, MS 453, ALMAJO 01/09). Se resolvió con merge `-X ours`: prevaleció la
      reconstrucción desde plantillas _05. **Vercel quedó con 2908 registros (2124 E + 784 S).**

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

### EN CURSO (sesión 2026-10-22): automatización y precisión de lectura PDF

**Objetivo:** que `/tickets` lea los PDFs de `STOCK\Entrada` desde la carpeta STOCK seleccionada,
extraiga cada dato de su ubicación correcta en el remito/ticket y mantenga la revisión antes de
incorporar al histórico. El muestreo no debe mover ni modificar PDFs.

#### Diagnóstico inicial

- Se tomó una muestra aleatoria de 6 de los 47 PDFs de
  `\\Admin1\compartida\Administracion\STOCK\Entrada`. El procesador Python se ejecutó en
  `--dry-run`; no movió ni guardó archivos.
- Se comprobó también el extractor que usa realmente la página: `lib/tickets/ocr.mjs` +
  `lib/tickets/extract.mjs` en el navegador (pdf.js/Tesseract.js). `LECTURA/procesar_tickets.py`
  es una ruta antigua y no es el motor actual de la pantalla.
- Hallazgo visual confirmado en un remito LCE: el material impreso es **PIEDRA GRANÍTICA DE 6 A 12 MM**
  y el ticket dice **PIEDRA PARTIDA 6/12**; el extractor actual devuelve incorrectamente
  `PIEDRA PARTIDA 6/20`, porque clasifica cualquier texto que contenga `PIEDRA` como 6/20.
- En esa muestra, el extractor JS aceptó `712004` tomado de un pie de factura LCE como N Remito,
  aunque el encabezado del remito muestra `00112230` y el ticket tiene una lectura incompleta
  (`11230`). La búsqueda debe limitarse a la zona/campo `REMITO` y contrastar ambas hojas; no
  aceptar números sueltos de la página.
- `/tickets` permite elegir la carpeta STOCK para leer el Excel y archivar, pero aún requiere
  seleccionar los PDFs a mano. Se completará la lectura directa de la subcarpeta `Entrada`, sin
  alterar la selección manual de Centro/Carga ni la revisión antes de incorporar.

#### Criterio de trabajo

- Documentar hallazgos y cambios aquí a medida que se realicen.
- Cambiar solo datos cuya ubicación/formato estén confirmados; ante discrepancias u OCR ambiguo,
  marcar el campo para revisión en vez de inferirlo.
- Validar el extractor con los PDFs muestreados y una muestra adicional antes de cerrar el tema.

#### Tablas de consulta OCR: materiales y razón social

La razón social identifica al dueño del material y no es el proveedor que emite el remito.
El proveedor sirve como valor de respaldo, no como confirmación: si no se encuentra una razón
social en el documento, el campo permanece marcado para revisión.

| Valor normalizado | Variantes / regla de lectura | Estado |
|---|---|---|
| `ARENA FINA` | `ARENA FINA` | Tipo conocido |
| `ARENA MODULO 1.8-1.9` | `ARENA MODULO 1,8-1,9`; se normaliza la coma decimal y espacios | Tipo conocido |
| `ARENA GRANITICA 0/6` | Debe aparecer evidencia de `ARENA`, `GRANITICA` y medida `0/6` | Tipo conocido; no confundir con piedra granítica |
| `PIEDRA PARTIDA 0/6` | `PIEDRA GRANITICA 0/6` es equivalente si coinciden las medidas | Tipo conocido |
| `PIEDRA PARTIDA 6/12` | `PIEDRA GRANITICA 6/12`; OCR `B12` solo si acompaña a `PIEDRA`/`GRANITICA` | Tipo conocido |
| `PIEDRA PARTIDA 6/20` | `PIEDRA GRANITICA 6/20`; OCR `G20` o `E20` solo si acompaña al nombre de piedra | Tipo conocido |
| `PIEDRA PARTIDA 10/30` | `PIEDRA GRANITICA 10/30` | Tipo conocido |
| `CTO AVELLANEDA` | `CEMENTO AVELLANEDA` / `CTO AVELLANEDA` | Tipo conocido |
| `ARENA GRANITICA 0/8`, `PIEDRA PARTIDA 8/20` | Aparecieron como lecturas OCR en la tanda; revisar el PDF y confirmar antes de agregarlos al catálogo automático | Pendientes de confirmar |

Los alias de OCR de las medidas (`B12`, `G20`, `E20`) solo se normalizan cuando hay evidencia
explícita de piedra en la misma descripción. Una medida aislada o una descripción que no coincida
con este catálogo no se completa por semejanza: queda pendiente de revisión.

| Razón social normalizada | Variantes legibles | Uso observado |
|---|---|---|
| `ARENERA CANELONES` | `ARENERA CANELONES`; en un campo explícito `RAZON SOCIAL` o `PROVEEDOR`, puede reconocerse si el OCR conservó solo `ARENERA` o `CANELONES` | Frecuente en SPOSITO y CEMENTO AVELLANEDA; también puede aparecer en LCE |
| `ALMAJO NORTE` | `ALMAJO NORTE` o `ALMAJO` | Aparece en remitos LCE |

Si el documento contiene solo la palabra `CANELONES` fuera de un campo de razón social/proveedor,
no basta para clasificarlo; deben aparecer `ARENERA` y `CANELONES` juntos. Si el texto no permite
distinguir las dos razones sociales, conservar la observación para revisión.

#### Avance de implementación

- `/tickets` ahora ofrece **Leer PDFs de Entrada** después de elegir la carpeta STOCK; lista y
  procesa los PDF existentes en `Entrada` sin subirlos a otro servicio. La incorporación y el
  movimiento a `procesados` siguen siendo acciones separadas del análisis.
- El extractor limita la lectura de remitos a zonas de encabezado por proveedor; la hoja 1 de
  SPOSITO/LCE aporta el número del proveedor, la balanza se usa para contrastar y AVE conserva
  como fuente principal el número legible de la balanza. Si la lectura difiere, queda marcada
  para revisión.
- La fecha de la operación se toma primero de `ENTRADA` en la balanza y, si falta, del remito
  del proveedor; la `FECHA` de emisión del ticket de balanza es un dato distinto. En el PDF LCE
  probado, el remito y `ENTRADA` coinciden en `09/10/2026`, aunque la cabecera de emisión indica
  `08/10/2026`.
- El remito LCE se relee en dos recortes separados de la zona superior derecha de la hoja 1,
  donde el número aparece repetido. La lectura real del campo resultó `112230`; si ambas
  referencias son legibles, una discrepancia queda marcada para revisión. La balanza se usa como
  contraste, no para reemplazar un número legible del remito.
- Se agregó una relectura focalizada para la fila de Neto LCE. La muestra real del navegador
  produjo: `PIEDRA PARTIDA 6/12`, Neto `36.360`, Peso Neto `36.060`, chofer
  `WILBERGER JUAN MANUEL` y patente `AH784OW`. El peso coincide con bruto `52.640` menos tara
  `16.580`; no se incorporó el registro ni se modificó el PDF.
- La extracción de material conserva las granulometrías `6/12`, `6/20`, `10/30` y `0/6`, y deja
  en revisión la información insuficiente o contradictoria.
- El usuario confirmó que el número correcto del caso es `112230` y señaló sus dos apariciones
  en la esquina superior derecha de la hoja 1; por eso el extractor LCE consulta ambas zonas y
  prioriza el remito del proveedor.
- Verificación final de esta sesión: lectura real de un PDF LCE en `/tickets` con fecha
  `09/10/2026`, remito `112230`, material `PIEDRA PARTIDA 6/12`, pesos `36.360`/`36.060`,
  chofer `WILBERGER JUAN MANUEL` y patente `AH784OW`. `npx eslint` y `npm run build` pasan; queda
  la advertencia preexistente de dependencias de `useEffect` en `app/tickets/page.js:143`.
- No se incorporaron registros ni se movieron PDFs. La selección real de la carpeta UNC debe
  terminar de probarse desde el navegador de la PC que tiene acceso a `Admin1`; el navegador
  integrado de esta sesión no puede abrir directamente ese host. También queda pendiente
  revalidar OCR real de AVE y SPOSITO en pantalla, aunque sus casos fueron revisados en el muestreo.
- Una nueva muestra aleatoria de 6 PDFs de `Entrada` confirma que el OCR puede devolver lecturas
  plausibles pero equivocadas, especialmente fechas del encabezado, fechas de comprobantes y
  números/patentes. Por eso la forma segura de evitar que un dato dudoso se archive no es
  “confiar más” en una sola pasada: se bloquea la incorporación ante cualquier discrepancia,
  campo inválido o error de lectura.
- `/tickets` ahora muestra todos los registros de la tanda (antes ocultaba visualmente los que
  superaban 200), impide incorporar si queda cualquier error de PDF o campo marcado y requiere
  una confirmación expresa de revisión visual de cada registro contra el original. Editar una fila
  reinicia esa confirmación. También se contrastan las fechas de operación entre remito y
  `ENTRADA`, los materiales entre hojas y el Neto del remito con el peso de balanza.
- Una razón social que no pudo leerse explícitamente ya no se trata como dato confirmado: queda
  marcada para revisar, junto con su validación contra las dos razones sociales admitidas.
- Se ajustó la validación de remito AVE a 6 dígitos (corroborado en los tickets muestreados) y
  `Neto = N/D` en SPOSITO se considera normal porque su remito no declara kg.
- En la validación PDF por PDF, el primer archivo `img-261019120909-001.pdf` (SPOSITO,
  remito `66006`) queda documentado con fecha `15/10/2026`, material `ARENA FINA`,
  Neto `34.600` y Peso Neto `36.480`, según corrección del usuario. La base curada ya
  conserva el Neto confirmado.
- La primera lectura dejó una observación de discrepancia de fecha, aunque el usuario confirmó
  `15/10/2026`. La causa era que el contraste entre remito y `ENTRADA` se hacía antes de aplicar
  la corrección de año apoyada en la fecha de escaneo del archivo. Ahora ambas fechas se
  normalizan con ese dato antes de compararse; se sigue marcando cualquier diferencia real de
  día/mes. La fecha de emisión y la de salida no sustituyen a `ENTRADA`.
- El proceso acordado es revisar los PDFs en orden estable, uno por uno: presentar la lectura,
  registrar solo las correcciones que confirme el usuario y no incorporar el registro hasta
  resolver observaciones y verificar visualmente todos sus campos.
- Se amplía la base de lectura `data/base.json`: al marcar la confirmación visual se persisten
  los valores finales por `Proveedor|N Remito` y por nombre de archivo, incluso antes de
  incorporar el Excel o mover el PDF. Si el mismo documento vuelve a leerse, esas correcciones
  exactas se aplican y resuelven la observación del campo corregido.
- Cuando la edición cambió un campo textual (razón social, material, chofer o patente), también
  se guarda una regla proveedor + campo + texto OCR normalizado -> valor confirmado. Solo se
  genera a partir de una corrección explícita y un texto de origen no vacío; nunca se infieren
  reglas para fecha, remito o pesos porque esos valores varían entre tickets. Si dos correcciones
  asignan resultados distintos al mismo patrón, el patrón queda ambiguo y no se autoaplica.
- La confirmación visual ahora actualiza la base mediante `/api/base`; si falla el guardado, la
  confirmación no queda marcada y la interfaz muestra el error. Corregir/eliminar filas usa el
  nombre de archivo como clave para conservar la fila correcta aunque la tabla esté ordenada.
  La incorporación al histórico y el movimiento de PDF continúan siendo acciones separadas.
- Segunda prueba con una muestra aleatoria de 5 PDFs: `img-261019132430-001.pdf`,
  `img-261019135205-001.pdf`, `img-261019121311-001.pdf`, `img-261019134610-001.pdf` y
  `img-261019131921-001.pdf`. Se copiaron solo para análisis local y se procesaron por el OCR real
  de `/tickets`; no se modificaron originales, no se confirmó aprendizaje y no se incorporaron.
  Los cinco registros quedaron con al menos una observación que bloquea la incorporación.
- Hallazgo de material LCE: `canonMaterial` deducía **ARENA GRANITICA 0/6** al encontrar la palabra
  “GRANITICA” sin evidencia suficiente de “ARENA” ni de granulometría `0/6`. Se eliminó esa
  inferencia; además se tolera `FIEDRA` como error OCR de `PIEDRA`. En la relectura real de
  `img-261019132430-001.pdf`, el material ahora sale `PIEDRA PARTIDA 6/12`, coincidente con la
  descripción del remito y del ticket.
- El usuario confirmó para `img-261019132430-001.pdf` (LCE, remito `112246`): fecha `10/10/2026`,
  descripción `PIEDRA GRANITICA 6/12`, Neto `35.460` y Peso Neto `35.300`. Aclaró que “PIEDRA
  PARTIDA” y “GRANITICA” son equivalentes si coincide la medida. La lectura normaliza ambos
  nombres a `PIEDRA PARTIDA <medida>`; distingue arena granítica por la palabra `ARENA` y su
  granulometría. Los cinco valores confirmados se guardan como corrección para `LCE|112246`;
  chofer y patente aún no fueron confirmados.
- Revisión del siguiente PDF de la muestra, `img-261019135205-001.pdf` (LCE, remito `112212`):
  el usuario confirmó fecha `09/10/2026`, material `PIEDRA PARTIDA 6/12`, Neto `34.800`,
  Peso Neto `34.700`, remito `112212` y patente `AH702XY`. Se guardan estos valores para
  releer el ticket; chofer `N/D` queda pendiente y no se aprende como dato.
- Revisión de `img-261019121311-001.pdf` (LCE, remito `112376`): el usuario confirmó fecha
  `15/10/2026`, Neto `34.520`, Peso Neto `34.720`, chofer `AGUERD TOMAS AGUSTIN` y patente
  `AH702YZ`. Se guardan esos valores para releerlo. El OCR del material sigue incompleto y no
  se proporcionó aún su descripción correcta, por lo que queda sin aprender y debe seguir
  marcado para revisión.
- En `img-261019134610-001.pdf` (SPOSITO), el usuario confirmó el remito `65971`, el material
  `ARENA MODULO 1.8-1.9` y el Neto `36.200`. Estas tres correcciones se asocian al nombre exacto
  del archivo porque el número leído por OCR (`85371`) era incorrecto. Fecha, Peso Neto, chofer y
  patente de esa lectura siguen sin confirmarse y no se aprenden.
- La muestra también dejó dos materiales LCE sin canonizar y datos faltantes en otros campos.
  Se revisarán caso por caso y no se convertirán en reglas de aprendizaje hasta que el usuario
  confirme las correcciones.
- Se corrigió el inicio de una tanda nueva en `/tickets`: al limpiar, también se reinicia el
  indicador de ediciones previas. Antes podía ocultar todos los resultados recién procesados y
  dejar las métricas en cero, aunque el OCR hubiera terminado correctamente.
- El usuario pidió continuar con todos los PDFs disponibles. El 22/10/2026 se encontraron 47
  archivos en `STOCK\\Entrada` (uno menos que los 48 mencionados); autorizó empezar con esos 47 y
  sumar el faltante si aparece. Para el navegador se usan copias temporales locales; los PDF
  originales no se modifican, y ninguna lectura se incorpora ni se aprende sin confirmación.
- En la revisión individual de `img-261019121018-001.pdf` (SPOSITO, remito `66008`), el usuario
  confirmó fecha `15/10/2026`, material `ARENA MODULO 1.8-1.9`, Neto `34.400`, chofer `OCHOA
  ANIBAL` y Peso Neto `35.920`. Se guardan esos campos por nombre de archivo para relectura;
  la patente `AG894ER` no fue confirmada y queda pendiente.
- En `img-261019121152-001.pdf` (LCE, remito OCR `112363`), el usuario confirmó que el material
  impreso dice `Arena Granítica 0 a 6 mm`. Se normaliza como `ARENA GRANITICA 0/6` y se guarda
  como corrección exacta por archivo; no confirma ni cambia los demás campos de ese remito.
- En `img-261019121422-001.pdf` (LCE), el usuario confirmó fecha `15/10/2026`, remito `112388`,
  material `Arena Granítica 0 a 6 mm`, Neto `34.960`, chofer `LEDESMA` y Peso Neto `34.540`.
  Se guardan por archivo; el chofer se completa como `LEDESMA CAMILO` según la correspondencia
  ya conocida. Razón social y patente no fueron confirmadas en esta revisión.
- A pedido del usuario se agregaron las tablas de consulta de materiales y razón social en esta
  memoria. Se documentan ocho tipos conocidos, equivalencias explícitas de “PIEDRA PARTIDA” y
  “GRANÍTICA” cuando coincide la medida, alias OCR de medida `B12`, `G20` y `E20` solo con
  evidencia de piedra, y las dos razones sociales admitidas. Las lecturas `ARENA GRANITICA 0/8`
  y `PIEDRA PARTIDA 8/20` quedan expresamente pendientes de confirmación.
- `canonMaterial` ahora reconoce esos alias OCR de piedra con contexto y permite `AREMA` como
  confusión de OCR de `ARENA` solo para el patrón de arena granítica `0/6`. `extractRazonSocial`
  acepta abreviaturas únicamente dentro de un campo etiquetado; fuera de esos campos exige
  evidencia de `ARENERA` y `CANELONES` juntos. No se agregan automáticamente granulometrías
  dudosas al catálogo.

## 10. TOMAR EL PROYECTO DESDE OTRA PC

### Preparación

1. Clonar `https://github.com/ssaavedra1969-png/Stock.git` o abrir el repo existente en VS Code.
   La rama de código es `main`; actualizarla con `git pull --ff-only origin main`.
2. Instalar Node.js y ejecutar `npm install`.
3. Crear `.env.local` en la nueva PC (es local, está ignorado por Git y no se copia al clonar).
   Para trabajar en pruebas se necesitan `GITHUB_REPO=ssaavedra1969-png/Stock`,
   `GITHUB_BRANCH=dev` y `GITHUB_TOKEN` con permisos Contents de lectura/escritura. Obtener el
   token por un canal seguro; nunca incluirlo en documentación, mensajes, commits o capturas.
4. Iniciar `npm run dev` y abrir la URL que indique Next.js (normalmente
   `http://localhost:3000`). Si el puerto está ocupado: `npm run dev -- -p 3001`.
5. Para revisar PDFs, la PC debe tener acceso a
   `\\Admin1\compartida\Administracion\STOCK\Entrada`; seleccionar la carpeta desde Chrome o Edge
   y otorgar el permiso del navegador. La lectura de `/tickets` usa `pdfjs-dist` y `tesseract.js`
   en el navegador.

### Ramas, datos y seguridad

- `main` es la rama que Vercel despliega a producción. Probar primero en `dev` y obtener
  aprobación expresa antes de publicar cambios a `main`.
- `GITHUB_BRANCH` determina dónde las APIs leen/escriben: usar `dev` para pruebas. `data/db.json`
  es el histórico operativo; `data/base.json` en `dev` guarda aprendizaje OCR. No borrar ni
  reemplazar esos archivos al cambiar de PC. `lib/tickets/base.mjs` contiene la base curada
  versionada con el código.
- `.env.local`, PDFs temporales y archivos de trabajo local no se versionan. Los originales de
  `Entrada` no deben modificarse durante la revisión. Aprender un dato confirmado no incorpora
  el movimiento al histórico ni autoriza a mover el PDF.

### Checklist al retomar

1. Leer esta guía y revisar `git status --short --branch` y `git log --oneline -5`.
2. Confirmar que `.env.local` está configurado sin mostrar su contenido.
3. Iniciar la app y abrir `/tickets`; comprobar que carga la base de conocimiento de `dev`.
4. Continuar con un PDF por vez: compartir lo que leyó el OCR y guardar solo campos confirmados.
5. Para validar cambios, ejecutar lint en los archivos modificados y `npm run build`; no correr
   build y servidor dev simultáneamente en el mismo directorio `.next`.
