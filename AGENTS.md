# AGENTS.md — Notas de trabajo (FALPAT Stock)

## Prioridad al retomar la prueba desde la oficina

La próxima prueba integral se hará desde **otra PC**, no desde este entorno.
Al iniciar:

1. Actualizar/clonar la rama de código `main` y leer
   [docs/prueba-integral-oficina.md](./docs/prueba-integral-oficina.md).
2. Crear `.env.local` en esa PC con las credenciales privadas locales; no
   copiar el archivo de esta PC ni compartir o imprimir sus secretos.
3. Confirmar que `GITHUB_BRANCH=dev` antes de iniciar la app. La prueba y las
   escrituras previstas en su checklist son exclusivamente para desarrollo;
   nunca cambiar a `main` ni modificar datos de producción.
4. Completar el checklist de punta a punta. El usuario ya pidió realizar la
   prueba completa en dev: no volver a pedir autorización para cada paso normal
   previsto allí. Detenerse y consultar si hay una coincidencia ambigua, datos
   inesperados, riesgo de afectar otro movimiento o cualquier intento de tocar
   producción.
5. Antes de guardar una Entrada desde PDF, comprobar el documento, la identidad
   del movimiento, proveedor y número de remito. Completar solo campos vacíos;
   no reemplazar valores existentes ni mover/modificar los PDFs originales.

## Levantar el entorno de desarrollo (Windows / PowerShell)

**Problema:** ejecutar `npm run dev` o `next dev` en primer plano dentro del tool de shell hace que el
proceso se mate al terminar el comando o al alcanzar el timeout. El servidor aparece como "Ready",
responde un momento y luego se cae ("ERR_FAILED").

**Solución:** lanzar el servidor **desacoplado** con `Start-Process` para que sobreviva al cierre del
comando del shell.

### Comando directo (usar este)

```powershell
Start-Process -FilePath "cmd.exe" `
  -ArgumentList '/c npm run dev > dev.log 2>&1' `
  -WorkingDirectory "C:\AI\Antigravity\FALPAT srl\Stock" `
  -WindowStyle Hidden
```

### Verificar que quedó arriba

```powershell
Start-Sleep -Seconds 12
netstat -an | findstr ":3000" | findstr LISTENING
try { $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 20; "HTTP " + $r.StatusCode } catch { "ERROR: " + $_.Exception.Message }
```

Esperado:
- `TCP 0.0.0.0:3000 ... LISTENING`
- `HTTP 200`

### Ver logs

```powershell
Get-Content dev.log -Tail 40
```

### Detener el servidor

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Reglas a recordar en este entorno

- **NO** usar `&&`, `||`, `&` (background) ni `head` en los comandos de shell: es PowerShell 5.1 y fallan.
  Encadenar con `;` y condicionales con `if ($?) { ... }`.
- El timeout del tool **mata** el proceso en primer plano. Para servidores de larga duración usar
  siempre `Start-Process ... -WindowStyle Hidden` (como arriba).
- Si el puerto 3000 quedó ocupado/TIME_WAIT: matar node y relanzar.
- `dev*.log` ya está en `.gitignore`.

## Comandos del proyecto

- `npm run dev` — desarrollo (lanzar desacoplado, ver arriba)
- `npm run lint` — ESLint (warning preexistente de `useEffect` en `app/tickets/page.js`, no bloquea)
- `npm run build` / `npm start` / `npm run lan` (este último escucha en `0.0.0.0:3000`)
