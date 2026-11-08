# FALPAT Stock

Aplicación web para administrar movimientos de materiales: entradas, salidas,
remitos, proveedores, transportistas, stock e informes. Está construida con
Next.js 14 y guarda los movimientos en `data/db.json` mediante la API de GitHub.

## Desarrollo local

Requisitos: Node.js y acceso al repositorio de datos configurado.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completa `.env.local` con `GITHUB_REPO`, un token privado `GITHUB_TOKEN` y
`GITHUB_BRANCH=dev`. No compartas ni subas ese archivo: está ignorado por Git.
Verifica la rama sin mostrar el token:

```powershell
Select-String -Path .env.local -Pattern '^GITHUB_BRANCH='
npm run dev
```

Abre `http://localhost:3000`. Para detener el servidor, usa `Ctrl+C` en su
terminal.

## Validación

```powershell
npm run lint
npm run build
```

No ejecutes `npm run build` mientras `npm run dev` esté activo en el mismo
directorio: ambos usan `.next`. El build comprueba la compilación, pero no
sustituye las pruebas funcionales de cada flujo.

## Autocompletado de chofer y patente

En los formularios de Entrada y Salida, Chofer y Patente sugieren valores de
los movimientos existentes y de la base de conocimiento de remitos PDF
(`data/base.json`). Cuando el valor ingresado tiene una única asociación en
esas fuentes, se completa también el campo relacionado: patente a partir del
chofer o chofer a partir de la patente. La comparación ignora mayúsculas,
tildes y espacios en la patente. Si hay más de una asociación, no se elige
ninguna automáticamente para evitar asignaciones ambiguas. El autocompletado
solo prepara el formulario; los datos se guardan al confirmar el registro.

## Cargar remitos PDF al histórico compartido

Este es el circuito habitual para guardar remitos en el archivo histórico:

1. En Chrome o Edge de una PC que tenga acceso a la carpeta compartida, abrí
   `/tickets`. La página debe mostrar **Incorporar al histórico**. Si muestra
   **Guardar en dev** o **Descargar para Importar Excel**, es una versión
   anterior: no uses esos botones.
2. Elegí la carpeta `STOCK` que contiene `Entrada`, `Salida` y `procesados`;
   concedé al navegador permiso de lectura y escritura. Confirmá que la pantalla
   indica que leyó el histórico y cuántos registros contiene.
3. Elegí el centro y `Entrada`; hacé clic en **Leer PDFs de Entrada** y esperá
   a que termine el OCR. Revisá cada fila contra su PDF y corregí o quitá las
   filas con observaciones. Tildá la confirmación visual solo después de revisar
   toda la tanda. Si un PDF no se pudo leer o no corresponde a esta carga,
   excluilo desde su error o quitá su fila: se incorporan solo los registros
   restantes y el PDF excluido queda intacto en `Entrada` para revisarlo luego.
   También podés usar la **X** del archivo ya cargado para retirarlo sin volver a
   procesar los demás. Podés agregar más PDF a la misma tanda: solo se procesan
   los nuevos y se conservan las ediciones anteriores. Podés deshacer la
   exclusión de un error antes de guardar. Para empezar un lote separado,
   terminá o limpiá la lectura actual.
4. Cerrá `Salida\Stock-Historico.xlsx` si está abierto en Excel. En la misma
   pestaña que tiene los registros revisados, confirmá **Guardar en histórico**.
   Aceptá el segundo mensaje de confirmación. La página agrega los remitos
   nuevos al Excel y mueve los PDF de `Entrada` a `procesados`.
5. Esperá el resultado en pantalla: debe informar cuántas filas se agregaron y
   cuántos PDF se archivaron. Después de una carga exitosa, el resumen queda
   visible aunque la tanda se limpie; una tanda vacía indica que no hay remitos
   para incorporar y no permite volver a guardar. Si hubo errores, leé el
   detalle y no cierres ni refresques esa pestaña; verificá el Excel y los PDF
   antes de decidir si hay que reintentar.

El guardado se realiza desde el navegador con permiso explícito sobre la carpeta
elegida; Vercel no necesita montar ni acceder al recurso compartido. Los
remitos repetidos se omiten del Excel, pero sus PDF también se archivan. Si el
resultado no está claro, no recargues ni vuelvas a procesar la tanda: verificá
primero `STOCK\Salida\Stock-Historico.xlsx` y `STOCK\procesados`. El guardado
reconoce al reintentar un PDF idéntico ya archivado y el Excel deduplica por
proveedor y número de remito.

**Protegé la pestaña original:** el resultado del OCR y los archivos PDF
seleccionados viven en la memoria de esa pestaña. No pulses F5 ni la cierres
hasta terminar y verificar el guardado. Para usar una versión nueva sin perder
esa tanda, abrí otra pestaña de `/tickets`, elegí `STOCK` y leé allí los PDF de
`Entrada`; mantené la pestaña original abierta como respaldo. No uses
**Guardar en dev** para actualizar el Excel histórico.

**Importar Excel** (`/incorporar`) es un flujo separado para cargar planillas a
la base de movimientos de la aplicación; no reemplaza ni actualiza
`Stock-Historico.xlsx`.

La sección acepta tanto la plantilla de importación como el propio
`Salida\Stock-Historico.xlsx`: detecta sus columnas, toma `Carga` como tipo de
movimiento y convierte los pesos de kg a tn. Antes de guardar muestra las filas
nuevas, las ya cargadas y los errores. Para detectar un remito ya cargado usa el
tipo de movimiento, el proveedor/cliente y el número de remito, aunque hayan
cambiado la fecha, el producto o la cantidad. Los registros existentes se
ignoran y nunca se actualizan desde el Excel. Si falta el número de remito,
aplica la comparación detallada anterior. La API repite la verificación al
guardar. El Excel compartido no se modifica.

## Datos y publicación

- `GITHUB_BRANCH` selecciona la rama de datos que usan las APIs. En desarrollo,
  usa `dev`; no uses `main` para pruebas de escritura.
- La rama de código `main` está conectada al despliegue de producción en Vercel.
- Los endpoints experimentales que incorporan remitos PDF directamente a
  `data/db.json` están limitados a ejecución local con `GITHUB_BRANCH=dev`;
  rechazan peticiones en Vercel. No son el flujo de `/tickets` hacia el Excel
  histórico compartido, que escribe desde el navegador con permiso de carpeta.
- Antes de publicar, revisa `git status`, la rama actual y la diferencia con el
  remoto. No reemplaces una rama de datos divergente.
- Nunca versionar `.env.local`, credenciales, PDFs de proveedores ni planillas
  con datos operativos.

## Documentación

- [AYUDA-MEMORIA.md](./AYUDA-MEMORIA.md): arquitectura, desarrollo y notas de
  continuidad.
- [docs/flujo-remitos-pdf.md](./docs/flujo-remitos-pdf.md): detección de
  coincidencias, conciliación de campos vacíos y límites de seguridad del flujo
  PDF.
- [docs/prueba-integral-oficina.md](./docs/prueba-integral-oficina.md): lista de
  verificación para probar en desarrollo los formularios y el flujo de remitos
  desde la oficina.
- [AGENTS.md](./AGENTS.md): instrucciones prácticas del entorno Windows usado
  para el desarrollo.
