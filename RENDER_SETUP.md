# Configuración para Render

Esta guía explica cómo configurar las variables de entorno en Render para desplegar la aplicación.

## Variables de Entorno Requeridas

La aplicación necesita las siguientes variables de entorno:

1. **VITE_AZURE_CLIENT_ID**: ID de cliente de la aplicación registrada en Azure AD
2. **VITE_AZURE_TENANT_ID**: ID del tenant de Azure AD
3. **VITE_SHAREPOINT_SITE_URL**: URL completa del sitio de SharePoint

## Cómo Configurar en Render

### Paso 1: Crear un Nuevo Servicio

1. Ve a tu dashboard de Render
2. Haz clic en **"New +"** y selecciona **"Web Service"**

Importante:

- Este proyecto no es un sitio estatico puro. Usa Vite para construir el frontend y `server/index.js` para servir la app y la API.
- Si configuras el servicio manualmente, el comando de inicio debe ser `npm run server` o `npm start`.
- No uses `npm run dev` en Render.

### Paso 2: Conectar el Repositorio

1. Conecta tu repositorio de GitHub/GitLab
2. Selecciona la rama que quieres desplegar (normalmente `main` o `master`)

### Paso 3: Configurar Build e Inicio

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run server`

### Paso 4: Configurar Variables de Entorno

En la sección **"Environment"** del servicio, agrega las siguientes variables:

```
VITE_AZURE_CLIENT_ID=tu-client-id-aqui
VITE_AZURE_TENANT_ID=tu-tenant-id-aqui
VITE_SHAREPOINT_SITE_URL=https://tu-tenant.sharepoint.com/sites/tu-sitio
```

**Importante**: Reemplaza los valores con tus propios valores reales:
- `tu-client-id-aqui`: Tu Client ID de Azure AD
- `tu-tenant-id-aqui`: Tu Tenant ID de Azure AD
- `tu-tenant.sharepoint.com/sites/tu-sitio`: La URL de tu sitio de SharePoint

### Paso 5: Configurar Redirect URIs en Azure AD

Después de desplegar en Render, necesitarás agregar la URL de producción a los Redirect URIs en Azure Portal:

1. Ve a [Azure Portal](https://portal.azure.com)
2. Navega a **Azure Active Directory** > **App registrations** > Tu aplicación
3. Ve a **Authentication**
4. En **Redirect URIs**, agrega:
   - `https://tu-app.onrender.com` (o la URL que Render te haya asignado)
   - `https://tu-app.onrender.com/` (con barra final)

### Paso 6: Desplegar

1. Haz clic en **"Create Static Site"** o **"Save Changes"**
2. Render comenzará a construir y desplegar tu aplicación
3. Una vez completado, tu aplicación estará disponible en la URL proporcionada por Render

## Obtener los Valores de las Variables

### VITE_AZURE_CLIENT_ID y VITE_AZURE_TENANT_ID

1. Ve a [Azure Portal](https://portal.azure.com)
2. Navega a **Azure Active Directory** > **App registrations**
3. Selecciona tu aplicación (o crea una nueva)
4. En la página **Overview**, encontrarás:
   - **Application (client) ID**: Este es tu `VITE_AZURE_CLIENT_ID`
   - **Directory (tenant) ID**: Este es tu `VITE_AZURE_TENANT_ID`

### VITE_SHAREPOINT_SITE_URL

Esta es la URL completa de tu sitio de SharePoint, por ejemplo:
- `https://rekosolcl.sharepoint.com/sites/REKOSOL-GESTIONDEGASTOS`

## Verificación

Después de desplegar, verifica que:

1. La aplicación carga correctamente
2. El botón "Iniciar Sesión" funciona
3. Puedes autenticarte con tu cuenta de Office 365
4. Los datos se cargan desde SharePoint

## Solución de Problemas

### Error: "Faltan las variables de entorno"

- Verifica que todas las variables estén configuradas en Render
- Asegúrate de que los nombres de las variables sean exactamente como se muestran (con `VITE_` al inicio)
- Reinicia el servicio después de agregar las variables

### Error: "Redirect URI mismatch"

- Verifica que hayas agregado la URL de Render a los Redirect URIs en Azure Portal
- Asegúrate de que la URL sea exactamente la misma (con o sin barra final según lo configurado)

### Error: "No se pudo obtener el Site ID"

- Verifica que `VITE_SHAREPOINT_SITE_URL` sea la URL completa del sitio
- Asegúrate de que tengas acceso al sitio de SharePoint

## Google Login

Para habilitar tambien el acceso con Google agrega esta variable de entorno:

```env
VITE_GOOGLE_CLIENT_ID=tu-google-client-id.apps.googleusercontent.com
```

Configuracion recomendada en Google Cloud Console:

1. Crea un OAuth Client ID para tipo **Web application**.
2. Agrega los **Authorized JavaScript Origins** de local y produccion.
3. Usa solo identidad para login; no agregues scopes extra de Google APIs.

Ejemplos de origins:

- `http://localhost:3001`
- `https://tu-app.onrender.com`

