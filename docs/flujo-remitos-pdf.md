# Flujo de remitos PDF y conciliación

**Estado:** implementación de prueba, solo para Entradas.
**Última revisión:** 2026-11-02.

Esta guía describe el flujo experimental que concilia remitos con
`data/db.json` en desarrollo. **No describe el guardado operativo en el Excel
histórico.** Para el circuito habitual de la oficina, `/tickets` escribe
`Stock-Historico.xlsx` y archiva los PDF con permiso de carpeta del navegador;
no usa estas APIs ni requiere `GITHUB_BRANCH=dev`.

El procedimiento paso a paso, incluyendo cómo preservar una tanda abierta en
otra pestaña y verificar/reintentar el guardado, está en
[`prueba-integral-oficina.md`](./prueba-integral-oficina.md#proteccion-de-una-tanda-abierta-y-recuperacion)
y en [el README](../README.md#cargar-remitos-pdf-al-historico-compartido).

La prueba integral pendiente se ejecuta en desarrollo desde la oficina. Consulta
[`prueba-integral-oficina.md`](./prueba-integral-oficina.md) para el checklist,
los límites de escritura y el orden recomendado.

## Objetivo

Leer un remito PDF de Entrada y compararlo con la base para distinguir:

1. Una Entrada que todavía no existe.
2. Una Entrada existente con origen manual o histórico no identificado, que
   podría tener campos vacíos para completar.
3. Una Entrada que ya se incorporó desde un PDF.
4. Varias coincidencias que necesitan revisión porque no se debe elegir un
   movimiento arbitrariamente.

La identificación se basa en el tipo `Entrada`, el proveedor y el número de
remito normalizados. La fecha o el producto no sustituyen esa clave.

## Comportamiento esperado

| Resultado de la búsqueda | Comportamiento |
|---|---|
| No hay coincidencia | Se presenta como Entrada nueva, sujeta a validación y confirmación. |
| Una coincidencia manual o histórica con campos vacíos | Se muestran los campos faltantes, conflictos y una confirmación específica. Solo se completan campos vacíos. |
| Una coincidencia manual o histórica sin campos compatibles para completar | Se informa que se omitirá; no bloquea la tanda ni modifica el movimiento. |
| Una coincidencia ya importada desde PDF o enriquecida previamente | Se omite como repetida. |
| Más de una coincidencia | No se selecciona automáticamente; se requiere resolver la ambigüedad. |
| Tipo de carga `Salida` | No se permite guardar desde este flujo. La lectura/importación de Salidas no está implementada. |

Un registro histórico sin `origenCarga` se presenta como **origen no
identificado**. No se afirma que fue manual: el operador debe confirmar que el
PDF corresponde a ese movimiento antes de completar datos.

## Campos y conflictos

- El escáner extrae del documento y de la balanza fecha, proveedor, número de
  remito, razón social, material, pesos, chofer y patente.
- Para la fecha del movimiento coteja `FECHA`, `ENTRADA` y `SALIDA` del ticket
  de balanza, elige la fecha coincidente con más lecturas y, si hay empate,
  prioriza `ENTRADA`. La fecha del ticket prevalece sobre la impresa en el
  remito del proveedor; las discrepancias se marcan para revisión. Si el OCR
  genera una fecha a más de 300 días de un nombre de archivo fechado, se usa
  la fecha del archivo como corrección de respaldo.
- Antes de iniciar el OCR, la pantalla `/tickets` espera la respuesta válida de
  `/api/base` y la carga de movimientos guardados. Si alguna fuente no se puede
  cargar, detiene el proceso y muestra el error en vez de continuar sin ella.
- Las correlaciones verificadas de chofer y patente ayudan a completar un
  chofer ausente y a señalar discrepancias. Si el nombre no se obtiene completo,
  se vuelve a leer la zona del transportista del PDF. Una asociación ambigua no
  se usa para completar el campo; las lecturas dudosas quedan marcadas para
  revisión. El editor permite desplegar y filtrar choferes y patentes guardados.
- Las reglas aprendidas se cotejan con el texto OCR original, antes de la
  normalización del campo. Las correcciones específicas por remito o archivo
  tienen prioridad sobre la lectura general.
- Esta asistencia se aplica únicamente a la lectura nueva del PDF. No modifica
  movimientos ya guardados, el Excel histórico, `data/db.json` ni `data/base.json`.
- Para lecturas de LCE y SPOSITO se vuelven a consultar zonas específicas del
  remito y de la balanza cuando la primera pasada no alcanza para confirmar
  material o datos del transportista. Los pesos ya reconocidos como plausibles
  se conservan; una lectura dudosa no debe reemplazarse silenciosamente por un
  valor inventado.
- El Centro debe seleccionarse en la pantalla; no se deduce exclusivamente de
  un nombre de empresa que aparezca en el documento.
- Los pesos se normalizan a toneladas para la base, manteniendo separados el
  peso declarado por el proveedor y el peso de balanza.
- Un valor existente no se reemplaza. Los valores diferentes se presentan
  como conflictos y quedan sin sobrescribir.
- Números de remito, fechas inválidas, discrepancias de lectura y otros campos
  que requieren revisión bloquean la incorporación hasta corregirlos.
- Las correcciones específicas de OCR en `lib/tickets/base.mjs` solo deben
  agregarse después de comprobar el PDF original. Son reglas de lectura, no
  escrituras a `data/db.json`.

## Origen del movimiento

- Las altas manuales nuevas creadas por `POST /api/db` se marcan
  `origenCarga: "manual"`.
- Las Entradas nuevas del endpoint PDF se marcan `origenCarga: "pdf"`.
- Una conciliación confirmada conserva el origen manual o histórico y agrega
  `enriquecidoPorPdf` y la fecha de enriquecimiento.
- Los movimientos existentes antes de agregar el seguimiento de origen pueden
  no tener ese dato. Se tratan como históricos no identificados.

## Límites de escritura

Los endpoints de importación de prueba comprueban simultáneamente que no sea
Vercel y que `GITHUB_BRANCH` sea exactamente `dev`. Si falla cualquiera de
esas condiciones, la petición se rechaza. También exigen confirmación explícita,
validan los registros y vuelven a comprobar duplicados y conciliaciones sobre la
base actual antes de escribir.

Al probar el escáner:

- Selecciona solo `Entrada`.
- Lee el PDF y revisa la vista previa.
- La confirmación de conciliación autoriza completar únicamente los campos
  vacíos indicados; la confirmación final autoriza la escritura en la base dev.
- No se escribe el Excel seleccionado ni se mueven PDFs.
- No pruebes el endpoint de escritura contra `main` ni contra Vercel.
- El guard bloquea la escritura PDF en Vercel; un despliegue allí no activa este
  flujo de desarrollo.

## Estado de validación conocido

- Se verificó una petición sin confirmación: la API respondió HTTP 400 y no
  cambió la base dev.
- El PDF LCE `20261015_LCE_2.pdf`, remito `112392`, se leyó en previsualización.
  La fecha de Entrada es `15/10/2026`, la razón social es `ARENERA CANELONES` y
  el material se normalizó a `ARENA GRANITICA 0/6` después de confirmar que las
  descripciones del remito y de la balanza son equivalentes.
- Ese remito ya coincidía con un movimiento histórico completo y fue omitido;
  no se incorporó ni actualizó ningún movimiento.
- Se probó un remito SPOSITO existente sin campos compatibles para completar.
  La pantalla informó que se omitiría sin modificarlo.
- Estas pruebas no validan todavía una conciliación real de un movimiento
  manual con campos vacíos ni la incorporación controlada de una Entrada nueva.
- En la revisión del 2026-11-01, los movimientos existentes de la base
  consultada no tenían `origenCarga`; las coincidencias se mostraron como
  históricas no identificadas. No se debe inferir que esos registros fueron
  manuales sin confirmación.
- El 2026-11-01, el autocompletado de Chofer/Patente se verificó en el formulario
  productivo sin guardar un registro. La lista se alimenta de movimientos y de
  `data/base.json`: la base productiva consultada contenía 15 opciones de cada
  tipo, mientras que los movimientos consultados no tenían esos dos campos.
  La prueba pendiente es validar el flujo completo de trabajo en la oficina con
  la rama de datos `dev`, no volver a probar ni escribir en producción.

## Continuación de pruebas

Para validar la conciliación de punta a punta, usa un registro dev de prueba
confirmado como manual (o un movimiento histórico cuya identidad confirme el
operador), con una clave proveedor/remito única y al menos un campo vacío.
Compara la vista previa, comprueba los conflictos, selecciona explícitamente la
conciliación y revisa el resultado después de la escritura solo si el usuario
autoriza esa prueba. Antes y después, confirma la rama `dev` y los conteos de la
base; no uses producción para preparar datos de prueba.

## Mejoras de OCR y edición (2026-11-02)

- El reconocimiento de fechas del ticket de balanza compara `FECHA`, `ENTRADA`
  y `SALIDA`: elige la fecha que más se repite y, ante empate, prioriza
  `ENTRADA`. La fecha del remito del proveedor queda como referencia de revisión,
  no desplaza una fecha de operación confirmada por la balanza. Los nombres de
  archivo `YYYYMMDD_...` también sirven para detectar/corregir fechas OCR
  incompatibles.
- Se ajustaron las zonas OCR de encabezado, remito, material y pesos para los
  formatos LCE, SPOSITO y Cemento Avellaneda. El peso neto válido de la página
  completa se conserva sin disparar recortes extra. Los cambios de recorte se
  basan en la inspección visual de los formatos; requieren validación contra
  los PDF reales antes de considerarse verificados.
- La lectura del transportista usa las asociaciones conocidas de chofer y
  patente para resolver lecturas incompletas. Si el OCR agrega texto basura a
  un nombre guardado, se normaliza al nombre conocido y se deja una observación
  para revisar; no se usa una asociación ambigua para completar datos.
- El procesamiento espera a que la base de conocimiento y los movimientos
  estén cargados. Una respuesta de base ausente o inválida produce un error
  explícito, en lugar de iniciar el OCR sin conocimiento.
- Los campos Chofer y Patente del editor ofrecen listas desplegables filtrables
  alimentadas por la base conocida y los registros de la tanda.
- La secuencia de edición se conserva por la identidad interna del registro,
  no por el nombre del archivo PDF. Así, nombres de archivo repetidos no hacen
  que guardar afecte o vuelva a abrir otro registro; “Guardar y siguiente”
  conserva el orden visible al iniciar la edición.
- Tras una incorporación correcta, la pantalla limpia la tanda ya procesada.
  Los contadores de la tanda vacía ya no se presentan como una carga con cero
  remitos: queda visible el resumen de la última operación con filas agregadas,
  duplicados omitidos y PDFs archivados. Un error al archivar PDFs se mantiene
  indicado para evitar que se interprete como una operación completamente
  terminada.
- Las correcciones aprendidas se cotejan con el texto OCR original y las
  específicas por remito/archivo tienen prioridad sobre la lectura general.

### Verificación y límites

- `npm run lint`, `npm run build` y `git diff --check` finalizaron correctamente.
  Lint/build informan un aviso preexistente de dependencias de `useEffect` en
  `app/tickets/page.js`.
- Se ejecutaron comprobaciones puntuales con lecturas simuladas para el consenso
  de fecha, conservación de peso neto, normalización del chofer y recuperación
  de patente/conocimiento.
- Una previsualización anterior de ocho PDF del 21/09 señaló campos OCR que
  necesitaban mejora. La siguiente corrida local quedó en 0% y no permitió
  confirmar la lectura integral corregida de esos ocho archivos. Por eso, este
  cambio no afirma que la tanda real haya quedado validada ni autoriza su
  incorporación automática.
- No se modificaron movimientos existentes, `data/db.json`, `data/base.json`,
  planillas Excel ni los PDF originales. No se renombraron ni movieron archivos
  como parte de estos cambios.
