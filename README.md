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

## Importar `Stock-Historico.xlsx` en producción

La sección **Importar Stock histórico** (`/incorporar-historico`) es el flujo
específico para ese archivo; no uses el importador Excel genérico. Analiza las
filas en el navegador y muestra una previsualización. Solo procesa filas con
`Carga = Entrada`; errores, filas de otro tipo y conflictos de remito bloquean
la confirmación. Las coincidencias existentes solo se actualizan si se eligen
explícitamente y se completan campos vacíos, sin reemplazar datos existentes.

La escritura requiere confirmar el resumen y solo se habilita en Vercel con
`GITHUB_BRANCH=main`. El endpoint vuelve a validar el archivo y los conflictos
contra la base actual antes de guardar en `data/db.json`. La página local
`/incorporar-dev` sigue reservada a pruebas en `dev`; no la uses para producción.

## Datos y publicación

- `GITHUB_BRANCH` selecciona la rama de datos que usan las APIs. En desarrollo,
  usa `dev`; no uses `main` para pruebas de escritura.
- La rama de código `main` está conectada al despliegue de producción en Vercel.
- Los endpoints de incorporación directa de PDF y del importador de remitos de
  prueba están limitados a ejecución local con `GITHUB_BRANCH=dev`; rechazan
  peticiones en Vercel. Publicar el código no habilita esas escrituras en
  producción.
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
