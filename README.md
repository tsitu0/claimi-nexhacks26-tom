# Claimi

Claim filing platform that combines a web dashboard, AI agents, and a Chrome extension to discover settlements, qualify users, and autofill claim forms.

## Product summary
- Discovery -> Parsing -> Eligibility -> Claim filing workflow.
- Users complete onboarding once; answers are reused across claims.
- Eligibility is captured as structured question/answer pairs.
- Claim forms are opened and autofilled only after a submit + qualify step.
- Extension never auto-submits; user reviews before sending.

## Architecture and flow
```
Discovery bot -> settlements table
Logic bot -> parsed_requirements table (LLM parsing)
                |
                | (optional transform)
                v
Frontend -> parsed_settlements -> settlement_responses
                |
                v
Claim packet -> Extension -> Autofill UI
                |
                v
Backend /api/autofill/triage-fields (LLM-assisted field triage)
```

## Code map (what runs where)
- `frontend/` Next.js dashboard, onboarding, auth, settlement modal.
- `backend/` Express API with Supabase health check and LLM triage endpoint.
- `extension/` Chrome MV3 autofill agent with tiered matching.
- `discovery-bot/` Settlement intake agent (scrape + normalize).
- `logic-bot/` Requirement parser + onboarding question generator.

## Web app behavior (from the code)
Onboarding:
- `frontend/src/app/onboarding/page.js` writes to `profiles`.
- Stores legal name, contact info, street address, location, employment, and consent.
- Sets `onboarded = true` when complete.

Dashboard:
- `frontend/src/app/dashboard/page.js` reads `parsed_settlements`.
- Each settlement modal shows source URL, questions, and proof checklist.
- User answers are stored as `{ question, answer, section, key }` objects in `settlement_responses`.
- Claim form URL only appears after the user submits and qualifies.
- If the extension is installed, "Prepare claim for autofill" sends a claim packet.

Extension bridge:
- `extension/content/dashboard-bridge.js` listens for `claimi-claim-packet`.
- Uses `CustomEvent` to report `claimi-packet-stored` back to the dashboard.
- The dashboard waits for `claimi-bridge-ready` or `claimi-extension-ready`.

## Autofill extension (how it works)
- `extension/content/content.js` uses tiered matching with strict heuristics:
  - T0/T1: HTML semantics + exact matches.
  - T2: Fuse.js fuzzy label matching + MiniSearch BM25 for long labels.
  - T3: Optional LLM triage via backend API.
- Highlights filled fields and routes low-confidence fields to review UI.
- Does not auto-submit forms.

## Backend API
`backend/index.js` exposes:
- `GET /health` -> Supabase connectivity check.
- `POST /api/autofill/triage-fields` -> LLM field classification with fallback heuristics.

The extension calls `http://localhost:5171/api/autofill/triage-fields` by default.

## Supabase data model (core tables)
`profiles`
- `id` (uuid, auth.users)
- `legal_first_name`, `legal_last_name`, `email`, `phone_number`
- `street_address`, `city`, `state`, `zip_code`, `country`
- `date_of_birth`
- `employment_status`, `employment_type`, `occupation_category`
- `preferred_contact_method`, `payout_preference`
- `terms_accepted`, `privacy_policy_accepted`
- `ethnicity`, `gender_identity`, `disability_status`
- `onboarded` (bool)

`parsed_settlements` (used by dashboard)
- `id`, `settlement_id`, `settlement_title`
- `source_url`, `claim_form_url`
- `general_requirements`, `specific_requirements`
- `onboarding_questions`, `proof_checklist`
- `parsing_confidence`, `parsing_notes`
- `created_at`, `updated_at`

`settlement_responses`
- `user_id` (uuid, auth.users)
- `settlement_key` (text)
- `settlement_record_id`, `settlement_external_id`
- `answers` (jsonb array of question/answer objects)
- `eligibility_status`, `submitted_at`

Discovery/logic bots use:
- `settlements` (discovery-bot output)
- `parsed_requirements` (logic-bot output)

If you want the dashboard to read logic-bot output directly, align schemas or add a view to map `parsed_requirements` -> `parsed_settlements`.

## Local development
Install deps:
```bash
cd backend && npm install
cd ../frontend && npm install
```

Env:
`backend/.env`
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=optional_for_triage
PORT=5171
```

`frontend/.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:5171
```

Run:
```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

Next.js runs on `http://localhost:3001` (see `frontend/package.json`).

Optional services:
- `discovery-bot` (default port 3000)
- `logic-bot` (default port 3001; change to avoid conflict with frontend)

## Auth setup (Supabase)
Enable Google provider and add redirect URLs:
```
http://localhost:3001/auth/callback
```

## RLS notes
- `parsed_settlements` needs a `SELECT` policy for `anon`/`authenticated`.
- `settlement_responses` needs policies that allow users to read/write their own rows.

## Extension setup
See `extension/README.md` for install steps and testing guidance.
