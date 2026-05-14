# Masterpiece Group Analytics Platform

A modern, enterprise-grade analytics and reporting platform built for Masterpiece Group Philippines. Features real-time dashboards, comprehensive reports, and secure authentication powered by Supabase.

## 🎨 Design System

The platform implements the **Crystal Finance System** - a glassmorphism design with:
- Dark mode theme with premium aesthetic
- Custom color palette (Primary: #afc6ff, Container: #34518d)
- Backdrop blur effects for depth
- Responsive typography (Hanken Grotesk + Inter)

## 🚀 Tech Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: Zustand
- **Charts**: Chart.js with React wrapper
- **Icons**: Lucide React

## 📋 Features

### Landing Page
- Hero section with brand messaging
- Feature highlights
- Call-to-action buttons
- Responsive navigation

### Authentication
- **Login Page**: Email/password with social options
- **Register Page**: Sign up with company info
- Password validation and error handling
- Session persistence

### Dashboard
- **Overview**: Key metrics and statistics
- **Analytics**: Real-time data visualization
- **Time range selector**: 7d, 30d, 90d views
- **Recent activity feed**: Transaction history

### Reports
- **Report library**: View all generated reports
- **Custom reports**: Create tailored reports
- **Export options**: PDF, Excel, CSV formats
- **Report management**: Download and organize

## 🛠️ Setup Instructions

### 1. Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account (free at https://supabase.com)

### 2. Install Dependencies

```bash
cd mpg-platform
npm install
```

### 3. Configure Supabase

#### Create a Supabase Project
1. Visit https://app.supabase.com and sign up/login
2. Create a new project
3. Go to Project Settings → API
4. Copy your `Project URL` and `Anon Key`

#### Setup Database Tables

Run these SQL queries in Supabase SQL Editor:

```sql
-- Users table (extends auth.users automatically)
create table if not exists public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  company text,
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Reports table
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  report_data jsonb,
  report_type text,
  export_format text default 'pdf',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Analytics data table
create table if not exists public.analytics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_name text not null,
  metric_value numeric,
  metric_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.users enable row level security;
alter table public.reports enable row level security;
alter table public.analytics enable row level security;

-- RLS Policies
create policy "Users can view own data" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own data" on public.users
  for update using (auth.uid() = id);

create policy "Users can view own reports" on public.reports
  for select using (auth.uid() = user_id);

create policy "Users can create reports" on public.reports
  for insert with check (auth.uid() = user_id);

create policy "Users can update own reports" on public.reports
  for update using (auth.uid() = user_id);

create policy "Users can delete own reports" on public.reports
  for delete using (auth.uid() = user_id);

create policy "Users can view own analytics" on public.analytics
  for select using (auth.uid() = user_id);
```

### 4. Environment Variables

Create `.env.local` file:

```bash
cp .env.local.example .env.local
```

Fill in the values:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📱 Project Structure

```
mpg-platform/
├── app/
│   ├── (auth)/              # Authentication routes
│   │   ├── login/
│   │   └── register/
│   ├── dashboard/           # Protected dashboard routes
│   │   ├── reports/
│   │   └── page.tsx
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing page
├── components/              # Reusable components
│   ├── Navigation.tsx
│   ├── StatCard.tsx
│   └── ChartCard.tsx
├── lib/
│   ├── supabase.ts         # Supabase client
│   └── authStore.ts        # Zustand auth store
├── styles/
│   └── globals.css         # Global styles & glassmorphism
├── public/                 # Static assets
├── tailwind.config.js      # Design tokens
├── tsconfig.json
└── package.json
```

## 🔐 Authentication Flow

1. **Register**: User signs up with email, password, and company info
2. **Verification**: Supabase sends verification email (optional)
3. **Login**: User logs in with credentials
4. **Session**: JWT token stored in browser (handled by Supabase)
5. **Protected Routes**: Dashboard requires valid session
6. **Logout**: Clears session and redirects to login

## 🎨 Design System Implementation

### Color Tokens
All colors defined in `tailwind.config.js`:
- `primary` / `on-primary`: Main brand colors
- `surface` / `on-surface`: Background and text
- `surface-container-*`: Layered backgrounds
- `outline` / `outline-variant`: Borders

### Glassmorphism Utility
```html
<div class="glass-effect glass-effect-hover">
  Frosted glass card with hover effects
</div>
```

### Custom Typography
- `font-hanken`: Headlines (Hanken Grotesk)
- `font-inter`: Body text (Inter)
- Size classes: `text-display-lg`, `text-headline-md`, etc.

## 🚀 Deployment

### Vercel (Recommended)
```bash
vercel
```

### Docker
```bash
docker build -t mpg-platform .
docker run -p 3000:3000 mpg-platform
```

### Manual Build
```bash
npm run build
npm start
```

## 📊 Adding Charts

The platform uses Chart.js. To add a new chart:

```tsx
import ChartCard from '@/components/ChartCard'

<ChartCard
  title="Chart Title"
  description="Description"
  data={[10, 20, 30, 40]}
  labels={['Q1', 'Q2', 'Q3', 'Q4']}
  type="line" // or "doughnut"
/>
```

## 🔗 API Integration

All Supabase calls are in `lib/supabase.ts`. Example:

```typescript
const { data, error } = await supabase
  .from('reports')
  .select('*')
  .eq('user_id', userId)
```

## 🐛 Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` exists with correct URLs and keys
- Keys are case-sensitive

### Login not working
- Check Supabase auth settings
- Verify email is confirmed (if required)
- Clear browser cache and cookies

### Charts not displaying
- Ensure Chart.js is installed: `npm list chart.js`
- Check browser console for errors

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Zustand](https://github.com/pmndrs/zustand)

## 📝 Company Information

**Masterpiece Group Philippines, Inc.**
- World-class English customer support with cost-effective pricing
- 1,200+ trained operators
- 650+ projects across Asia
- Global BPO Alliance member
- Multilingual services (English, Chinese, Japanese, Spanish)

## 📄 License

Proprietary - Masterpiece Group

## 🤝 Support

For issues or questions, contact support@mpg.com

---

**Version**: 1.0.0  
**Last Updated**: May 2026
