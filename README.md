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

En `/tickets`, elegí la carpeta `STOCK` compartida, leé los PDF de `Entrada`,
revisá cada registro y confirmá la incorporación. La sección actualiza
`Salida\Stock-Historico.xlsx` y archiva los PDF en `procesados`. La escritura
se realiza desde el navegador, usando el permiso explícito para la carpeta que
seleccionó el operador; no depende de que Vercel tenga acceso a la red.

Usá Chrome o Edge en una PC con acceso a la carpeta compartida. Cerrá el Excel
histórico antes de confirmar la carga. Los remitos repetidos no se agregan de
nuevo, aunque sus PDF también se archivan. Este circuito no escribe en
`data/db.json`.

**Importar Excel** (`/incorporar`) es un flujo separado para cargar planillas a
la base de movimientos de la aplicación; no reemplaza ni actualiza
`Stock-Historico.xlsx`.

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
