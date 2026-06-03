-- ============================================================================
-- Masterpiece Group Analytics Platform - Supabase Database Schema
-- ============================================================================
-- Run these SQL queries in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE (extends auth.users)
-- ============================================================================

create table if not exists public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  company text,
  name text,
  role text default 'Agent',
  avatar_url text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.users is 'User profiles extended from auth.users';

-- ============================================================================
-- 2. REPORTS TABLE
-- ============================================================================

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  report_data jsonb,
  report_type text default 'performance',
  export_format text default 'pdf',
  file_url text,
  is_shared boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.reports is 'User-generated reports and analytics';

create index if not exists reports_user_id_idx on public.reports(user_id);
create index if not exists reports_created_at_idx on public.reports(created_at desc);

-- ============================================================================
-- 3. ANALYTICS DATA TABLE
-- ============================================================================

create table if not exists public.analytics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_name text not null,
  metric_value numeric,
  metric_category text,
  metric_date date default current_date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.analytics is 'Time-series analytics metrics data';

create index if not exists analytics_user_id_idx on public.analytics(user_id);
create index if not exists analytics_metric_date_idx on public.analytics(metric_date);
create index if not exists analytics_metric_name_idx on public.analytics(metric_name);

-- ============================================================================
-- 4. AUDIT LOG TABLE
-- ============================================================================

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.audit_logs is 'Audit trail for compliance and monitoring';

create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
alter table public.users enable row level security;
alter table public.reports enable row level security;
alter table public.analytics enable row level security;
alter table public.audit_logs enable row level security;

-- USERS POLICIES
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);

-- REPORTS POLICIES
create policy "Users can view own reports" on public.reports
  for select using (auth.uid() = user_id or is_shared = true);

create policy "Users can create reports" on public.reports
  for insert with check (auth.uid() = user_id);

create policy "Users can update own reports" on public.reports
  for update using (auth.uid() = user_id);

create policy "Users can delete own reports" on public.reports
  for delete using (auth.uid() = user_id);

-- ANALYTICS POLICIES
create policy "Users can view own analytics" on public.analytics
  for select using (auth.uid() = user_id);

create policy "Users can insert analytics" on public.analytics
  for insert with check (auth.uid() = user_id);

-- AUDIT LOGS POLICIES
create policy "Users can view own audit logs" on public.audit_logs
  for select using (auth.uid() = user_id);

-- ============================================================================
-- 6. FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_users_updated_at
  before update on public.users
  for each row
  execute function update_updated_at_column();

create trigger update_reports_updated_at
  before update on public.reports
  for each row
  execute function update_updated_at_column();

-- Function to create user profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name', 'Agent');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ============================================================================
-- 7. SAMPLE DATA (Optional - Remove in production)
-- ============================================================================

-- Note: This is sample data for development. Remove before production deployment.

-- Create a sample analytics data point
-- insert into public.analytics (user_id, metric_name, metric_value, metric_category)
-- values (auth.uid(), 'page_views', 1250, 'engagement');

-- ============================================================================
-- DONE!
-- ============================================================================
-- Your Supabase database is now configured.
-- You can now run the Next.js application with:
-- npm run dev
