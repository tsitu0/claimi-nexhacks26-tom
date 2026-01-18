# Claimly: AI-Powered Settlement Discovery & Autofill

## Project Overview
Claimly is an "agentic" platform for finding and filing class action settlements. It consists of a web dashboard and a Chrome Extension (Autofill Agent).

## Core Agent Architecture
1. **Discovery Agent**: Scours administrator sites to find new settlement URLs.
2. **Parsing Agent**: Converts legal text into structured JSON eligibility rules (dates, locations, products).
3. **Profile Interview Agent**: Asks the user minimal questions to fill in demographic/purchase gaps.
4. **Evidence Agent**: Scans user-uploaded documents (receipts, emails) to verify eligibility.
5. **Autofill Agent (Current Task)**: A browser extension that consumes a "Claim Packet" and populates official settlement forms.

## Autofill Agent Strategy
- **Input**: A JSON "Claim Packet" containing user data and inferred case answers.
- **Tier 1 (Direct)**: Matches fields by ID/Name/Autocomplete attributes.
- **Tier 2 (Fuzzy)**: Matches using `Fuse.js` to link field labels (e.g., "Mailing Address") to JSON keys.
- **Tier 3 (Agentic)**: If Tier 1 & 2 fail, uses a small LLM call to map DOM labels to user data.
- **UI**: Highlights filled fields; prompts user for missing data; stops before "Submit".

## Tech Stack
- **Dashboard**: Next.js 14/15, Tailwind, shadcn/ui.
- **Backend**: Supabase (Postgres, Auth, Storage).
- **Extension**: Chrome Manifest V3 (MV3), TypeScript.
- **Models**: Vercel AI SDK for agentic orchestration.

## Guiding Principle
"Human-in-the-loop": Automate the tedious work, but never auto-submit. Always let the user review.