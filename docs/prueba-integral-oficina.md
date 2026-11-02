# Prueba integral desde la oficina

**Objetivo:** validar los formularios y el flujo de remitos con los datos de
desarrollo antes de considerar cerrada la tanda.

**Estado al 2026-11-02:** el flujo operativo de `/tickets` vuelve a escribir
desde el navegador en `STOCK\Salida\Stock-Historico.xlsx` y archiva los PDF en
`STOCK\procesados`, mediante el permiso de carpeta que concede el operador.
Esto no modifica `data/db.json`. La prueba integral de las APIs experimentales
de importación directa a la base `dev` sigue pendiente y es un circuito
separado; no usarla para cargar el histórico.

Para operar el histórico desde la PC de la oficina, usar Chrome o Edge, elegir
la carpeta compartida `STOCK`, revisar los PDF de `Entrada` y confirmar solo
cuando todos los datos estén verificados. Cerrar `Stock-Historico.xlsx` antes
de confirmar. No hace falta usar **Importar Excel** para actualizar ese archivo.

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
