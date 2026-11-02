# Prueba integral desde la oficina

**Objetivo:** separar y probar sin confusiones el circuito operativo del Excel
histórico y las APIs experimentales de movimientos en desarrollo.

**Resultado real al 2026-11-02:** se restauró y publicó el flujo habitual de
`/tickets`. Desde una pestaña nueva en Vercel se leyeron los 15 PDF corregidos
y se confirmó **Guardar en histórico**. La verificación de solo lectura del
archivo compartido confirmó que `Stock-Historico.xlsx` abre correctamente,
contiene 49 registros en total y los 15 remitos de la tanda están presentes
una sola vez. La modificación del archivo fue a las 10:40:42. No se modificó
`data/db.json`.

**Incidente de interfaz al 2026-11-02, 16:43:** se informó que el Excel recibía
filas, pero la pantalla mostraba `0 nuevo(s) · 0 repetido(s)`. La revisión del
código identificó que, tras una incorporación sin errores, la página limpiaba
la tanda y volvía a calcular los contadores sobre la lista vacía. Esto podía
mostrar ceros aunque la operación anterior hubiera agregado filas. Se corrigió
la interfaz para conservar el resumen devuelto por la operación (filas
agregadas, duplicados omitidos y PDFs archivados), mostrar un estado claro para
una tanda vacía y deshabilitar Guardar cuando no hay registros. El fix quedó en
el commit `beef00a` de `main`; Vercel informó el despliegue de producción como
**Ready**. No se volvió a escribir en el Excel como parte del diagnóstico.

**Pendiente para retomar:** refrescar `/tickets` para recibir la versión
publicada y revisar una incorporación normal. Después de guardar, comprobar el
resumen de la última operación contra el Excel y los PDF archivados. El resumen
de incorporación es el resultado de la operación; el conteo previo es una
referencia y el Excel se vuelve a leer al guardar. No repetir una tanda solo
porque los contadores previos y el resultado parezcan distintos: primero
verificar filas y archivos ya procesados. No se confirmó aún con una nueva
operación real que la interfaz publicada muestre el resumen correcto.

El checklist de las secciones A-D de abajo es **exclusivamente para probar las
APIs experimentales que escriben en la base `dev`**. No es el procedimiento
para actualizar el Excel histórico y sus instrucciones de preparación (incluido
`GITHUB_BRANCH=dev`) no aplican al circuito habitual. Para el uso operativo,
seguí [Cargar remitos PDF al histórico compartido](../README.md#cargar-remitos-pdf-al-historico-compartido).

### Proteccion de una tanda abierta y recuperacion

- Los PDF seleccionados y el resultado del OCR viven en la memoria de la
  pestaña que los leyó. No pulsar F5 ni cerrar esa pestaña mientras no se haya
  confirmado y verificado la carga.
- Si la pantalla abierta muestra **Guardar en dev** o **Descargar para Importar
  Excel**, corresponde a la versión anterior del flujo. No confirmar desde esa
  pestaña para guardar el histórico.
- Para conservar la tanda visible mientras se abre la versión actualizada:
  abrir `/tickets` en otra pestaña, seleccionar la carpeta `STOCK` y leer allí
  los PDF de `Entrada`. Revisar la tanda nueva y confirmar desde esa pestaña;
  mantener la pestaña original abierta hasta verificar el Excel.
- Antes de guardar, comprobar que la carpeta elegida es `STOCK`, que aparece
  el conteo del histórico y que la pantalla ofrece **Guardar en histórico**.
  Cerrar el Excel si está abierto en Excel y conceder al navegador permiso de
  escritura.
- Al confirmar, el navegador agrega remitos no duplicados a
  `STOCK\Salida\Stock-Historico.xlsx` y pasa los PDF de `Entrada` a
  `STOCK\procesados`. Los duplicados no generan filas nuevas, pero sus PDF
  también se archivan.
- Verificar el mensaje final y, si hace falta, comprobar el Excel en modo de
  solo lectura: que abra, que el conteo haya aumentado según las filas nuevas
  y que los números de remito de la tanda estén presentes una sola vez.
- Si la operación devuelve un error o el resultado es incierto, no refrescar,
  cerrar ni volver a procesar a ciegas. Preservar la pestaña, leer el detalle y
  verificar primero Excel y `procesados`. El reintento deduplica las filas y
  reconoce copias idénticas que ya se movieron; aun así, confirmar que se
  reintentará la misma tanda.

## Preparación segura

1. Actualizar/clonar `main` del repositorio y revisar `git status --short --branch`.
2. Crear `.env.local` localmente con las credenciales privadas de la oficina.
   No copiar credenciales en mensajes, documentación, capturas ni commits.
3. Confirmar sin imprimir el token que `GITHUB_BRANCH=dev`:

   ```powershell
   Select-String -Path .env.local -Pattern '^GITHUB_BRANCH='
   ```

4. Iniciar `npm run dev`, abrir la URL local e inspeccionar `/api/db` y `/api/base`
   en modo de solo lectura. Si la carga falla, detener la prueba; no cambiar a
   `main` para resolverla.
5. El usuario ya indicó que se haga la prueba integral en desarrollo; no hace
   falta pedir confirmación de nuevo para cada escritura normal prevista en las
   secciones C y D. Si los datos no permiten confirmar la identidad del
   movimiento, hay una ambigüedad o aparece una operación fuera del checklist,
   detenerse y consultar antes de continuar.

## A. Formularios Entrada y Salida (sin guardar)

Repetir para Entrada y Salida:

- Abrir el formulario manual y verificar que Patente y Chofer presenten sus
  sugerencias guardadas al pulsar la flecha.
- Escribir parte de un valor conocido y comprobar que la lista filtre
  sugerencias. El desplegable muestra como máximo 10 opciones; escribir para
  filtrar las restantes.
- Elegir un chofer que tenga una sola patente asociada y confirmar que se
  complete Patente.
- Elegir una patente que tenga un solo chofer asociado y confirmar que se
  complete Chofer.
- Probar, si existe en los datos de desarrollo, una asociación ambigua. El otro
  campo no debe asignarse arbitrariamente.
- Cerrar con **Cancelar**. No pulsar Guardar durante esta parte.

Si no hay opciones en dev, anotar qué listas/catálogos faltan y detener esa
parte; no copiar la base productiva a `dev` ni agregar valores ficticios sin
autorización.

## B. Remitos PDF: lectura y previsualización (sin escribir)

- Usar copias de PDFs autorizadas para la prueba; no mover ni modificar los
  originales compartidos.
- Procesar un PDF por vez y verificar tipo Entrada, proveedor, número de remito,
  fecha, razón social, material, pesos, chofer y patente contra el documento.
- Corregir OCR solo tras consultar el PDF original. Distinguir transportista,
  proveedor y razón social; no inferir uno a partir del otro.
- Comprobar la clave de conciliación: tipo Entrada + proveedor + número de
  remito normalizados.
- Registrar el resultado de vista previa: nuevo, coincidencia histórica/manual,
  repetido o ambiguo. Un registro sin `origenCarga` es **origen no
  identificado**, no asumir que es manual.
- No guardar todavía. Si la vista previa no coincide con el documento o hay
  varias coincidencias, detenerse y resolverlo con el usuario.

## C. Conciliación de un registro existente (escritura dev controlada)

Solo después de validar la vista previa y confirmar que la identidad del
movimiento y la coincidencia son seguras:

- Elegir un movimiento dev cuya identidad proveedor/remito haya sido confirmada
  y que tenga al menos un campo vacío compatible.
- Verificar que la pantalla ofrezca completar únicamente campos vacíos.
- Revisar conflictos: valores diferentes no se reemplazan.
- Confirmar que la coincidencia sea única y seleccionar expresamente la
  conciliación antes de autorizar la escritura.
- Al terminar, revisar el movimiento en dev: solo deben haberse completado los
  campos vacíos autorizados; los demás valores deben permanecer iguales.
- Anotar el ID del movimiento de prueba y resultado (sin copiar datos sensibles
  a documentos o capturas compartidas).

Si no se encuentra una coincidencia segura, no crear una artificial ni elegir
entre varias coincidencias.

## D. Una Entrada nueva (escritura dev controlada)

La prueba integral solicitada incluye una Entrada nueva controlada en dev, si
se encuentra un PDF validado sin coincidencia:

- Seleccionar un PDF validado que no tenga coincidencia en dev.
- Revisar todos los campos y su correspondencia con el esquema antes de
  confirmar.
- Incorporar una sola Entrada; comprobar después que se guardó una vez, en la
  rama `dev`, con proveedor, números de remito, material, pesos, chofer,
  patente y centro correctos.
- Reprocesar el mismo archivo en previsualización y confirmar que se detecte
  como repetido, sin crear otro movimiento.

No usar Salidas: la lectura/incorporación de remitos PDF de Salida todavía no
está implementada.

## Cierre y reporte

- Confirmar de nuevo que la aplicación siguió apuntando a `dev`.
- Comparar conteo y registros modificados contra las notas previas. Reportar qué
  se probó, qué pasó y qué quedó pendiente; no copiar los datos operativos
  completos al informe.
- Si una escritura afectó un registro incorrecto, no corregirlo mediante cambios
  improvisados: detenerse, preservar evidencia y acordar el procedimiento.
- No desplegar ni cambiar datos en producción como parte de esta prueba.
