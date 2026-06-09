<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ede83a45-80ae-4e39-ad1e-c75db669ae97

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Conexion con Supabase

La app ya esta preparada para usar Supabase desde `src/lib/supabaseClient.ts`. Si las variables no estan completas, la app usa `localStorage` como respaldo.

### Datos que necesitas

Entra a tu proyecto en Supabase y busca:

1. `VITE_SUPABASE_URL`: Supabase Dashboard -> Project Settings -> Data API -> Project URL.
2. `VITE_SUPABASE_ANON_KEY`: Supabase Dashboard -> Project Settings -> API Keys -> anon public.

Pegalos en el archivo `.env`:

```env
VITE_SUPABASE_URL="https://fosgcjxdfauykzyakwaz.supabase.co"
VITE_SUPABASE_ANON_KEY="pega-aqui-tu-anon-public-key"
```

Importante: usa la clave `anon public`, no la `service_role`, porque esta app corre en el navegador.

### Crear las tablas

Antes de usar la app con Supabase, crea las tablas con `supabase_schema.sql`.

Opcion rapida desde Supabase:

1. Supabase Dashboard -> SQL Editor.
2. New query.
3. Pega todo el contenido de `supabase_schema.sql`.
4. Ejecuta `Run`.

Opcion con CLI:

```bash
scripts/setup_supabase.bat
```

Despues de cambiar `.env`, reinicia `npm run dev` para que Vite lea las variables nuevas.

## Despliegue en Vercel

El proyecto ya incluye `vercel.json` configurado para Vite:

- Framework: `vite`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Rewrite SPA: todas las rutas cargan `index.html`

### Variables de entorno en Vercel

En Vercel ve a Project Settings -> Environment Variables y crea estas variables para Production, Preview y Development:

```env
VITE_SUPABASE_URL="https://fosgcjxdfauykzyakwaz.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-public-key"
```

No subas ni pegues en Vercel la URL `postgresql://...` ni la clave `service_role`.

### Subir el proyecto

Opcion desde GitHub:

1. Sube este repo a GitHub.
2. En Vercel selecciona Add New -> Project.
3. Importa el repositorio.
4. Confirma que Vercel detecte Vite o usa la configuracion de `vercel.json`.
5. Agrega las variables de entorno.
6. Haz Deploy.

Opcion con Vercel CLI:

```bash
npx vercel
npx vercel --prod
```

Si cambias variables de entorno despues del primer deploy, haz Redeploy para que Vite las incluya en el build.
