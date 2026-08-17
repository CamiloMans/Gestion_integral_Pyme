# Rekosol - guia operativa para agentes

## Ruta rapida obligatoria

Usar este orden para levantar y abrir la aplicacion. No comenzar intentando Google OAuth ni abrir la IP de Cloud SQL en el navegador.

1. Comprobar si la aplicacion ya esta ejecutandose:

   ```powershell
   Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3002/'
   ```

2. Si no responde, iniciarla desde la raiz del repositorio con `npm run dev`. No iniciar una segunda copia si el puerto `3002` ya esta ocupado, porque el servidor puede elegir otro puerto automaticamente.
3. Esperar y validar el backend:

   ```powershell
   Invoke-RestMethod -Uri 'http://127.0.0.1:3002/api/health'
   ```

4. Continuar solo cuando `/api/health` responda `200` y `{"ok":true}`. Si devuelve `Connection terminated due to connection timeout`, aplicar el procedimiento de la seccion **Acceso a Cloud SQL**.
5. Para trabajar dentro de Cursor, abrir o reutilizar su navegador integrado en `http://localhost:3002/`. Con `DEV_AUTH_BYPASS=true` y la base disponible, una recarga completa debe crear la sesion local y redirigir a `http://localhost:3002/reportes` como **Camilo Mansilla - Rekosol**.
6. Confirmar que el Dashboard muestra datos antes de empezar a modificar la aplicacion.

## Ejecutar el proyecto

- Instalar dependencias con `npm install` si `node_modules` no existe.
- Iniciar la aplicacion con `npm run dev`.
- El puerto esperado es `3002` (variable `PORT` de `.env`).
- El servidor escucha en `0.0.0.0`, por lo que se puede abrir desde el mismo equipo o desde la red local.
- URL local: `http://127.0.0.1:3002/`.
- URL por LAN: obtener primero la IPv4 activa del adaptador Wi-Fi y abrir `http://<IP_LAN>:3002/`.

Comando PowerShell para obtener la IP LAN:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress
```

No confundir la IP LAN de la aplicacion con la IP publica de Cloud SQL.

## Google Cloud SQL

- Proyecto: `manso-492902`.
- Instancia: `manso-dev-pg`.
- Region: `southamerica-west1`.
- IP publica de PostgreSQL: `34.176.181.203`.
- Base usada por este proyecto: `gestion_integral_dev`.
- No guardar usuarios, contrasenas ni claves de API en este archivo.

Redes actualmente autorizadas en Cloud SQL:

```text
186.106.84.73/32
186.106.2.66/32
186.106.76.189        # IP individual; equivale a /32
74.220.56.0/24
186.106.6.162/32
201.219.236.187       # IP individual; equivale a /32
74.220.48.0/24
186.106.89.140/32
186.106.95.42/32
```

Estas redes permiten conectarse a PostgreSQL; no son URLs para abrir la aplicacion en el navegador.

## Acceso a Cloud SQL

1. Obtener la IP publica actual:

   ```powershell
   (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
   ```

2. Compararla con la lista anterior. Una IP individual debe coincidir exactamente; una red `/24` acepta cualquier IP cuyos primeros tres octetos pertenezcan a esa red.
3. Si no coincide, la interfaz puede cargar pero `/api/health` devolvera un error de conexion a PostgreSQL.
4. No modificar las redes autorizadas de Google Cloud sin aprobacion explicita del usuario. Si falta la IP actual, informar la IP detectada y proponer agregarla como `<IP>/32`.

La cuenta activa de `gcloud` puede ser otra. Para esta instancia, especificar siempre:

```text
--project=manso-492902
--account=camilomansillaulloa@gmail.com
```

Importante: `gcloud sql instances patch --authorized-networks` reemplaza la lista completa. Nunca enviar solamente la IP nueva. Despues de recibir aprobacion explicita, leer la configuracion actual, agregar la IP sin duplicados y enviar la lista completa:

```powershell
$publicIp = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
$instance = gcloud sql instances describe manso-dev-pg `
  --project=manso-492902 `
  --account=camilomansillaulloa@gmail.com `
  --format=json | ConvertFrom-Json
$networks = @($instance.settings.ipConfiguration.authorizedNetworks | ForEach-Object { $_.value })
$newNetwork = "$publicIp/32"
if ($networks -notcontains $newNetwork) { $networks += $newNetwork }
$networkArgument = '--authorized-networks=' + ($networks -join ',')
gcloud sql instances patch manso-dev-pg `
  --project=manso-492902 `
  --account=camilomansillaulloa@gmail.com `
  $networkArgument `
  --quiet
```

Esperar a que el patch finalice y volver a probar `/api/health`. Un resultado comprobado y correcto tiene esta forma:

```json
{"ok":true,"tenant":{"slug":"rekosol","nombre":"Rekosol"}}
```

Comprobaciones utiles:

```powershell
Test-NetConnection -ComputerName 34.176.181.203 -Port 5432
Invoke-RestMethod -Uri 'http://127.0.0.1:3002/api/health'
```

Consulta de solo lectura de la configuracion real en Google Cloud:

```powershell
gcloud sql instances describe manso-dev-pg `
  --project=manso-492902 `
  --account=camilomansillaulloa@gmail.com `
  --format='yaml(ipAddresses,settings.ipConfiguration.authorizedNetworks,state)'
```

## Acceso en el navegador

- Para desarrollo en el mismo equipo, preferir `http://localhost:3002/`. Usar la IP LAN solamente cuando se necesite entrar desde otro dispositivo.
- En el navegador integrado de Cursor, Google Identity Services puede abrir pestañas `Sign In - Google Accounts` vacias o volver a `/login`. No insistir con esas pestañas: primero verificar `/api/health` y luego hacer **Hard reload** sobre la pestaña de Rekosol. Con `DEV_AUTH_BYPASS=true`, debe entrar directamente a `/reportes`.
- En Chrome, la seleccion de la cuenta `camilomansillaulloa@gmail.com` funciona cuando Cloud SQL acepta la conexion. La URL `https://accounts.google.com/gsi/transform` es una ruta interna normal de Google y no debe abrirse manualmente.
- Si se requiere comprobar OAuth real, usar Chrome con el origen `http://localhost:3002`, no el navegador integrado de Cursor.
- En este equipo, la IP LAN puede cambiar al reconectarse al Wi-Fi; no asumir que siempre es la misma. Si cambia la IP LAN y se usa OAuth desde ella, comprobar tambien los origenes JavaScript autorizados del cliente OAuth.
- `DEV_AUTH_BYPASS=true` no corrige una conexion bloqueada a Cloud SQL: la base debe responder antes de que la sesion local pueda crearse.

## Diagnostico aprendido

- Sintoma: la pagina de login carga, pero aparece `Connection terminated due to connection timeout`.
- Causa comprobada: la IP publica del equipo no esta en las redes autorizadas de `manso-dev-pg`.
- Google OAuth puede completar la seleccion de cuenta y fallar despues al intercambiar la credencial; ese error sigue siendo de PostgreSQL, no de `gsi/transform`.
- La IP `34.176.181.203` es el servidor PostgreSQL. No sirve para abrir la interfaz web.
- Las redes `186.*` y `74.220.*` autorizan el origen de conexiones hacia PostgreSQL. Tampoco son URLs de la aplicacion ni IP que el codigo pueda escoger o suplantar.
