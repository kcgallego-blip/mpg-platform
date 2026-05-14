-- Create users table for Webex OAuth
CREATE TABLE IF NOT EXISTS public.users (
  email TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  access TEXT,
  avatar_image TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own data
CREATE POLICY "Users can read their own data"
  ON public.users
  FOR SELECT
  USING (auth.uid() = (SELECT id FROM auth.users WHERE email = users.email));

-- Create policy to allow service role to manage users
CREATE POLICY "Service role can manage users"
  ON public.users
  USING (current_setting('role') = 'authenticated');
