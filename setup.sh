#!/bin/bash

# MPG Platform Setup Script
# This script helps set up the Supabase project and environment variables

echo "🚀 Masterpiece Group Analytics Platform Setup"
echo "=============================================="
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "📋 Creating .env.local from template..."
  cp .env.local.example .env.local
  echo "✅ .env.local created. Please edit it with your Supabase credentials."
else
  echo "✅ .env.local already exists"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a Supabase project at https://app.supabase.com"
echo "2. Copy your Project URL and Anon Key"
echo "3. Edit .env.local with your credentials"
echo "4. Run the SQL migrations in Supabase SQL Editor (see README.md)"
echo "5. Start the dev server: npm run dev"
echo ""
