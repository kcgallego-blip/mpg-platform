# Masterpiece Group Analytics Platform - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Create Supabase Project (2 minutes)
1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in project details
4. Wait for initialization

### Step 2: Get Your Credentials (1 minute)
1. Go to Settings → API
2. Copy **Project URL**
3. Copy **Anon Key**

### Step 3: Configure Environment (1 minute)
```bash
# Copy template
cp .env.local.example .env.local

# Edit .env.local with your credentials
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

### Step 4: Setup Database (1 minute)
1. In Supabase, go to SQL Editor
2. Copy all code from `DATABASE_SETUP.sql`
3. Paste and execute

### Step 5: Run Development Server
```bash
npm install
npm run dev
```

Visit `http://localhost:3000` 🚀

## 🧪 Test Credentials

After setup, you can test the app:

**Register:**
- Email: `test@example.com`
- Password: `Test123!`
- Company: `Test Corp`

**Login:**
- Use the same credentials

## 📂 Key Files to Know

| File | Purpose |
|------|---------|
| `.env.local` | Your Supabase keys |
| `DATABASE_SETUP.sql` | Database schema |
| `app/page.tsx` | Landing page |
| `app/(auth)/` | Login & register |
| `app/dashboard/` | Protected dashboard |
| `lib/authStore.ts` | Auth logic |
| `lib/db.ts` | Database functions |
| `tailwind.config.js` | Design system tokens |

## 🎨 Design System Highlights

- **Colors**: Dark blue theme (#0b1326 background)
- **Typography**: Hanken Grotesk (headers) + Inter (body)
- **Components**: Glass-effect cards with blur effects
- **Responsive**: Mobile-first design

## 🔑 Core Features

✅ **Landing Page** - Hero, features, CTA  
✅ **Authentication** - Secure login/register  
✅ **Dashboard** - Real-time analytics & stats  
✅ **Reports** - Generate & manage reports  
✅ **Charts** - Data visualization  
✅ **Responsive** - Mobile & desktop  

## 🚀 Deploy to Vercel

```bash
vercel
```

Follow prompts, add environment variables, done!

## 🆘 Troubleshooting

**"Supabase environment variables missing"**
- Check `.env.local` exists and has correct URLs

**"Login not working"**
- Verify Supabase project is created
- Check auth is enabled in Supabase

**"Port 3000 already in use"**
```bash
npm run dev -- -p 3001
```

## 📚 Next Steps

1. ✅ Customize company info in landing page
2. ✅ Add real data sources to dashboard
3. ✅ Connect actual analytics endpoints
4. ✅ Set up email notifications
5. ✅ Deploy to production

## 📖 Documentation

- **Full Setup**: See `README.md`
- **Database**: See `DATABASE_SETUP.sql`
- **Types**: See `types/database.ts`
- **DB Functions**: See `lib/db.ts`

## 🎯 What's Included

```
✅ Modern Next.js 15 setup
✅ TypeScript for type safety
✅ Tailwind CSS with custom design
✅ Supabase authentication
✅ PostgreSQL database
✅ Real-time updates capable
✅ Responsive design
✅ Landing page
✅ Authentication pages
✅ Dashboard with charts
✅ Reports system
✅ Audit logging
✅ Row-level security
✅ Docker support
```

---

**Ready to launch?** Start with: `npm run dev`
