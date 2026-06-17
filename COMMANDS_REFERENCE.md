#!/usr/bin/env bash
# ============================================================================
# MPG Platform - Development Commands Reference
# ============================================================================
# This file documents all important commands and configurations
# ============================================================================

# ============================================================================
# 🚀 QUICK START COMMANDS
# ============================================================================

# Initial Setup
npm install                    # Install all dependencies

# Development
npm run dev                    # Start dev server (localhost:3000)

# Production
npm run build                  # Build for production
npm start                      # Start production server

# Testing & Validation
npm run lint                   # Run ESLint
npm run type-check            # Check TypeScript errors

# ============================================================================
# 🗂️ DIRECTORY STRUCTURE EXPLANATION
# ============================================================================

# app/                      - Next.js App Router pages
#   page.tsx              - Landing page (/)
#   layout.tsx            - Root layout with fonts
#   (auth)/               - Authentication route group
#     login/page.tsx      - Login page (/login)
#     register/page.tsx   - Register page (/register)
#     layout.tsx          - Auth layout with gradient
#   dashboard/            - Protected dashboard routes
#     page.tsx            - Main dashboard (/dashboard)
#     reports/page.tsx    - Reports page (/dashboard/reports)
#     layout.tsx          - Dashboard layout with nav

# components/               - Reusable React components
#   Navigation.tsx        - Top navbar with user menu
#   StatCard.tsx          - Metric/stat display card
#   ChartCard.tsx         - Chart container component

# lib/                      - Utility functions and configuration
#   supabase.ts           - Supabase client setup
#   authStore.ts          - Zustand auth state management
#   db.ts                 - Database helper functions

# types/                    - TypeScript type definitions
#   index.ts              - General app types
#   database.ts           - Database schema types

# styles/                   - Global styles
#   globals.css           - Global styles + glassmorphism

# public/                   - Static assets (images, etc.)

# ============================================================================
# 🔧 ENVIRONMENT SETUP
# ============================================================================

# 1. Copy environment template
cp .env.local.example .env.local

# 2. Edit .env.local with your values:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# NEXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================================================
# 🗄️ DATABASE SETUP (SUPABASE)
# ============================================================================

# 1. Create project at https://app.supabase.com
# 2. Go to SQL Editor
# 3. Copy all content from DATABASE_SETUP.sql
# 4. Paste and execute in SQL Editor
# 5. This creates:
#    - users table
#    - reports table
#    - analytics table
#    - audit_logs table
#    - RLS policies
#    - Triggers and functions

# ============================================================================
# 📝 KEY FILES TO EDIT
# ============================================================================

# Landing Page
# → app/page.tsx
#   - Update hero text
#   - Change feature descriptions
#   - Update company info
#   - Add your logo/images

# Authentication
# → app/(auth)/login/page.tsx      - Customize login flow
# → app/(auth)/register/page.tsx   - Customize registration

# Dashboard
# → app/dashboard/page.tsx         - Add real metrics
# → app/dashboard/reports/page.tsx - Connect reports data

# Components
# → components/Navigation.tsx      - Customize navbar
# → components/StatCard.tsx        - Adjust card styling
# → components/ChartCard.tsx       - Configure charts

# Design System
# → tailwind.config.js             - Update colors/spacing
# → styles/globals.css             - Add custom styles
# → app/layout.tsx                 - Add metadata/fonts

# ============================================================================
# 🎨 DESIGN SYSTEM CUSTOMIZATION
# ============================================================================

# Colors are defined in tailwind.config.js:
# - primary: #afc6ff (main brand color)
# - primary-container: #34518d (darker variant)
# - surface: #0b1326 (dark background)
# - on-surface: #dae2fd (light text)

# To change colors globally:
# 1. Edit tailwind.config.js colors object
# 2. All components use Tailwind utility classes
# 3. CSS will regenerate on save

# To add glassmorphism to elements:
# <div class="glass-effect glass-effect-hover rounded-xl p-6">
#   Frosted glass card
# </div>

# ============================================================================
# 🔌 ADDING DATABASE FUNCTIONS
# ============================================================================

# All DB functions are in lib/db.ts

# Example usage:
# import { getUserReports, createReport } from '@/lib/db'

# const reports = await getUserReports(userId)
# const newReport = await createReport(userId, 'Title', data)
# await deleteReport(reportId)

# ============================================================================
# 📊 WORKING WITH CHARTS
# ============================================================================

# Charts use Chart.js + React wrapper
# Component: components/ChartCard.tsx

# Add chart to page:
# import ChartCard from '@/components/ChartCard'

# <ChartCard
#   title="Revenue"
#   description="Monthly trend"
#   data={[100, 200, 300]}
#   labels={['Jan', 'Feb', 'Mar']}
#   type="line"
# />

# Chart types: 'line', 'doughnut', 'bar' (extensible)

# ============================================================================
# 🚢 DEPLOYMENT
# ============================================================================

# Vercel (Recommended)
# 1. Push code to GitHub
# 2. Connect repo to Vercel
# 3. Add environment variables
# 4. Deploy button

# Docker
docker build -t mpg-platform .
docker run -p 3000:3000 mpg-platform

# Docker Compose
docker-compose up

# Manual VPS
npm run build
npm start

# ============================================================================
# 🧪 TESTING LOGIN FLOW
# ============================================================================

# 1. Start dev server: npm run dev
# 2. Visit http://localhost:3000
# 3. Click "Sign up" button
# 4. Enter credentials:
#    - Email: test@example.com
#    - Password: Test123!
#    - Company: Test Corp
# 5. Check email confirmation (if enabled)
# 6. Go to login page
# 7. Use same credentials to login
# 8. Should redirect to dashboard

# ============================================================================
# 🐛 DEBUGGING TIPS
# ============================================================================

# Check Supabase connection:
# 1. Open browser DevTools (F12)
# 2. Check Console for errors
# 3. Look for Supabase API errors

# TypeScript errors:
npm run type-check

# ESLint warnings:
npm run lint

# View Next.js build output:
npm run build

# Check environment variables are loaded:
# Add this in a component:
# console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)

# ============================================================================
# 📦 ADDING PACKAGES
# ============================================================================

# Install new package
npm install package-name

# Install dev dependency
npm install --save-dev package-name

# Common useful packages:
npm install react-table           # Data tables
npm install react-hook-form       # Better forms
npm install swr                   # Data fetching
npm install framer-motion         # Animations
npm install react-hot-toast       # Notifications

# ============================================================================
# 🔄 GIT COMMANDS
# ============================================================================

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: MPG Analytics Platform"

# Add remote
git remote add origin https://github.com/yourname/mpg-platform.git

# Push to GitHub
git push -u origin main

# ============================================================================
# 🎯 COMMON TASKS
# ============================================================================

# Add a new page:
# 1. Create file: app/dashboard/new-page/page.tsx
# 2. Add React component
# 3. Next.js automatically creates route

# Add a new component:
# 1. Create file: components/MyComponent.tsx
# 2. Export React component
# 3. Import in pages

# Add API route:
# 1. Create file: app/api/reports/route.ts
# 2. Export GET, POST, PUT, DELETE handlers
# 3. Supabase routes are available at /api/...

# Update database schema:
# 1. Go to Supabase SQL Editor
# 2. Write migration SQL
# 3. Execute
# 4. Update types/database.ts if needed

# ============================================================================
# 💾 BACKUP & MAINTENANCE
# ============================================================================

# Backup database:
# Go to Supabase → Backups → Create backup

# Export database:
# Supabase → SQL Editor → Use pg_dump

# Clear Next.js cache:
rm -rf .next

# Clean node_modules:
rm -rf node_modules
npm install

# ============================================================================
# 📊 PERFORMANCE MONITORING
# ============================================================================

# Vercel Dashboard
# → Monitor build times, deployment health, analytics

# Supabase Dashboard
# → Monitor database usage, API statistics, logs

# Browser DevTools
# → Network tab: Check API response times
# → Performance: Measure page load performance
# → Console: Check for errors

# ============================================================================
# 🆘 QUICK FIXES
# ============================================================================

# Port 3000 already in use:
npm run dev -- -p 3001

# Styles not updating:
rm -rf .next
npm run dev

# Database connection failing:
# 1. Check .env.local has correct URL/keys
# 2. Verify Supabase project is running
# 3. Check network connectivity
# 4. Clear browser cache

# Build errors:
npm run type-check    # Check TypeScript
npm run lint          # Check ESLint
npm run build         # See full build output

# ============================================================================
# 📚 ADDITIONAL RESOURCES
# ============================================================================

# Documentation files in this project:
# - README.md          → Full setup & features guide
# - QUICKSTART.md      → 5-minute setup
# - SETUP_CHECKLIST.md → Complete checklist
# - DATABASE_SETUP.sql → Database schema
# - This file          → Commands reference

# External docs:
# - Next.js: https://nextjs.org/docs
# - Supabase: https://supabase.com/docs
# - Tailwind: https://tailwindcss.com/docs
# - TypeScript: https://www.typescriptlang.org/docs

# ============================================================================
# ✅ YOU'RE ALL SET!
# ============================================================================
# 
# To get started:
# 1. npm install
# 2. npm run dev
# 3. Visit http://localhost:3000
#
# Questions? Check the documentation files first!
#
# ============================================================================
