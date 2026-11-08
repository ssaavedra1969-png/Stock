# Continuidad: Inicio y Movimientos

_Actualizado: 2026-11-07, 22:19 (Argentina)._

## Estado

Se separó la portada institucional de la operación diaria:

- `/` muestra información institucional de Grupo FALPAT, soluciones, ubicación,
  enlace al sitio corporativo y accesos rápidos.
- `/movimientos` contiene la operación: carga de entradas desde PDF, entrada
  manual, salida manual, resumen general, navegador del último movimiento e
  historial con búsqueda, filtros, edición y eliminación.
- La navegación lateral diferencia Inicio y Movimientos; la barra superior
  muestra el título de la ruta.

En Movimientos, los accesos se presentan en tarjetas distintas: **Entrada
desde PDF**, **Entrada manual** y **Salida manual**. Debajo aparecen, en orden,
**Resumen general**, **Último movimiento** e **Historial de movimientos**.
El resumen aclara que sus totales corresponden al historial completo y no a
los filtros del listado.

## Publicación y versión

- PR [#7](https://github.com/ssaavedra1969-png/Stock/pull/7), integrado a
  `main`.
- Commit de merge: `fc2a28715c95875aeadc22c3f19b5306ae3de7ae`.
- Despliegue de producción: **Ready** en Vercel.
- Producción: <https://stock-gamma-inky.vercel.app/>.
- Vista operativa: <https://stock-gamma-inky.vercel.app/movimientos>.
- El cambio está en `app/page.js`, `app/movimientos/page.js`,
  `components/Sidebar.js` y `components/Topbar.js`; la navegación también se
  explica en `README.md`.

## Validación realizada

- `npm run lint`: termina correctamente; queda la advertencia preexistente de
  `react-hooks/exhaustive-deps` en `app/tickets/page.js:401` (`procesar`).
- `npm run build`: compilación de producción exitosa.
- Respuestas HTTP 200 para `/` y `/movimientos` en desarrollo y producción.
- Se comprobó en navegador que Inicio muestra el hero y accesos rápidos, sin
  tabla; Movimientos muestra sus secciones y acciones, incluida la carga PDF.
- No se modificaron archivos de datos ni se hicieron escrituras en ellos.
- `.env.local` continúa configurado con `GITHUB_BRANCH=dev`; mantenerlo así en
  desarrollo y no compartir sus credenciales.

## Retomar mañana

1. Revisar la interfaz publicada y confirmar que el orden y las etiquetas de
   Movimientos resulten claros en escritorio y móvil.
2. Recoger cualquier ajuste de presentación pendiente antes de modificar la
   operación existente.
3. Para continuar con código, actualizar/clonar `main` (que ya contiene
   `fc2a287`) y abrir una rama nueva para cambios posteriores. El despliegue de
   este trabajo ya está hecho; no hace falta volver a publicarlo.
4. No cambiar `GITHUB_BRANCH` a `main`, ni editar datos de producción.

Si la próxima sesión es la prueba integral desde otra PC, seguir primero
[las instrucciones de oficina](./prueba-integral-oficina.md) y las reglas de
seguridad del [README](../README.md); esa prueba es sobre `dev`.
