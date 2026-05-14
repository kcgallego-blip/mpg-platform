@echo off
REM MPG Platform Setup Script for Windows
REM This script helps set up the Supabase project and environment variables

echo.
echo 🚀 Masterpiece Group Analytics Platform Setup
echo =============================================
echo.

REM Check if .env.local exists
if not exist .env.local (
  echo 📋 Creating .env.local from template...
  copy .env.local.example .env.local
  echo ✅ .env.local created. Please edit it with your Supabase credentials.
) else (
  echo ✅ .env.local already exists
)

echo.
echo 📦 Installing dependencies...
call npm install

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Create a Supabase project at https://app.supabase.com
echo 2. Copy your Project URL and Anon Key
echo 3. Edit .env.local with your credentials
echo 4. Run the SQL migrations in Supabase SQL Editor (see README.md)
echo 5. Start the dev server: npm run dev
echo.
pause
