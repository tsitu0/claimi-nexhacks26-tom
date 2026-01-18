# Claimi

Claim filing platform that pairs a web dashboard with AI agents and a browser extension to discover settlements, assess eligibility, and autofill claim forms.

## What it does
- Finds and parses settlement opportunities into structured requirements.
- Guides users through onboarding and eligibility questions.
- Saves yes/no answers and eligibility outcomes per settlement.
- Opens the claim form only after a successful eligibility submit.
- Autofills claim forms via a Chrome extension (human-in-the-loop).

## System components
- `frontend/`: Next.js dashboard, onboarding, and auth.
- `backend/`: Express API (used for health checks and server-side helpers).
- `extension/`: Chrome MV3 autofill agent.
- `discovery-bot/`: discovers settlement sources.
- `logic-bot/`: parses requirements and generates onboarding questions.

## AI agents & extension
- Discovery Agent: finds settlement sources.
- Parsing Agent: turns legal text into structured requirements.
- Profile Interview Agent: gathers minimal user info.
- Evidence Agent: verifies documents against requirements.
- Autofill Agent (extension): maps a claim packet to live claim forms.

## Data model (Supabase)
Key tables used by the UI:
- `profiles`: user onboarding data and `onboarded` flag.
- `parsed_settlements`: structured settlement requirements with `source_url` and `claim_form_url`.
- `settlement_responses`: stored question/answer pairs and eligibility results per user.

## Prereqs
- Node.js 18+
- Supabase project (URL + anon key + service role key)

## Setup
1) Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
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
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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

Open the frontend dev server URL (Next.js runs on `http://localhost:3001`).

## Auth setup (Supabase)
Enable Google provider and add redirect URLs:
```
http://localhost:3001/auth/callback
```

## Notes on RLS
If settlements are not visible in the dashboard, ensure `parsed_settlements` has a `SELECT` policy (or disable RLS for development).

