# Configuracion para Render

Esta guia explica como desplegar la aplicacion en Render y que variables de entorno debes definir para que el frontend, la API y el login funcionen correctamente.

## Tipo de servicio

Este proyecto debe desplegarse como `Web Service`.

No lo despliegues como `Static Site`, porque la aplicacion necesita ejecutar `server/index.js` para:

- servir el frontend construido con Vite
- exponer la API en `/api/*`
- crear y validar la sesion de usuario
- conectarse a PostgreSQL

## Comandos recomendados

- Build Command: `npm install && npm run build`
- Start Command: `npm run server`

No uses `npm run dev` en Render.

## Variables requeridas

Define estas variables en la seccion `Environment` del servicio:

```env
VITE_AZURE_CLIENT_ID=tu-azure-client-id
VITE_AZURE_TENANT_ID=tu-azure-tenant-id
VITE_GOOGLE_CLIENT_ID=tu-google-client-id.apps.googleusercontent.com
VITE_SHAREPOINT_SITE_URL=https://tu-tenant.sharepoint.com/sites/tu-sitio
VITE_AUTH_REDIRECT_URI=https://tu-app.onrender.com
VITE_AUTH_POST_LOGOUT_REDIRECT_URI=https://tu-app.onrender.com/login

APP_SESSION_SECRET=un-secreto-largo-y-unico

PGHOST=tu-host-postgres
PGPORT=5432
PGDATABASE=tu_base
PGUSER=tu_usuario
PGPASSWORD=tu_password
PGSSLMODE=require

STORAGE_API_URL=https://tu-storage-api.run.app
STORAGE_API_SECRET=tu-storage-api-secret
MAX_GASTO_ATTACHMENT_SIZE_MB=25
```

## Variables importantes

### `APP_SESSION_SECRET`

Esta variable es obligatoria en produccion.

El backend la usa para firmar la cookie de sesion despues del login con Microsoft o Google. Si falta, el login OAuth puede autenticarse con el proveedor, pero fallara al intentar crear la sesion local con este error:

`APP_SESSION_SECRET no esta configurado en el backend.`

Valor recomendado:

- una cadena aleatoria de al menos 32 caracteres
- idealmente 64 caracteres o mas
- no reutilizar una clave antigua o compartida entre proyectos

Ejemplo de valor valido:

```env
APP_SESSION_SECRET=8a2c4f2f7f764e6a8d7d4c9c55f1b067a63f1a7d9f9a31c2d9d6b7f4a1c8e5b2
```

Si quieres generar una clave localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Configuracion de login

### Microsoft / Azure AD

En Azure Portal, agrega estas Redirect URIs en la aplicacion registrada:

- `https://tu-app.onrender.com`
- `https://tu-app.onrender.com/login`

Si tu dominio es `https://gestion-integral-pyme.onrender.com`, entonces agrega exactamente:

- `https://gestion-integral-pyme.onrender.com`
- `https://gestion-integral-pyme.onrender.com/login`

### Google

En Google Cloud Console, para tu OAuth Client ID tipo `Web application`, agrega este origin en `Authorized JavaScript origins`:

- `https://tu-app.onrender.com`

Si tu dominio es `https://gestion-integral-pyme.onrender.com`, agrega exactamente:

- `https://gestion-integral-pyme.onrender.com`

## Configuracion de base de datos

Si PostgreSQL esta fuera de Render y usa allowlist por IP, debes autorizar las IPs de salida del servicio en tu proveedor de base de datos.

En tu caso, Render te entrego:

- `74.220.48.0/24`
- `74.220.56.0/24`

Si usas Google Cloud SQL, agregalas en:

`Cloud SQL > tu instancia > Connections > Authorized networks`

## Checklist rapido

Antes de probar el login en produccion, verifica:

- el servicio es `Web Service`
- el comando de inicio es `npm run server`
- `APP_SESSION_SECRET` existe en Render
- la base de datos acepta conexiones desde las IPs de salida de Render
- `PGSSLMODE=require`
- Azure tiene las Redirect URIs correctas
- Google tiene el Authorized JavaScript Origin correcto

## Problemas comunes

### `APP_SESSION_SECRET no esta configurado en el backend`

Falta crear la variable `APP_SESSION_SECRET` en Render.

Solucion:

1. Abre tu servicio en Render
2. Ve a `Environment`
3. Agrega `APP_SESSION_SECRET`
4. Guarda los cambios
5. Haz un redeploy o reinicia el servicio

### `AADSTS50011 redirect URI mismatch`

La URI enviada desde la app no coincide con la configurada en Azure AD.

Revisa:

- `VITE_AUTH_REDIRECT_URI`
- `VITE_AUTH_POST_LOGOUT_REDIRECT_URI`
- Redirect URIs registradas en Azure Portal

### `connect ETIMEDOUT ...:5432`

Render no logra llegar a PostgreSQL.

Revisa:

- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- que la instancia tenga acceso publico si estas usando IP publica
- que la allowlist de la base incluya las IPs de salida de Render
- que `PGSSLMODE=require`
