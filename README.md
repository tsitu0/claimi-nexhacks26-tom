# Claimi

Next.js + Express starter with a Supabase health check and Claimi landing page.

## Structure
- `frontend/` Next.js app
- `backend/` Express API (`/health`)

## Prereqs
- Node.js 18+
- A Supabase project (URL + anon key + service role key)

## Setup
1) Install dependencies
```bash
cd backend
npm install
cd ../frontend
npm install
```

2) Env files

`backend/.env`
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=5171
```

`frontend/.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:5171
```

## Run
```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

Open the frontend dev server URL. If the backend + Supabase are reachable, the UI will show "Supabase connected".

## Auth setup
1) In Supabase, enable Google provider and set the redirect URL:
```
http://localhost:3000/auth/callback
```

2) Create a `profiles` table and RLS policies:
```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;

create policy "Profiles are viewable by owner"
  on profiles for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on profiles for update
  using (auth.uid() = id);
```
