@echo off
rem ---------------------------------------------------
rem Supabase setup script for Los Detallitos de Lupe
rem ---------------------------------------------------

rem Ensure Supabase CLI is installed (via npm).
rem If not installed, run: npm install -g supabase

rem 1) Login to Supabase (you will be prompted for a token).
npx supabase login

rem 2) Link the local project to your Supabase project ID.
npx supabase link --project-ref fosgcjxdfauykzyakwaz

rem 3) Push the database schema (supabase_schema.sql) to the remote DB.
npx supabase db push --linked

rem 4) Optional: Verify connection by running a simple query.
rem npx supabase db query "SELECT version();"

echo.
echo Supabase setup completed. Verify your Vercel environment variables for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
pause
