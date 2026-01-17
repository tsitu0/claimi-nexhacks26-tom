# claimi-nexhacks26

Simple React + Express starter with a Supabase health check.

## Structure
- `frontend/` Vite React app
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

`frontend/.env`
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=http://localhost:5171
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

Open the frontend dev server URL. If the backend + Supabase are reachable, the UI will show "API OK".
