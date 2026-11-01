# Flujo de remitos PDF y conciliación

**Estado:** implementación de prueba, solo para Entradas.
**Última revisión:** 2026-11-01.

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

## Continuación de pruebas

Para validar la conciliación de punta a punta, usa un registro dev de prueba
confirmado como manual (o un movimiento histórico cuya identidad confirme el
operador), con una clave proveedor/remito única y al menos un campo vacío.
Compara la vista previa, comprueba los conflictos, selecciona explícitamente la
conciliación y revisa el resultado después de la escritura solo si el usuario
autoriza esa prueba. Antes y después, confirma la rama `dev` y los conteos de la
base; no uses producción para preparar datos de prueba.
