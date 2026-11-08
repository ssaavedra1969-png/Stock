# Continuidad — Informes gerenciales y publicación

_Cierre: 2026-11-08 (Argentina)._

## Estado al cierre

- La producción es <https://stock-gamma-inky.vercel.app/> y `main` está en
  `4cf034a` (**Show product descriptions in report filter**).
- El despliegue de Vercel para ese commit terminó correctamente.
- El repositorio local está en la rama `fix/product-filter-by-description`,
  alineada con `origin/main`, sin cambios pendientes.
- El servidor local responde en `http://localhost:3000`; `.env.local` mantiene
  `GITHUB_BRANCH=dev`. No cambiarla a `main` para desarrollo.
- No se modificaron ni se publicaron `data/db.json` o `data/base.json`.

## Cambios publicados hoy

1. **Inicio:** el HERO pasó de texto promocional a **Stock general de la empresa**
   con una descripción breve. Commit `95c3e80`.
2. **Informes y reportes gerenciales:** se promovió el trabajo que hasta entonces
   estaba solamente en la rama de desarrollo:
   - Informe General con cinco secciones: ventas, entradas, stock a la fecha por
     material, evolución mensual y alertas de stock.
   - Informes por producto, cliente, proveedor y chofer, además de entradas,
     salidas, movimientos y stock por planta.
   - Filtro **Viajes por chofer** con viajes, entradas/salidas, toneladas y
     productos. Los movimientos sin chofer se identifican como tales, sin
     atribuirlos a otra persona.
   - Filtro **Razón social** basado en `razonSocial` de las Entradas, separado
     de los campos Proveedor/Cliente. En Informe General afecta solamente la
     sección 02 Entradas.
   - Filtros de período independientes para Ventas y Entradas en el Informe
     General.
   - Exportaciones PDF/Excel con encabezado de empresa y filtros aplicados. El
     PDF usa escala de grises y líneas visibles entre registros; el Excel General
     tiene cinco hojas.
   - Reportes de stock y movimientos por producto/planta, con período, fecha de
     corte y una unidad de medida a la vez.
   - Commits `1352465` (publicación) y `65a19dc` (integración de informes).
3. **Filtro de producto:** las opciones y la búsqueda ahora muestran la
   descripción del material en lugar del código; el filtrado usa esa misma
   descripción. Commit `4cf034a`.
4. Se actualizó `README.md` y esta ayuda-memoria para describir los filtros,
   exportaciones y el stock de Inicio.

## Validaciones

- `npm run lint`: termina correctamente; queda el warning preexistente de
  `react-hooks/exhaustive-deps` en `app/tickets/page.js:401` (`procesar`).
- `npm run build`: compilación de producción exitosa.
- Vercel: estado **success** para `1352465` y `4cf034a`.
- Producción: `/`, `/informes`, `/reportes` y `/movimientos` responden HTTP 200.
- En el navegador de producción se comprobó el tipo **Viajes por chofer**, el
  filtro Chofer con opciones, los ejemplos de razón social y proveedor/cliente,
  y la búsqueda de producto **ARENA FINA** por descripción.
- API local `/api/db`: HTTP 200; la configuración local sigue en `dev`.
- No se ejecutaron escrituras de datos durante estas publicaciones.

## Retomar mañana

1. Comenzar leyendo este documento y comprobar `git status --short --branch`.
2. Para código, actualizar `main` y abrir una rama nueva. La producción actual
   ya contiene los cambios descritos; no hace falta volver a desplegarlos.
3. Para pruebas locales, confirmar `GITHUB_BRANCH=dev` sin imprimir ni compartir
   secretos de `.env.local`. No cambiar a `main` ni editar datos de producción.
4. Revisar con el usuario cualquier ajuste visual pendiente en PDF/Excel y
   confirmar los filtros que necesita cada gerencia antes de ampliar informes.
5. Si se solicita importar o modificar datos, detenerse ante movimientos,
   identidades o duplicados ambiguos y no modificar archivos PDF originales.

## Referencias

- Producción: <https://stock-gamma-inky.vercel.app/>
- Commit de informes/documentación: <https://github.com/ssaavedra1969-png/Stock/commit/1352465>
- Commit del filtro por descripción: <https://github.com/ssaavedra1969-png/Stock/commit/4cf034a>
- Guía de oficina y pruebas en dev: [prueba-integral-oficina.md](./prueba-integral-oficina.md)
- Resumen general del proyecto: [AYUDA-MEMORIA.md](../AYUDA-MEMORIA.md)
